import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './auth';

export const Btn = ({ variant = 'primary', className = '', ...r }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'success' }) => {
  const v = { primary: 'bg-indigo-600 text-white hover:bg-indigo-700', ghost: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50',
    danger: 'bg-red-600 text-white hover:bg-red-700', success: 'bg-emerald-600 text-white hover:bg-emerald-700' }[variant];
  return <button {...r} className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${v} ${className}`} />;
};
export const Card = ({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) => (
  <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
    {title && <h2 className="mb-3 text-base font-semibold text-slate-900">{title}</h2>}{children}
  </section>
);
export const Input = ({ label, ...r }: InputHTMLAttributes<HTMLInputElement> & { label: string }) => (
  <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">{label}</span>
    <input {...r} className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200" /></label>
);
export const Notice = ({ kind = 'error', children }: { kind?: 'error' | 'ok' | 'warn'; children: ReactNode }) => (
  <div role="alert" className={`rounded-lg px-3 py-2 text-sm ${{ error: 'bg-red-50 text-red-800', ok: 'bg-emerald-50 text-emerald-800', warn: 'bg-amber-50 text-amber-800' }[kind]}`}>{children}</div>
);
const badge: Record<string, string> = { Present: 'bg-emerald-100 text-emerald-800', Late: 'bg-amber-100 text-amber-800', Absent: 'bg-red-100 text-red-800',
  Pending: 'bg-slate-100 text-slate-700', Flagged: 'bg-orange-100 text-orange-800' };
export const Badge = ({ s }: { s: string }) => <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge[s] ?? badge.Pending}`}>{s}</span>;

export const Logo = () => (
  <Link to="/" className="flex items-center gap-2 text-lg font-bold text-slate-900">
    <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-white">G</span>GeoAttend
  </Link>
);
export function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  return (<div className="min-h-screen">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
      <Logo /><div className="flex items-center gap-3 text-sm"><span className="hidden text-slate-600 sm:inline">{user?.name} ({user?.role})</span>
      <Btn variant="ghost" onClick={logout}>Log out</Btn></div></div></header>
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">{children}</main></div>);
}
