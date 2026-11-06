import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { AttendanceRecord, Class, Session, User, audit } from '../models/index.js';
import { requireAuth, requireRole, validate } from '../middleware/index.js';
import { ah, AppError, oid } from '../utils/errors.js';
import { faceMatches } from '../services/face.service.js';

const r = Router();
r.use(requireAuth, requireRole('student'));
const MAX_ATTEMPTS = 5;
const descriptor = z.array(z.number().finite().min(-5).max(5)).length(128);

r.get('/status', ah(async (req, res) => {
  const u = await User.findById(req.user!.id).select('faceEnrolledAt').lean();
  res.json({ enrolled: !!u?.faceEnrolledAt });
}));

// One-time registration with explicit consent. Only the numeric template is stored, never a photo.
r.post('/enroll', validate(z.object({ descriptor, consent: z.literal(true) })), ah(async (req, res) => {
  const u = await User.findById(req.user!.id).select('faceEnrolledAt');
  if (u?.faceEnrolledAt) throw new AppError(409, 'ALREADY_ENROLLED', 'Face already registered. Ask your lecturer to reset it.');
  await User.updateOne({ _id: req.user!.id }, { $set: { faceDescriptor: req.body.descriptor, faceEnrolledAt: new Date() } });
  await audit(req.user!.id, 'face.enroll');
  res.status(201).json({ enrolled: true });
}));

// Students can delete their own template at any time.
r.delete('/', ah(async (req, res) => {
  await User.updateOne({ _id: req.user!.id }, { $unset: { faceDescriptor: 1, faceEnrolledAt: 1 } });
  await audit(req.user!.id, 'face.delete');
  res.json({ deleted: true });
}));

r.post('/verify/:sessionId', validate(z.object({ descriptor })), ah(async (req, res) => {
  const s = await Session.findById(oid(req.params.sessionId));
  if (!s || s.status !== 'active' || new Date() > s.endsAt) throw new AppError(409, 'SESSION_EXPIRED', 'This session has ended');
  if (!(await Class.exists({ _id: s.classId, studentIds: req.user!.id }))) throw new AppError(403, 'NOT_JOINED', 'Enter the session code first');
  const u = await User.findById(req.user!.id).select('+faceDescriptor');
  if (!u?.faceDescriptor?.length) throw new AppError(409, 'NOT_ENROLLED', 'Register your face first');
  const rec = await AttendanceRecord.findOneAndUpdate({ sessionId: s._id, studentId: req.user!.id }, { $setOnInsert: { status: 'Pending' } }, { upsert: true, new: true });
  if (rec.faceVerified) return res.json({ verified: true });
  if (rec.faceAttempts >= MAX_ATTEMPTS) throw new AppError(403, 'FACE_LOCKED', 'Too many failed attempts. Ask your lecturer to review.');
  if (faceMatches(Array.from(u.faceDescriptor), req.body.descriptor, env.FACE_MATCH_THRESHOLD)) {
    await AttendanceRecord.updateOne({ _id: rec._id }, { $set: { faceVerified: true } });
    return res.json({ verified: true });
  }
  const attempts = rec.faceAttempts + 1;
  await AttendanceRecord.updateOne({ _id: rec._id }, { $inc: { faceAttempts: 1 },
    ...(attempts >= MAX_ATTEMPTS ? { $set: { status: 'Flagged' }, $addToSet: { flags: 'FACE_MISMATCH' } } : {}) });
  await audit(req.user!.id, 'face.mismatch', String(s._id));
  res.json({ verified: false, attemptsLeft: Math.max(0, MAX_ATTEMPTS - attempts) });
}));

export default r;
