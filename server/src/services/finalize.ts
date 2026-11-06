import { AttendanceRecord, CheckIn, Class, Session, audit } from '../models/index.js';
import { computeStatus } from './attendance.service.js';

/** Works out and saves the final status of every enrolled student. Manually reviewed records are left alone. */
export async function finalizeSession(sessionId: string, actorId?: string) {
  const s = await Session.findById(sessionId);
  if (!s || s.status === 'closed') return null;
  const cls = await Class.findById(s.classId);
  const [checkIns, records] = await Promise.all([CheckIn.find({ sessionId }).lean(), AttendanceRecord.find({ sessionId }).lean()]);
  for (const sid of cls?.studentIds ?? []) {
    const rec = records.find(x => String(x.studentId) === String(sid));
    if (rec?.reviewedBy) continue;
    const mine = checkIns.filter(c => String(c.studentId) === String(sid));
    const out = computeStatus({ ended: true, startsAt: s.startsAt.getTime(), endsAt: s.endsAt.getTime(), intervalMin: s.intervalMin,
      minPresencePct: s.minPresencePct, graceMissed: s.graceMissed, lateAfterMin: s.lateAfterMin,
      checkIns: mine.map(c => ({ at: c.at.getTime(), inside: !!c.inside })), flagged: mine.some(c => c.flags?.length) || !!rec?.flags?.length });
    await AttendanceRecord.findOneAndUpdate({ sessionId: s._id, studentId: sid }, { $set: out }, { upsert: true });
  }
  s.status = 'closed'; await s.save();
  await audit(actorId, actorId ? 'session.close' : 'session.autoclose', String(s._id));
  return cls?.studentIds.length ?? 0;
}

/** Finalises sessions whose end time has passed, so results never stay "Pending" if the lecturer forgets to close. */
export async function autoCloseExpired() {
  const due = await Session.find({ status: 'active', endsAt: { $lt: new Date() } }).select('_id').lean();
  for (const d of due) await finalizeSession(String(d._id));
}
