import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { env } from './config/env.js';
import { connectDb } from './config/db.js';
import { app } from './app.js';
import { autoCloseExpired } from './services/finalize.js';

await connectDb();
await autoCloseExpired().catch(console.error);
setInterval(() => autoCloseExpired().catch(console.error), 60_000);
const server = env.TLS_KEY && env.TLS_CERT
  ? https.createServer({ key: fs.readFileSync(env.TLS_KEY), cert: fs.readFileSync(env.TLS_CERT) }, app)
  : http.createServer(app);
server.listen(env.PORT, () => console.log(`GeoAttend API on ${env.TLS_KEY ? 'https' : 'http'}://localhost:${env.PORT}`));
