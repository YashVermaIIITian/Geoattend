import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env.js';
import { AttendanceRecord, CheckIn, Class, Session, User, audit } from '../models/index.js';
import { checkinLimiter, requireAuth, requireRole, validate } from '../middleware/index.js';
import { ah, AppError, oid } from '../utils/errors.js';
import { evaluateFix } from '../services/geo.service.js';
import { detectFlags } from '../services/anomaly.service.js';
import { computeStatus } from '../services/attendance.service.js';
import { finalizeSession } from '../services/finalize.js';

const r = Router();
r.use(requireAuth);

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const newCode = () => Array.from({ length: 6 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');
const lim = { maxAccuracyM: env.MAX_ACCURACY_M, toleranceCapM: env.TOLERANCE_CAP_M };

const createSchema = z.object({
  classId: z.string(),
  center: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
  radiusM: z.number().min(5).max(1000),
  startsAt: z.coerce.date().optional(),
  durationMin: z.number().int().min(5).max(480),
  intervalMin: z.number().int().min(1).max(30).default(5),
  minPresencePct: z.number().min(1).max(100).default(75),
  graceMissed: z.number().int().min(0).max(10).default(1),
  lateAfterMin: z.number().int().min(0).max(120).default(10),
  requireFace: z.boolean().default(true),
});

r.post('/', requireRole('lecturer'), validate(createSchema), ah(async (req, res) => {
  const b = req.body;
  if (!(await Class.exists({ _id: oid(b.classId), lecturerId: req.user!.id }))) throw new AppError(404, 'CLASS_NOT_FOUND', 'Class not found');
  const startsAt: Date = b.startsAt ?? new Date();
  const endsAt = new Date(startsAt.getTime() + b.durationMin * 60_000);
  for (let tries = 0; tries < 5; tries++) {
    try {
      const { durationMin, ...rest } = b;
      const s = await Session.create({ ...rest, startsAt, endsAt, lecturerId: req.user!.id, joinCode: newCode() });
      await audit(req.user!.id, 'session.create', String(s._id));
      return res.status(201).json(s);
    } catch (e: any) { if (e?.code !== 11000) throw e; } // join-code collision: retry
  }
  throw new AppError(500, 'CODE_GEN', 'Could not generate a session code');
}));

r.get('/', requireRole('lecturer'), ah(async (req, res) => {
  res.json(await Session.find({ lecturerId: req.user!.id }).sort('-startsAt').limit(100).populate('classId', 'name'));
}));

// Student enters the code: returns only what the client needs to draw the map.
r.post('/join', requireRole('student'), validate(z.object({ code: z.string().trim().toUpperCase().length(6) })), ah(async (req, res) => {
  const s = await Session.findOne({ joinCode: req.body.code });
  const now = new Date();
  if (!s) throw new AppError(404, 'CODE_INVALID', 'Invalid session code');
  if (s.status !== 'active' || now > s.endsAt) throw new AppError(409, 'SESSION_EXPIRED', 'This session has ended');
  if (now < s.startsAt) throw new AppError(409, 'SESSION_NOT_STARTED', 'This session has not started yet');
  const cls = await Class.findByIdAndUpdate(s.classId, { $addToSet: { studentIds: req.user!.id } }, { new: true });
  res.json({ id: s._id, className: cls?.name, center: s.center, radiusM: s.radiusM, endsAt: s.endsAt, intervalMin: s.intervalMin, requireFace: s.requireFace });
}));

const checkinSchema = z.object({ lat: z.number(), lng: z.number(), accuracyM: z.number().min(0) });

r.post('/:id/checkin', requireRole('student'), checkinLimiter, validate(checkinSchema), ah(async (req, res) => {
  const s = await Session.findById(oid(req.params.id));
  const now = new Date();
  if (!s) throw new AppError(404, 'SESSION_NOT_FOUND', 'Session not found');
  if (s.status !== 'active' || now > s.endsAt) throw new AppError(409, 'SESSION_EXPIRED', 'This session has ended');
  if (now < s.startsAt) throw new AppError(409, 'SESSION_NOT_STARTED', 'This session has not started yet');
  if (!(await Class.exists({ _id: s.classId, studentIds: req.user!.id }))) throw new AppError(403, 'NOT_JOINED', 'Enter the session code first');
  if (s.requireFace) { // face must be verified for this session before any check-in counts
    const rec = await AttendanceRecord.findOne({ sessionId: s._id, studentId: req.user!.id }).select('faceVerified').lean();
    if (!rec?.faceVerified) throw new AppError(403, 'FACE_REQUIRED', 'Verify your face before checking in');
  }

  const history = await CheckIn.find({ sessionId: s._id, studentId: req.user!.id }).sort('-at').limit(5).lean();
  const minGapMs = s.intervalMin * 60_000 * 0.5; // blocks duplicate/spam submissions
  if (history[0] && now.getTime() - history[0].at.getTime() < minGapMs) {
    const wait = Math.ceil((minGapMs - (now.getTime() - history[0].at.getTime())) / 1000);
    throw new AppError(429, 'TOO_SOON', `Next check-in allowed in ${wait}s`);
  }

  const fix = req.body as { lat: number; lng: number; accuracyM: number };
  const ev = evaluateFix(fix, s.center as { lat: number; lng: number }, s.radiusM, lim);
  if (!ev.accepted) {
    const msg = ev.reason === 'POOR_ACCURACY' ? 'GPS accuracy too low. Move to an open area and try again.' : 'Invalid location data';
    throw new AppError(422, ev.reason, msg); // nothing is recorded: never "verify" a bad fix
  }

  const toSample = (c: { lat?: number | null; lng?: number | null; accuracyM?: number | null; at: Date }) =>
    ({ lat: c.lat!, lng: c.lng!, accuracyM: c.accuracyM!, at: c.at.getTime() });
  const flags = detectFlags({ ...fix, at: now.getTime() }, history.map(toSample));

  await CheckIn.create({ sessionId: s._id, studentId: req.user!.id, ...fix, distanceM: ev.distanceM, inside: ev.inside, flags, at: now });
  await AttendanceRecord.findOneAndUpdate(
    { sessionId: s._id, studentId: req.user!.id },
    { $setOnInsert: { status: 'Pending' }, ...(flags.length ? { $set: { status: 'Flagged' }, $addToSet: { flags: { $each: flags } } } : {}) },
    { upsert: true });

  // flags are deliberately not revealed to the student
  res.status(201).json({ inside: ev.inside, distanceM: Math.round(ev.distanceM), accuracyM: Math.round(fix.accuracyM), nextCheckInInSec: s.intervalMin * 60 });
}));

async function statuses(sessionId: string, ended: boolean) {
  const s = await Session.findById(sessionId);
  if (!s) throw new AppError(404, 'SESSION_NOT_FOUND', 'Session not found');
  const cls = await Class.findById(s.classId);
  const [checkIns, records] = await Promise.all([CheckIn.find({ sessionId }).lean(), AttendanceRecord.find({ sessionId }).lean()]);
  return { s, cls, checkIns, records };
}

r.post('/:id/close', requireRole('lecturer'), ah(async (req, res) => {
  const s = await Session.findById(oid(req.params.id));
  if (!s || String(s.lecturerId) !== req.user!.id) throw new AppError(404, 'SESSION_NOT_FOUND', 'Session not found');
  if (s.status === 'closed') throw new AppError(409, 'ALREADY_CLOSED', 'Session already closed');
  res.json({ message: 'Session closed', students: await finalizeSession(String(s._id), req.user!.id) });
}));

r.get('/:id/live', requireRole('lecturer'), ah(async (req, res) => {
  const { s, cls, checkIns, records } = await statuses(oid(req.params.id), false);
  if (String(s.lecturerId) !== req.user!.id) throw new AppError(403, 'FORBIDDEN', 'Not your session');
  const users = await User.find({ _id: { $in: cls?.studentIds ?? [] } }).select('name rollNo').lean();
  const rows = users.map(u => {
    const mine = checkIns.filter(c => String(c.studentId) === String(u._id)).sort((a, b) => +b.at - +a.at);
    const rec = records.find(x => String(x.studentId) === String(u._id));
    const live = computeStatus({ ended: s.status === 'closed' || new Date() > s.endsAt, startsAt: s.startsAt.getTime(), endsAt: s.endsAt.getTime(),
      intervalMin: s.intervalMin, minPresencePct: s.minPresencePct, graceMissed: s.graceMissed, lateAfterMin: s.lateAfterMin,
      checkIns: mine.map(c => ({ at: c.at.getTime(), inside: !!c.inside })), flagged: rec?.status === 'Flagged' });
    return { recordId: rec?._id, studentId: u._id, name: u.name, rollNo: u.rollNo, status: rec?.reviewedBy ? rec.status : live.status,
      presencePct: live.presencePct, flags: rec?.flags ?? [], face: !!rec?.faceVerified, lastCheckIn: mine[0]?.at, lastDistanceM: mine[0] ? Math.round(mine[0].distanceM!) : null, lastInside: mine[0]?.inside ?? null };
  });
  res.json({ session: s, students: rows });
}));

export default r;
