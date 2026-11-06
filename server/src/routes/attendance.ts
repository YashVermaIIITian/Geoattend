import { Router } from 'express';
import { z } from 'zod';
import { AttendanceRecord, CheckIn, Session, audit } from '../models/index.js';
import { requireAuth, requireRole, validate } from '../middleware/index.js';
import { ah, AppError, oid } from '../utils/errors.js';

const r = Router();
r.use(requireAuth);

// Lecturer approves or rejects a (usually flagged) record.
r.patch('/:recordId/review', requireRole('lecturer'), validate(z.object({ decision: z.enum(['approve', 'reject']), note: z.string().max(500).optional() })), ah(async (req, res) => {
  const rec = await AttendanceRecord.findById(oid(req.params.recordId));
  const s = rec && await Session.findById(rec.sessionId);
  if (!rec || !s || String(s.lecturerId) !== req.user!.id) throw new AppError(404, 'RECORD_NOT_FOUND', 'Record not found');
  rec.status = req.body.decision === 'approve' ? 'Present' : 'Absent';
  rec.reviewedBy = req.user!.id as any; rec.reviewNote = req.body.note;
  await rec.save();
  await audit(req.user!.id, `attendance.${req.body.decision}`, String(rec._id), { note: req.body.note });
  res.json(rec);
}));

// Student's own data: percentage, per-class summary, session history and recent check-ins.
r.get('/me', requireRole('student'), ah(async (req, res) => {
  const recs = await AttendanceRecord.find({ studentId: req.user!.id }).sort('-createdAt').limit(200)
    .populate({ path: 'sessionId', select: 'startsAt status classId', populate: { path: 'classId', select: 'name' } }).lean();
  const rows = recs.filter(x => x.sessionId).map(x => { const s: any = x.sessionId;
    return { id: x._id, className: s.classId?.name ?? 'Class', date: s.startsAt, sessionStatus: s.status, status: x.status, presencePct: x.presencePct }; });
  const ok = (x: { status: string }) => x.status === 'Present' || x.status === 'Late';
  const done = rows.filter(x => x.sessionStatus === 'closed');
  const by: Record<string, { className: string; attended: number; total: number }> = {};
  done.forEach(x => { const b = (by[x.className] ??= { className: x.className, attended: 0, total: 0 }); b.total++; if (ok(x)) b.attended++; });
  const cis = await CheckIn.find({ studentId: req.user!.id }).sort('-at').limit(20)
    .populate({ path: 'sessionId', select: 'classId', populate: { path: 'classId', select: 'name' } }).lean();
  const attended = done.filter(ok).length;
  res.json({
    percentage: done.length ? Math.round((attended / done.length) * 1000) / 10 : null, attended, total: done.length,
    classes: Object.values(by).map(c => ({ ...c, pct: Math.round((c.attended / c.total) * 1000) / 10 })),
    history: rows.slice(0, 50),
    checkIns: cis.map((c: any) => ({ id: c._id, at: c.at, className: c.sessionId?.classId?.name ?? 'Class', distanceM: Math.round(c.distanceM ?? 0), accuracyM: Math.round(c.accuracyM ?? 0), inside: c.inside })),
  });
}));

export default r;
