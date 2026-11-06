import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useAuth } from './auth';
import { Badge, Btn, Card, Input, Notice, Shell } from './ui';
import GeoMap from './GeoMap';
import { FaceStep } from './Face';

interface Fix { lat: number; lng: number; accuracyM: number }
const rad = Math.PI / 180;
const dist = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {  // display only; the server decides
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 2 * 6371000 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};
const geoMsg = (c: number) => c === 1 ? 'Location permission denied. Allow location for this site in your browser settings, then reload.'
  : c === 2 ? 'Your device could not determine its location.' : 'Getting your location timed out. Move to an open area and try again.';

export default function Student() {
  const { user } = useAuth();
  const [code, setCode] = useState(''); const [sess, setSess] = useState<any>(null); const [consent, setConsent] = useState(false);
  const [fix, setFix] = useState<Fix | null>(null); const [geoErr, setGeoErr] = useState(''); const [err, setErr] = useState('');
  const [last, setLast] = useState<any>(null); const [info, setInfo] = useState<{ ok: boolean; text: string } | null>(null);
  const [hist, setHist] = useState<any>(null);
  const fixRef = useRef<Fix | null>(null); fixRef.current = fix;
  const first = useRef(false);
  const [faceOk, setFaceOk] = useState(false); const [enrolled, setEnrolled] = useState(true);

  const loadHist = () => api('/attendance/me').then(setHist).catch(() => {});
  useEffect(() => { loadHist(); }, []);

  const join = async () => { setErr(''); try { const j = await api('/sessions/join', 'POST', { code }); setSess(j); setFaceOk(false); first.current = false; if (j.requireFace) setEnrolled((await api('/face/status')).enrolled); } catch (e: any) { setErr(e.message); } };

  const checkIn = useCallback(async () => {
    if (!sess || (sess.requireFace && !faceOk)) return;
    const f = fixRef.current;
    if (!f) { setInfo({ ok: false, text: 'Waiting for a location fix…' }); return; }
    try {
      const r = await api(`/sessions/${sess.id}/checkin`, 'POST', f);
      setLast(r); loadHist(); setInfo({ ok: r.inside, text: r.inside ? 'Check-in recorded: you are inside the classroom area.' : 'Check-in recorded, but you are outside the allowed area.' });
    } catch (e: any) { setInfo({ ok: false, text: e.message }); }
  }, [sess, faceOk]);

  useEffect(() => {  // location is only tracked after consent
    if (!sess || !consent) return;
    if (!navigator.geolocation) { setGeoErr('This browser does not support location.'); return; }
    const id = navigator.geolocation.watchPosition(
      p => { setGeoErr(''); setFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy }); },
      e => setGeoErr(geoMsg(e.code)), { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [sess, consent]);

  useEffect(() => { if (sess && consent && fix && !first.current && (!sess.requireFace || faceOk)) { first.current = true; checkIn(); } }, [sess, consent, fix, checkIn, faceOk]);
  useEffect(() => {  // periodic check-ins while this page stays open
    if (!sess || !consent) return;
    const t = setInterval(checkIn, sess.intervalMin * 60_000);
    return () => clearInterval(t);
  }, [sess, consent, checkIn]);

  const d = fix && sess ? dist(fix, sess.center) : null;
  const previewInside = d != null && fix && sess ? d <= sess.radiusM + Math.min(fix.accuracyM, 20) : null;

  return (<Shell>
    <div><h1 className="text-2xl font-bold">Welcome, {user?.name}</h1><p className="text-sm text-slate-600">{user?.rollNo}</p></div>
    <div className="grid gap-4 sm:grid-cols-3">
      <Card title="Attendance"><p className="text-3xl font-bold text-indigo-700">{hist?.percentage ?? '—'}{hist?.percentage != null && '%'}</p></Card>
      <Card title="Classes attended"><p className="text-3xl font-bold">{hist ? `${hist.attended} / ${hist.total}` : '—'}</p></Card>
      <Card title="Location"><p className="text-sm">{geoErr ? 'Problem' : fix ? 'Active' : consent && sess ? 'Waiting…' : 'Not started'}</p>
        {fix && <p className="text-sm text-slate-600">GPS accuracy ±{Math.round(fix.accuracyM)} m</p>}</Card></div>

    {!sess ? (<Card title="Join a session"><div className="flex max-w-sm gap-2 items-end"><div className="flex-1"><Input label="Session code" maxLength={6} value={code} onChange={e => setCode(e.target.value.toUpperCase())} /></div>
      <Btn onClick={join} disabled={code.length !== 6}>Join</Btn></div>{err && <div className="mt-3"><Notice>{err}</Notice></div>}</Card>)
    : (<Card title={`Active session: ${sess.className}`}>
      {!consent ? (<div className="space-y-3"><Notice kind="warn">GeoAttend will read your device location while this page is open during this session. Your coordinates are used only for attendance and are deleted after the retention period.{sess.requireFace && ' This session also asks for a quick face check using your camera.'}</Notice>
        <Btn onClick={() => setConsent(true)}>I agree, start location check</Btn></div>)
      : sess.requireFace && !faceOk ? (<FaceStep sessionId={sess.id} enrolled={enrolled} onDone={() => { setEnrolled(true); setFaceOk(true); }} />)
      : (<div className="space-y-3">
        {geoErr && <Notice>{geoErr}</Notice>}
        <GeoMap center={sess.center} radiusM={sess.radiusM} me={fix} inside={previewInside} />
        <div className="grid gap-2 text-sm sm:grid-cols-3"><div>Distance: <b>{d != null ? `${Math.round(d)} m` : '—'}</b> (limit {sess.radiusM} m)</div>
          <div>Accuracy: <b>{fix ? `±${Math.round(fix.accuracyM)} m` : '—'}</b></div>
          <div>Preview: <b className={previewInside ? 'text-emerald-600' : 'text-red-600'}>{previewInside == null ? '—' : previewInside ? 'Inside' : 'Outside'}</b></div></div>
        {info && <Notice kind={info.ok ? 'ok' : 'error'}>{info.text}</Notice>}
        <p className="text-xs text-slate-500">The server makes the final decision. Keep this page open and your screen awake: a check-in is sent automatically every {sess.intervalMin} min.{last && ` Last result: ${last.inside ? 'inside' : 'outside'}, ${last.distanceM} m.`}</p>
        <div className="flex gap-2"><Btn onClick={checkIn}>Check in now</Btn><Btn variant="ghost" onClick={() => { setSess(null); setFaceOk(false); setConsent(false); setFix(null); setInfo(null); loadHist(); }}>Leave session</Btn></div></div>)}
    </Card>)}

    {!!hist?.classes?.length && <Card title="By class"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{hist.classes.map((c: any) => (
      <div key={c.className} className="rounded-xl border border-slate-200 p-3"><p className="font-medium">{c.className}</p><p className="text-sm text-slate-600">{c.attended} / {c.total} classes</p>
        <div className="mt-2 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-indigo-600" style={{ width: `${c.pct}%` }} /></div><p className="mt-1 text-xs text-slate-500">{c.pct}%</p></div>))}</div></Card>}
    <Card title="Attendance history">{!hist?.history?.length ? <p className="text-sm text-slate-500">No attendance yet. Join a session to get started.</p> :
      <><ul className="divide-y text-sm">{hist.history.map((h: any) => (<li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
        <span><b>{h.className}</b> · {new Date(h.date).toLocaleString()}</span><span className="flex items-center gap-3">{Math.round(h.presencePct)}%<Badge s={h.status} /></span></li>))}</ul>
        <p className="mt-2 text-xs text-slate-500">Pending results are finalised when the session ends.</p></>}</Card>
    <Card title="My recent check-ins">{!hist?.checkIns?.length ? <p className="text-sm text-slate-500">No check-ins yet.</p> :
      <ul className="divide-y text-sm">{hist.checkIns.map((c: any) => (<li key={c.id} className="flex flex-wrap justify-between gap-2 py-1.5"><span>{new Date(c.at).toLocaleString()} · {c.className}</span>
        <span className={c.inside ? 'text-emerald-700' : 'text-red-700'}>{c.inside ? 'Inside' : 'Outside'} · {c.distanceM} m (±{c.accuracyM})</span></li>))}</ul>}</Card>
  </Shell>);
}
