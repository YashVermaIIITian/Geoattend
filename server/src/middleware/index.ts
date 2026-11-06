import type { ErrorRequestHandler, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import type { ZodTypeAny } from 'zod';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

declare global {
  namespace Express { interface Request { user?: { id: string; role: 'student' | 'lecturer' } } }
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return next(new AppError(401, 'UNAUTHENTICATED', 'Login required'));
  try {
    const p = jwt.verify(h.slice(7), env.JWT_ACCESS_SECRET) as { sub: string; role: 'student' | 'lecturer' };
    req.user = { id: p.sub, role: p.role };
    next();
  } catch { next(new AppError(401, 'TOKEN_INVALID', 'Session expired')); }
};

export const requireRole = (role: 'student' | 'lecturer'): RequestHandler => (req, _res, next) =>
  req.user?.role === role ? next() : next(new AppError(403, 'FORBIDDEN', 'Not allowed for your role'));

export const validate = (schema: ZodTypeAny): RequestHandler => (req, _res, next) => {
  const r = schema.safeParse(req.body);
  if (!r.success) return next(new AppError(400, 'VALIDATION', r.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')));
  req.body = r.data;
  next();
};

const limiter = (windowMs: number, max: number) =>
  rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } } });
export const globalLimiter = limiter(60_000, 300);
export const authLimiter = limiter(15 * 60_000, 20);
export const checkinLimiter = limiter(60_000, 12);

export const notFound: RequestHandler = (_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Route not found'));
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  if (err?.code === 11000) return res.status(409).json({ error: { code: 'DUPLICATE', message: 'Already exists' } });
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
};
