import { Router, type Response } from 'express';
import argon2 from 'argon2';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env.js';
import { User } from '../models/index.js';
import { authLimiter, validate } from '../middleware/index.js';
import { ah, AppError } from '../utils/errors.js';
import { sendOtp } from '../services/mail.service.js';

const r = Router();
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const otpHash = (email: string, otp: string) => crypto.createHmac('sha256', env.OTP_SECRET).update(`${email}:${otp}`).digest('hex');
const COOKIE = 'ga_refresh';
const REFRESH_MS = 7 * 86_400_000;

async function issue(res: Response, user: InstanceType<typeof User>) {
  const access = jwt.sign({ sub: String(user._id), role: user.role }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });
  const refresh = crypto.randomBytes(48).toString('hex');
  user.refreshTokens.push({ hash: sha(refresh), exp: new Date(Date.now() + REFRESH_MS) });
  user.set('refreshTokens', user.refreshTokens.filter(t => t.exp! > new Date()).slice(-3)); // max 3 live sessions
  await user.save();
  res.cookie(COOKIE, refresh, { httpOnly: true, sameSite: 'strict', secure: env.NODE_ENV === 'production', path: '/api/auth', maxAge: REFRESH_MS });
  return { accessToken: access, user: { id: user._id, name: user.name, email: user.email, role: user.role, rollNo: user.rollNo } };
}

const email = z.string().email().max(120).transform(s => s.toLowerCase());
const registerSchema = z.object({ email, password: z.string().min(10).max(128), name: z.string().min(2).max(100),
  rollNo: z.string().trim().max(20).optional(), inviteCode: z.string().max(64).optional() });
const domainOk = (e: string) => env.ALLOWED_EMAIL_DOMAIN.split(',').map(s => s.trim().toLowerCase()).some(d => d === '*' || e.endsWith(`@${d}`));

r.post('/register', authLimiter, validate(registerSchema), ah(async (req, res) => {
  const { email, password, name, rollNo, inviteCode } = req.body;
  if (!domainOk(email)) throw new AppError(400, 'EMAIL_DOMAIN', 'Use your institute email address');
  let role: 'student' | 'lecturer' = 'student';
  if (inviteCode) {
    if (!env.LECTURER_INVITE_CODE || inviteCode !== env.LECTURER_INVITE_CODE) throw new AppError(403, 'BAD_INVITE', 'Invalid teacher invite code');
    role = 'lecturer';
  } else if (!rollNo || rollNo.length < 3) throw new AppError(400, 'VALIDATION', 'Roll number is required for students');
  const existing = await User.findOne({ email });
  if (existing?.emailVerified) throw new AppError(409, 'EXISTS', 'Account already exists');
  const byEmail = env.EMAIL_VERIFICATION === 'true';
  const otp = String(crypto.randomInt(100000, 1000000));
  const fields = { passwordHash: await argon2.hash(password), name, role, emailVerified: !byEmail, ...(rollNo ? { rollNo } : {}),
    ...(byEmail ? { otpHash: otpHash(email, otp), otpExpires: new Date(Date.now() + 600_000), otpAttempts: 0 } : {}) };
  await User.findOneAndUpdate({ email }, { $set: fields }, { upsert: true }); // unverified re-register resends OTP
  if (byEmail) {
    try { await sendOtp(email, otp); } catch (e) { console.error(e); throw new AppError(502, 'EMAIL_FAILED', 'Could not send the verification email. Try again later.'); }
  }
  res.status(201).json({ verified: !byEmail, message: byEmail ? 'Verification code sent' : 'Account created. You can log in.' });
}));

r.post('/verify-otp', authLimiter, validate(z.object({ email, otp: z.string().length(6) })), ah(async (req, res) => {
  const u = await User.findOne({ email: req.body.email });
  if (!u || u.emailVerified || !u.otpHash || !u.otpExpires) throw new AppError(400, 'OTP_INVALID', 'Invalid or expired code');
  if (u.otpExpires < new Date() || u.otpAttempts >= 5) throw new AppError(400, 'OTP_EXPIRED', 'Code expired; register again');
  const given = Buffer.from(otpHash(u.email, req.body.otp)), want = Buffer.from(u.otpHash);
  if (!crypto.timingSafeEqual(given, want)) { u.otpAttempts += 1; await u.save(); throw new AppError(400, 'OTP_INVALID', 'Invalid or expired code'); }
  u.emailVerified = true; u.set({ otpHash: undefined, otpExpires: undefined, otpAttempts: 0 });
  await u.save();
  res.json({ message: 'Email verified. You can log in.' });
}));

r.post('/login', authLimiter, validate(z.object({ email, password: z.string().min(1).max(128) })), ah(async (req, res) => {
  const u = await User.findOne({ email: req.body.email });
  const ok = u && await argon2.verify(u.passwordHash, req.body.password);
  if (!u || !ok) throw new AppError(401, 'BAD_LOGIN', 'Incorrect email or password');
  if (!u.emailVerified) throw new AppError(403, 'NOT_VERIFIED', 'Verify your email first');
  res.json(await issue(res, u));
}));

r.post('/refresh', ah(async (req, res) => {
  const token = req.cookies?.[COOKIE];
  const u = token && await User.findOne({ 'refreshTokens.hash': sha(token) });
  if (!u) throw new AppError(401, 'REFRESH_INVALID', 'Please log in again');
  u.set('refreshTokens', u.refreshTokens.filter(t => t.hash !== sha(token))); // rotate: old token dies
  res.json(await issue(res, u));
}));

r.post('/logout', ah(async (req, res) => {
  const token = req.cookies?.[COOKIE];
  if (token) await User.updateOne({ 'refreshTokens.hash': sha(token) }, { $pull: { refreshTokens: { hash: sha(token) } } });
  res.clearCookie(COOKIE, { path: '/api/auth' });
  res.json({ message: 'Logged out' });
}));

export default r;
