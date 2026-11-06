import mongoose, { Schema, model } from 'mongoose';
import { env } from '../config/env.js';

const id = Schema.Types.ObjectId;
const opts = { timestamps: true } as const;

const userSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  role: { type: String, enum: ['student', 'lecturer'], required: true },
  rollNo: { type: String, trim: true, sparse: true, unique: true },
  emailVerified: { type: Boolean, default: false },
  faceDescriptor: { type: [Number], select: false }, faceEnrolledAt: Date, // biometric template (numbers only, no photo)
  otpHash: String, otpExpires: Date, otpAttempts: { type: Number, default: 0 },
  refreshTokens: [{ hash: String, exp: Date }],
}, opts);

const classSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  code: { type: String, required: true, trim: true, maxlength: 20 },
  lecturerId: { type: id, ref: 'User', required: true, index: true },
  studentIds: [{ type: id, ref: 'User' }],
}, opts);

const sessionSchema = new Schema({
  classId: { type: id, ref: 'Class', required: true },
  lecturerId: { type: id, ref: 'User', required: true, index: true },
  joinCode: { type: String, required: true, unique: true },
  center: { lat: { type: Number, required: true, min: -90, max: 90 }, lng: { type: Number, required: true, min: -180, max: 180 } },
  radiusM: { type: Number, required: true, min: 5, max: 1000 },
  startsAt: { type: Date, required: true }, endsAt: { type: Date, required: true },
  intervalMin: { type: Number, default: 5, min: 1, max: 30 },
  minPresencePct: { type: Number, default: 75, min: 1, max: 100 },
  graceMissed: { type: Number, default: 1, min: 0, max: 10 },
  lateAfterMin: { type: Number, default: 10, min: 0 },
  requireFace: { type: Boolean, default: true },
  status: { type: String, enum: ['active', 'closed'], default: 'active' },
}, opts);
sessionSchema.index({ classId: 1, startsAt: -1 });

const checkInSchema = new Schema({
  sessionId: { type: id, ref: 'Session', required: true },
  studentId: { type: id, ref: 'User', required: true },
  lat: Number, lng: Number, accuracyM: Number, distanceM: Number,
  inside: Boolean, flags: [String],
  at: { type: Date, default: Date.now },
});
checkInSchema.index({ sessionId: 1, studentId: 1, at: -1 });
// retention policy: location check-ins are deleted automatically
checkInSchema.index({ at: 1 }, { expireAfterSeconds: env.CHECKIN_RETENTION_DAYS * 86_400 });

const recordSchema = new Schema({
  sessionId: { type: id, ref: 'Session', required: true },
  studentId: { type: id, ref: 'User', required: true },
  status: { type: String, enum: ['Present', 'Absent', 'Late', 'Pending', 'Flagged'], default: 'Pending' },
  presencePct: { type: Number, default: 0 },
  flags: [String],
  faceVerified: { type: Boolean, default: false }, faceAttempts: { type: Number, default: 0 },
  reviewedBy: { type: id, ref: 'User' }, reviewNote: { type: String, maxlength: 500 },
}, opts);
recordSchema.index({ sessionId: 1, studentId: 1 }, { unique: true });

const auditSchema = new Schema({
  actorId: { type: id, ref: 'User' }, action: { type: String, required: true },
  target: String, meta: Schema.Types.Mixed, at: { type: Date, default: Date.now, index: true },
});

export const User = model('User', userSchema);
export const Class = model('Class', classSchema);
export const Session = model('Session', sessionSchema);
export const CheckIn = model('CheckIn', checkInSchema);
export const AttendanceRecord = model('AttendanceRecord', recordSchema);
export const AuditLog = model('AuditLog', auditSchema);
export const audit = (actorId: unknown, action: string, target?: string, meta?: unknown) =>
  AuditLog.create({ actorId, action, target, meta });
export { mongoose };
