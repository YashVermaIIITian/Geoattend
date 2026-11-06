import { useEffect, useState } from 'react';
import { api } from './api';
import { Badge, Btn, Card } from './ui';

export function Stats() {
  const [s, setS] = useState<any>(null);
  useEffect(() => { api('/reports/summary').then(setS).catch(() => {}); }, []);
  const items = [['Total students', s?.totalStudents], ['Classes', s?.totalClasses], ['Active sessions', s?.activeSessions],
    ["Today's attendance", s?.todayPct != null ? `${s.todayPct}%` : '—']];
  return (<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{items.map(([k, v]) => (
    <Card key={k as string}><p className="text-sm text-slate-500">{k}</p><p className="text-2xl font-bold text-indigo-900">{v ?? '—'}</p></Card>))}</div>);
}

export function Report({ classes }: { classes: any[] }) {
  const [id, setId] = useState(''); const [d, setD] = useState<any>(null); const [err, setErr] = useState(''); const [det, setDet] = useState<any>(null);
  const open = (sid: string) => api(`/reports/student/${sid}`).then(setDet).catch(e => setErr(e.message));
  const resetFace = (sid: string) => api(`/reports/student/${sid}/reset-face`, 'POST').then(() => open(sid)).catch(e => setErr(e.message));
  useEffect(() => { setErr(''); setDet(null); if (!id) { setD(null); return; } api(`/reports/class/${id}`).then(setD).catch(e => setErr(e.message)); }, [id]);
  const when = (s: any) => new Date(s.startsAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
  const csv = () => {
    const head = ['Name', 'Roll', ...d.sessions.map((s: any) => `${when(s)} (${s.joinCode})`), 'Attended', 'Total', 'Percentage'];
    const rows = d.students.map((s: any) => [s.name, s.rollNo ?? '', ...d.sessions.map((x: any) => s.cells[x.id] ?? ''), s.attended, s.total, s.pct ?? '']);
    return 'data:text/csv;charset=utf-8,' + encodeURIComponent([head, ...rows].map(r => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'));
  };
  return (<Card title="3. Attendance report (all students, all closed sessions)">
    <div className="mb-3 flex flex-wrap items-center gap-2"><select value={id} onChange={e => setId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
      <option value="">Select class</option>{classes.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}</select>
      {d && <a href={csv()} download={`${d.className}-attendance.csv`}><Btn variant="ghost">Download CSV</Btn></a>}</div>
    {err && <p className="text-sm text-red-700">{err}</p>}
    {!d ? <p className="text-sm text-slate-500">Pick a class to see every student's attendance. Only closed sessions are counted, so close a session when it ends.</p>
    : !d.sessions.length ? <p className="text-sm text-slate-500">No closed sessions for this class yet.</p>
    : (<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-slate-500"><tr><th className="py-2 pr-3">Student</th><th className="pr-3">Roll</th>
      {d.sessions.map((s: any) => <th key={s.id} className="pr-3 text-xs">{when(s)}<br />{s.joinCode}</th>)}<th className="pr-3">Attended</th><th>%</th></tr></thead>
      <tbody className="divide-y">{d.students.map((s: any) => (<tr key={s.id}><td className="py-2 pr-3"><button className="text-indigo-700 underline" onClick={() => open(s.id)}>{s.name}</button></td><td className="pr-3">{s.rollNo}</td>
        {d.sessions.map((x: any) => <td key={x.id} className="pr-3">{s.cells[x.id] ? <Badge s={s.cells[x.id]} /> : '—'}</td>)}
        <td className="pr-3">{s.attended}/{s.total}</td><td className="font-semibold">{s.pct != null ? `${s.pct}%` : '—'}</td></tr>))}</tbody></table></div>)}
    {det && (<div className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
      <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">{det.student?.name} · {det.student?.rollNo} · {det.student?.email}</h3><span className="flex items-center gap-2 text-xs">{det.student?.faceEnrolledAt ? <>Face registered <Btn variant="ghost" onClick={() => resetFace(det.student._id)}>Reset face</Btn></> : 'No face registered'}<Btn variant="ghost" onClick={() => setDet(null)}>Close</Btn></span></div>
      <ul className="divide-y text-sm">{det.sessions.map((s: any) => (<li key={s.id} className="py-2">
        <div className="flex flex-wrap items-center gap-3"><span className="font-medium">{s.className}</span><span className="text-slate-600">{new Date(s.date).toLocaleString()}</span><Badge s={s.status} /><span>{Math.round(s.presencePct)}%</span>
          {!!s.flags.length && <span className="text-xs text-orange-700">{s.flags.join(', ')}</span>}</div>
        {!!s.checkIns.length && <details className="mt-1 text-xs text-slate-600"><summary className="cursor-pointer">{s.checkIns.length} check-ins</summary>
          <p className="mt-1">{s.checkIns.map((c: any) => `${new Date(c.at).toLocaleTimeString()} ${c.inside ? '✓' : '✗'} ${c.distanceM} m (±${c.accuracyM})`).join('  ·  ')}</p></details>}</li>))}</ul></div>)}
  </Card>);
}
