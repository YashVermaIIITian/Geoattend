import argon2 from 'argon2';
import { env } from '../config/env.js';
import { connectDb } from '../config/db.js';
import { Class, User, mongoose } from '../models/index.js';

await connectDb();
const pw = await argon2.hash('Lecturer@12345');
const lec = await User.findOneAndUpdate({ email: `lecturer@${env.ALLOWED_EMAIL_DOMAIN}` },
  { $set: { name: 'Dr. Test Lecturer', role: 'lecturer', passwordHash: pw, emailVerified: true } }, { upsert: true, new: true });
await Class.findOneAndUpdate({ lecturerId: lec._id, code: 'EC101' }, { $set: { name: 'Electronics & Communication' } }, { upsert: true });
console.log(`Seeded lecturer: lecturer@${env.ALLOWED_EMAIL_DOMAIN} / Lecturer@12345  (change after first login)`);
await mongoose.disconnect();
