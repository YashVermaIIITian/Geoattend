import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from './api';
import { useAuth } from './auth';
import { Btn, Card, Input, Logo, Notice } from './ui';

export function Landing() {
  const steps = [['Lecturer starts a session', 'Pick the classroom location and radius, then share a 6-character code.'],
    ['Students join with the code', 'They allow location access and the browser reports where they are.'],
    ['Server checks the check-ins', 'Distance, GPS accuracy and timing are verified on the server every few minutes.']];
  const features = ['Server-side geofence checks', 'Periodic check-ins, not one unbroken hour', 'Suspicious activity flagged for lecturer review',
    'Live attendance dashboard', 'Institute email + OTP signup', 'Check-ins auto-deleted after the retention period'];
  return (<div>
    <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4"><Logo />
      <nav className="flex gap-2"><Link to="/login"><Btn variant="ghost">Log in</Btn></Link><Link to="/register"><Btn>Register</Btn></Link></nav></header>
    <section className="bg-gradient-to-b from-indigo-950 to-indigo-800 px-4 py-20 text-center text-white">
      <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">Classroom attendance that checks where you are</h1>
      <p className="mx-auto mt-4 max-w-2xl text-indigo-100">GeoAttend uses GPS geofencing and timed check-ins to make proxy attendance much harder, and gives lecturers a live view.</p>
      <div className="mt-8 flex justify-center gap-3"><Link to="/register"><Btn className="!bg-white !text-indigo-900">Get started</Btn></Link>
        <Link to="/login"><Btn variant="ghost" className="!bg-transparent !text-white !border-indigo-300">Log in</Btn></Link></div></section>
    <section className="mx-auto max-w-6xl px-4 py-14"><h2 className="mb-6 text-2xl font-semibold">How it works</h2>
      <div className="grid gap-4 md:grid-cols-3">{steps.map(([t, d], i) => (<Card key={t}><div className="mb-2 grid h-8 w-8 place-items-center rounded-full bg-indigo-100 font-bold text-indigo-700">{i + 1}</div>
        <h3 className="font-semibold">{t}</h3><p className="mt-1 text-sm text-slate-600">{d}</p></Card>))}</div></section>
    <section className="mx-auto max-w-6xl px-4 pb-14"><h2 className="mb-6 text-2xl font-semibold">Features</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{features.map(f => <Card key={f}><p className="text-sm font-medium">{f}</p></Card>)}</div></section>
    <section className="mx-auto max-w-6xl px-4 pb-14"><Card title="Security and privacy">
      <p className="text-sm text-slate-600">Location is only used during an active session and only after you give consent. Browser GPS cannot prove who someone is, and no system can fully prevent location faking. GeoAttend flags suspicious patterns so a lecturer can review them.</p></Card></section>
    <footer className="border-t border-slate-200 py-6 text-center text-sm text-slate-500">GeoAttend · Group 4 EC Project · IIIT Vadodara</footer></div>);
}

function Center({ title, children }: { title: string; children: ReactNode }) {
  return (<div className="grid min-h-screen place-items-center px-4"><div className="w-full max-w-md space-y-4"><div className="flex justify-center"><Logo /></div>
    <Card title={title}>{children}</Card></div></div>);
}

export function Login() {
  const { login } = useAuth(); const nav = useNavigate();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const u = await login(email, password); nav(`/${u.role}`); } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  return (<Center title="Log in"><form onSubmit={submit} className="space-y-3">
    <Input label="Institute email" type="email" required value={email} onChange={e => setEmail(e.target.value)} />
    <Input label="Password" type="password" required value={password} onChange={e => setPassword(e.target.value)} />
    {err && <Notice>{err}</Notice>}<Btn className="w-full" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</Btn>
    <p className="text-center text-sm text-slate-600">New student? <Link className="text-indigo-600" to="/register">Register</Link></p></form></Center>);
}

export function Register() {
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', rollNo: '', email: '', password: '', inviteCode: '' }); const [otp, setOtp] = useState(''); const [step, setStep] = useState(1);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const run = (fn: () => Promise<void>) => async (e: FormEvent) => { e.preventDefault(); setErr(''); setBusy(true); try { await fn(); } catch (x: any) { setErr(x.message); } finally { setBusy(false); } };
  return (<Center title={step === 1 ? 'Create account' : 'Verify your email'}>
    {step === 1 ? (<form onSubmit={run(async () => { const body: any = { ...f }; if (!body.rollNo) delete body.rollNo; if (!body.inviteCode) delete body.inviteCode;
      const r = await api('/auth/register', 'POST', body); if (r.verified) nav('/login'); else setStep(2); })} className="space-y-3">
      <Input label="Full name" required value={f.name} onChange={set('name')} /><Input label="Roll number (students)" value={f.rollNo} onChange={set('rollNo')} />
      <Input label="Institute email" type="email" required value={f.email} onChange={set('email')} />
      <Input label="Password (min 10 characters)" type="password" required minLength={10} value={f.password} onChange={set('password')} />
      <Input label="Teacher invite code (teachers only)" value={f.inviteCode} onChange={set('inviteCode')} />
      {err && <Notice>{err}</Notice>}<Btn className="w-full" disabled={busy}>{busy ? 'Please wait…' : 'Create account'}</Btn></form>)
    : (<form onSubmit={run(async () => { await api('/auth/verify-otp', 'POST', { email: f.email, otp }); nav('/login'); })} className="space-y-3">
      <Notice kind="ok">A 6-digit code was sent to {f.email}. (In development, it is printed in the backend terminal.)</Notice>
      <Input label="6-digit code" inputMode="numeric" maxLength={6} required value={otp} onChange={e => setOtp(e.target.value)} />
      {err && <Notice>{err}</Notice>}<Btn className="w-full" disabled={busy}>Verify</Btn></form>)}
    <p className="mt-3 text-center text-sm text-slate-600">Already registered? <Link className="text-indigo-600" to="/login">Log in</Link></p></Center>);
}
