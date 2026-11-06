import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { errorHandler, globalLimiter, notFound } from './middleware/index.js';
import auth from './routes/auth.js';
import classes from './routes/classes.js';
import sessions from './routes/sessions.js';
import attendance from './routes/attendance.js';
import reports from './routes/reports.js';
import face from './routes/face.js';

export const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: { directives: {
  ...helmet.contentSecurityPolicy.getDefaultDirectives(),
  'img-src': ["'self'", 'data:', 'https://tile.openstreetmap.org', 'https://*.tile.openstreetmap.org'], // map tiles
  'script-src': ["'self'", 'https://cdn.jsdelivr.net'], 'connect-src': ["'self'", 'https://cdn.jsdelivr.net'], 'worker-src': ["'self'", 'blob:'],
  'upgrade-insecure-requests': null } } }));
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());
app.use('/api', globalLimiter);
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', auth);
app.use('/api/classes', classes);
app.use('/api/sessions', sessions);
app.use('/api/attendance', attendance);
app.use('/api/face', face);
app.use('/api/reports', reports);
// serve the built website (web/dist) from this same server when it exists
const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
}
app.use(notFound);
app.use(errorHandler);
