import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './auth';
import { Landing, Login, Register } from './Public';
import Student from './Student';
import Lecturer from './Lecturer';

function Guard({ role, children }: { role: 'student' | 'lecturer'; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="p-8 text-slate-500">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return user.role === role ? <>{children}</> : <Navigate to={`/${user.role}`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/student" element={<Guard role="student"><Student /></Guard>} />
      <Route path="/lecturer" element={<Guard role="lecturer"><Lecturer /></Guard>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
