import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from './api';
import { Badge, Btn, Card, Input, Notice, Shell } from './ui';
import GeoMap from './GeoMap';
import { Report, Stats } from './Reports';

const init = { classId: '', lat: '', lng: '', radiusM: '30', durationMin: '60', intervalMin: '5', minPresencePct: '75', graceMissed: '1', lateAfterMin: '10' };

export default function Lecturer() {
  const [classes, setClasses] = useState<any[]>([]); const [sessions, setSessions] = useState<any[]>([]);
  const [cls, setCls] = useState({ name: '', code: '' }); const [f, setF] = useState(init); const [face, setFace] = useState(true);
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const [sel, setSel] = useState<string | null>(null); const [live, setLive] = useState<any>(null);

  const load = useCallback(async () => {
    const [c, s] = await Promise.all([api('/classes'), api('/sessions')]);
    setClasses(c); setSessions(s); setF(x => (!x.classId && c[0] ? { ...x, classId: c[0]._id } : x));
  }, []);
  useEffect(() => { load().catch(e => setErr(e.message)); }, [load]);

  const loadLive = useCallback(() => (sel ? api(`/sessions/${sel}/live`).then(setLive).catch(e => setErr(e.message)) : Promise.resolve()), [sel]);
  useEffect(() => { if (!sel) return; loadLive(); const t = setInterval(loadLive, 10_000); return () => clearInterval(t); }, [sel, loadLive]);

  const wrap = (fn: () => Promise<void>) => async (e?: FormEvent) => { e?.preventDefault(); setErr(''); setOk(''); try { await fn(); } catch (x: any) { setErr(x.message); } };
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const here = () => navigator.geolocation.getCurrentPosition(
    p => setF(x => ({ ...x, lat: String(p.coords.latitude), lng: String(p.coords.longitude) })),
    e => setErr('Could not get your location: ' + e.message), { enableHighAccuracy: true });

  const createClass = wrap(async () => { await api('/classes', 'POST', cls); setCls({ name: '', code: '' }); await load(); });
  const createSession = wrap(async () => {
    const s = await api('/sessions', 'POST', { classId: f.classId, center: { lat: +f.lat, lng: +f.lng }, radiusM: +f.radiusM, durationMin: +f.durationMin,
      intervalMin: +f.intervalMin, minPresencePct: +f.minPresencePct, graceMissed: +f.graceMissed, lateAfterMin: +f.lateAfterMin, requireFace: face });
    setOk(`Session created. Share code ${s.joinCode} with students.`); await load(); setSel(s._id);
  });
  const close = wrap(async () => { await api(`/sessions/${sel}/close`, 'POST'); await load(); await loadLive(); setOk('Session closed and attendance finalised.'); });
  const review = (id: string, decision: 'approve' | 'reject') => wrap(async () => { await api(`/attendance/${id}/review`, 'PATCH', { decision }); await loadLive(); })();

  const rows: any[] = live?.students ?? [];
  const count = (s: string) => rows.filter(r => r.status === s).length;
  const valid = f.lat !== '' && f.lng !== '' && !isNaN(+f.lat) && !isNaN(+f.lng);

  return (<Shell>
    <Stats />
    {err && <Notice>{err}</Notice>}{ok && <Notice kind="ok">{ok}</Notice>}
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="1. Classes">
        <form onSubmit={createClass} className="flex flex-wrap items-end gap-2"><div className="min-w-32 flex-1"><Input label="Class name" required value={cls.name} onChange={e => setCls({ ...cls, name: e.target.value })} /></div>
          <div className="w-28"><Input label="Code" required value={cls.code} onChange={e => setCls({ ...cls, code: e.target.value })} /></div><Btn>Add</Btn></form>
        <ul className="mt-3 text-sm text-slate-700">{classes.length ? classes.map(c => <li key={c._id}>{c.name} ({c.code})</li>) : <li className="text-slate-500">No classes yet. Add one above.</li>}</ul></Card>

      <Card title="2. Start an attendance session">
        <form onSubmit={createSession} className="space-y-3">
          <label className="block text-sm"><span className="mb-1 block font-medium">Class</span><select required value={f.classId} onChange={set('classId')} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">Select class</option>{classes.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-2"><Input label="Latitude" required value={f.lat} onChange={set('lat')} /><Input label="Longitude" required value={f.lng} onChange={set('lng')} /></div>
          <Btn type="button" variant="ghost" onClick={here}>Use my current location as the classroom</Btn>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><Input label="Radius (m)" type="number" min={5} max={1000} value={f.radiusM} onChange={set('radiusM')} />
            <Input label="Duration (min)" type="number" min={5} value={f.durationMin} onChange={set('durationMin')} /><Input label="Check-in every (min)" type="number" min={1} value={f.intervalMin} onChange={set('intervalMin')} />
            <Input label="Min presence %" type="number" min={1} max={100} value={f.minPresencePct} onChange={set('minPresencePct')} /><Input label="Missed allowed" type="number" min={0} value={f.graceMissed} onChange={set('graceMissed')} />
            <Input label="Late after (min)" type="number" min={0} value={f.lateAfterMin} onChange={set('lateAfterMin')} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={face} onChange={e => setFace(e.target.checked)} />Require face verification before attendance counts</label>
          {valid && <GeoMap center={{ lat: +f.lat, lng: +f.lng }} radiusM={+f.radiusM || 30} />}
          <Btn disabled={!valid || !f.classId}>Create session</Btn></form></Card></div>

    <Card title="Your sessions">{!sessions.length ? <p className="text-sm text-slate-500">No sessions yet.</p> :
      <div className="flex flex-wrap gap-2">{sessions.map(s => (<button key={s._id} onClick={() => setSel(s._id)} className={`rounded-lg border px-3 py-2 text-left text-sm ${sel === s._id ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 bg-white'}`}>
        <b>{s.joinCode}</b> · {s.classId?.name} · {new Date(s.startsAt).toLocaleString()} · {s.status}</button>))}</div>}</Card>

    {live && (<Card title={`Live attendance · code ${live.session.joinCode} · ${live.session.status}`}>
      <div className="mb-3 flex flex-wrap gap-4 text-sm">{['Present', 'Late', 'Pending', 'Flagged', 'Absent'].map(s => <span key={s} className="flex items-center gap-1"><Badge s={s} /> {count(s)}</span>)}
        <span className="ml-auto flex gap-2"><Btn variant="ghost" onClick={() => loadLive()}>Refresh</Btn>
          {live.session.status === 'active' && <Btn variant="danger" onClick={() => close()}>Close session</Btn>}
          <a href={`data:text/csv;charset=utf-8,${encodeURIComponent('Name,Roll,Status,Presence%\n' + rows.map(r => `${r.name},${r.rollNo},${r.status},${r.presencePct}`).join('\n'))}`} download="attendance.csv"><Btn variant="ghost">Download CSV</Btn></a></span></div>
      {!rows.length ? <p className="text-sm text-slate-500">No students have joined yet. Share the code.</p> :
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-slate-500"><tr><th className="py-2">Student</th><th>Roll</th><th>Status</th><th>Presence</th><th>Last distance</th><th>Last check-in</th><th>Face</th><th>Flags</th><th></th></tr></thead>
        <tbody className="divide-y">{rows.map(r => (<tr key={r.studentId}><td className="py-2">{r.name}</td><td>{r.rollNo}</td><td><Badge s={r.status} /></td><td>{r.presencePct}%</td>
          <td>{r.lastDistanceM != null ? `${r.lastDistanceM} m ${r.lastInside ? '✓' : '✗'}` : '—'}</td><td>{r.lastCheckIn ? new Date(r.lastCheckIn).toLocaleTimeString() : '—'}</td>
          <td>{r.face ? '✓' : '—'}</td><td className="text-xs text-orange-700">{r.flags.join(', ')}</td>
          <td className="whitespace-nowrap">{r.status === 'Flagged' && r.recordId && <><Btn variant="success" className="!px-2 !py-1" onClick={() => review(r.recordId, 'approve')}>Approve</Btn> <Btn variant="danger" className="!px-2 !py-1" onClick={() => review(r.recordId, 'reject')}>Reject</Btn></>}</td></tr>))}</tbody></table></div>}
    </Card>)}
    <Report classes={classes} />
  </Shell>);
}
