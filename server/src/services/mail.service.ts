import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

const transport = env.SMTP_HOST
  ? nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined })
  : null;

export async function sendOtp(to: string, otp: string) {
  if (env.BREVO_API_KEY) { // HTTPS email API: works on free hosts that block SMTP ports
    const r = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ sender: { email: env.BREVO_SENDER, name: 'GeoAttend' }, to: [{ email: to }],
        subject: 'Your GeoAttend verification code', textContent: `Your code is ${otp}. It expires in 10 minutes.` }) });
    if (!r.ok) throw new Error(`Brevo send failed: ${r.status} ${await r.text()}`);
    return;
  }
  if (!transport) { console.log(`[DEV] OTP for ${to}: ${otp}`); return; } // no SMTP configured
  await transport.sendMail({ from: env.MAIL_FROM, to, subject: 'Your GeoAttend verification code', text: `Your code is ${otp}. It expires in 10 minutes.` });
}
