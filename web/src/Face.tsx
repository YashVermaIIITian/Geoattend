import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { Btn, Notice } from './ui';

// face-api (a free open-source library) and its model files are loaded from a CDN the first time they are needed
const LIB = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7/dist/face-api.js';
const MODELS = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7/model/';
let ready: Promise<void> | null = null;
function loadFaceApi() {
  if (!ready) {
    ready = new Promise<void>((res, rej) => {
      if ((window as any).faceapi) return res();
      const s = document.createElement('script'); s.src = LIB; s.onload = () => res();
      s.onerror = () => rej(new Error('Could not load the face-check library. Check your internet connection.'));
      document.head.appendChild(s);
    }).then(async () => {
      const f = (window as any).faceapi;
      await Promise.all([f.nets.tinyFaceDetector.loadFromUri(MODELS), f.nets.faceLandmark68Net.loadFromUri(MODELS), f.nets.faceRecognitionNet.loadFromUri(MODELS)]);
    });
    ready.catch(() => { ready = null; }); // allow retry
  }
  return ready;
}

/** Opens the camera, asks for a head turn (a basic live-person check), then returns a 128-number face descriptor. */
function FaceCapture({ onCapture }: { onCapture: (d: number[]) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [msg, setMsg] = useState('Loading face check…'); const [err, setErr] = useState('');
  useEffect(() => {
    let stop = false, busy = false, turned = false; let stream: MediaStream | null = null; let timer: any;
    (async () => {
      try {
        await loadFaceApi(); const f = (window as any).faceapi;
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 480 }, audio: false });
        if (stop) { stream.getTracks().forEach(t => t.stop()); return; }
        video.current!.srcObject = stream; await video.current!.play();
        setMsg('Look at the camera, then slowly turn your head to one side and back.');
        const opts = new f.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
        timer = setInterval(async () => {
          if (stop || busy || !video.current) return; busy = true;
          try {
            const r = await f.detectSingleFace(video.current, opts).withFaceLandmarks().withFaceDescriptor();
            if (!r) { setMsg('No face found. Move to better light and face the camera.'); return; }
            const p = r.landmarks.positions; const yaw = (p[30].x - p[0].x) / (p[16].x - p[0].x); // ~0.5 when facing the camera
            if (!turned) { if (yaw < 0.36 || yaw > 0.64) { turned = true; setMsg('Good. Now look straight at the camera.'); } else setMsg('Slowly turn your head to one side, then back.'); }
            else if (yaw > 0.42 && yaw < 0.58) { stop = true; clearInterval(timer); stream?.getTracks().forEach(t => t.stop()); onCapture(Array.from(r.descriptor as Float32Array)); }
          } finally { busy = false; }
        }, 300);
      } catch (e: any) { setErr(e?.name === 'NotAllowedError' ? 'Camera permission denied. Allow the camera for this site and try again.' : e?.message || 'Camera error'); }
    })();
    return () => { stop = true; clearInterval(timer); stream?.getTracks().forEach(t => t.stop()); };
  }, []);
  return (<div className="space-y-2"><video ref={video} playsInline muted className="mx-auto h-64 w-64 -scale-x-100 rounded-2xl bg-slate-900 object-cover" />
    {err ? <Notice>{err}</Notice> : <p className="text-center text-sm text-slate-600">{msg}</p>}</div>);
}

export function FaceStep({ sessionId, enrolled, onDone }: { sessionId: string; enrolled: boolean; onDone: () => void }) {
  const [agree, setAgree] = useState(false); const [started, setStarted] = useState(false); const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null); const [key, setKey] = useState(0);
  const submit = async (d: number[]) => {
    setBusy(true); setMsg(null);
    try {
      if (!enrolled) await api('/face/enroll', 'POST', { descriptor: d, consent: true });
      const r = await api(`/face/verify/${sessionId}`, 'POST', { descriptor: d });
      if (r.verified) onDone(); else { setMsg(`Face did not match. Attempts left: ${r.attemptsLeft}.`); setStarted(false); setKey(k => k + 1); }
    } catch (e: any) { setMsg(e.message); setStarted(false); } finally { setBusy(false); }
  };
  return (<div className="space-y-3">
    <Notice kind="warn">{enrolled ? 'Verify your face to continue. Attendance only counts after this step.'
      : 'First time: register your face. Only a numeric face template is stored (no photo), used only to verify you in attendance sessions. You can ask your lecturer to reset it.'}</Notice>
    {!enrolled && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={agree} onChange={e => setAgree(e.target.checked)} />I consent to my face template being stored for attendance verification.</label>}
    {msg && <Notice>{msg}</Notice>}
    {busy ? <p className="text-sm text-slate-600">Checking…</p> : started ? <FaceCapture key={key} onCapture={submit} />
      : <Btn disabled={!enrolled && !agree} onClick={() => setStarted(true)}>{enrolled ? 'Start face check' : 'Register my face'}</Btn>}
  </div>);
}
