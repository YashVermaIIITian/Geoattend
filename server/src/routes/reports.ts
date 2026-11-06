import { Router } from 'express';
import { AttendanceRecord, CheckIn, Class, Session, User, audit } from '../models/index.js';
import { requireAuth, requireRole } from '../middleware/index.js';
import { ah, AppError, oid } from '../utils/errors.js';

const r = Router();
r.use(requireAuth, requireRole('lecturer'));

r.get('/summary', ah(async (req, res) => {
  const classes = await Class.find({ lecturerId: req.user!.id }).select('studentIds').lean();
  const students = new Set(classes.flatMap(c => c.studentIds.map(String)));
  const sessions = await Session.find({ lecturerId: req.user!.id }).select('status startsAt').lean();
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const todayIds = sessions.filter(s => s.startsAt >= start).map(s => s._id);
  const recs = await AttendanceRecord.find({ sessionId: { $in: todayIds }, status: { $in: ['Present', 'Late', 'Absent'] } }).select('status').lean();
  res.json({ totalStudents: students.size, totalClasses: classes.length, activeSessions: sessions.filter(s => s.status === 'active').length,
    todayPct: recs.length ? Math.round((recs.filter(x => x.status !== 'Absent').length / recs.length) * 1000) / 10 : null });
}));

// Student x session matrix for one class (closed sessions only, so results are final).
r.get('/class/:classId', ah(async (req, res) => {
  const cls = await Class.findOne({ _id: oid(req.params.classId), lecturerId: req.user!.id }).lean();
  if (!cls) throw new AppError(404, 'CLASS_NOT_FOUND', 'Class not found');
  const sessions = await Session.find({ classId: cls._id, status: 'closed' }).sort('startsAt').select('startsAt joinCode').lean();
  const recs = await AttendanceRecord.find({ sessionId: { $in: sessions.map(s => s._id) } }).select('sessionId studentId status').lean();
  const users = await User.find({ _id: { $in: cls.studentIds } }).select('name rollNo').sort('name').lean();
  const students = users.map(u => {
    const mine = recs.filter(x => String(x.studentId) === String(u._id));
    const cells: Record<string, string> = {};
    mine.forEach(x => { cells[String(x.sessionId)] = x.status; });
    const attended = mine.filter(x => x.status === 'Present' || x.status === 'Late').length;
    return { id: u._id, name: u.name, rollNo: u.rollNo, cells, attended, total: mine.length,
      pct: mine.length ? Math.round((attended / mine.length) * 1000) / 10 : null };
  });
  res.json({ className: cls.name, sessions: sessions.map(s => ({ id: s._id, startsAt: s.startsAt, joinCode: s.joinCode })), students });
}));

// One student's full record across this lecturer's classes, including every check-in.
r.get('/student/:studentId', ah(async (req, res) => {
  const sid = oid(req.params.studentId);
  const classes = await Class.find({ lecturerId: req.user!.id, studentIds: sid }).select('name').lean();
  if (!classes.length) throw new AppError(404, 'NOT_FOUND', 'Student not found in your classes');
  const sessions = await Session.find({ classId: { $in: classes.map(c => c._id) } }).sort('-startsAt').limit(100).select('startsAt status classId joinCode').lean();
  const ids = sessions.map(s => s._id);
  const [recs, cis, u] = await Promise.all([
    AttendanceRecord.find({ sessionId: { $in: ids }, studentId: sid }).lean(),
    CheckIn.find({ sessionId: { $in: ids }, studentId: sid }).sort('at').limit(500).lean(),
    User.findById(sid).select('name rollNo email faceEnrolledAt').lean()]);
  res.json({ student: u, sessions: sessions.map(s => {
    const rec = recs.find(x => String(x.sessionId) === String(s._id));
    return { id: s._id, joinCode: s.joinCode, className: classes.find(c => String(c._id) === String(s.classId))?.name, date: s.startsAt,
      status: rec?.status ?? (s.status === 'closed' ? 'Absent' : 'Pending'), presencePct: rec?.presencePct ?? 0, flags: rec?.flags ?? [],
      checkIns: cis.filter(c => String(c.sessionId) === String(s._id)).map(c => ({ at: c.at, distanceM: Math.round(c.distanceM ?? 0), accuracyM: Math.round(c.accuracyM ?? 0), inside: c.inside, flags: c.flags })) };
  }) });
}));

// Lecturer clears a student's face template (for example if a wrong face was registered).
r.post('/student/:studentId/reset-face', ah(async (req, res) => {
  const sid = oid(req.params.studentId);
  if (!(await Class.exists({ lecturerId: req.user!.id, studentIds: sid }))) throw new AppError(404, 'NOT_FOUND', 'Student not found in your classes');
  await User.updateOne({ _id: sid }, { $unset: { faceDescriptor: 1, faceEnrolledAt: 1 } });
  await audit(req.user!.id, 'face.reset', sid);
  res.json({ reset: true });
}));

export default r;
