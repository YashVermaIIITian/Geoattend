import 'dotenv/config';
import { z } from 'zod';

const blank = (v: unknown) => (v === '' ? undefined : v);
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  MONGO_URI: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  OTP_SECRET: z.string().min(16),
  ALLOWED_EMAIL_DOMAIN: z.string().default('iiitvadodara.ac.in'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  MAX_ACCURACY_M: z.coerce.number().default(50),
  TOLERANCE_CAP_M: z.coerce.number().default(20),
  CHECKIN_RETENTION_DAYS: z.coerce.number().default(180),
  FACE_MATCH_THRESHOLD: z.coerce.number().default(0.5), // lower = stricter
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('GeoAttend <no-reply@example.com>'),
  EMAIL_VERIFICATION: z.enum(['true', 'false']).default('true'), // 'false' = accounts are verified instantly (no OTP email)
  BREVO_API_KEY: z.preprocess(blank, z.string().optional()),
  BREVO_SENDER: z.preprocess(blank, z.string().optional()),
  LECTURER_INVITE_CODE: z.preprocess(blank, z.string().min(6).optional()),
  TLS_KEY: z.string().optional(),
  TLS_CERT: z.string().optional(),
});

export const env = schema.parse(process.env);
