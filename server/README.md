# GeoAttend: server (Phase 2-4)

Express + MongoDB API for GPS-geofenced attendance. Frontend comes in later phases.

## Run
```bash
cd server
npm install
cp .env.example .env        # set the three secrets and MONGO_URI
npm run seed                # creates a test lecturer
npm run dev                 # http://localhost:4000/api/health
npm test                    # geofence, anomaly and status logic (no DB needed)
```
Without SMTP settings, signup OTPs are printed in the server console. Set `ALLOWED_EMAIL_DOMAIN` to your institute's real student-email domain.

## API (JSON; send `Authorization: Bearer <accessToken>`)
| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | /api/auth/register | public | institute email + password; sends OTP |
| POST | /api/auth/verify-otp | public | `{email, otp}` |
| POST | /api/auth/login | public | returns access token; refresh token in httpOnly cookie |
| POST | /api/auth/refresh, /logout | cookie | rotate / revoke refresh token |
| POST/GET | /api/classes | lecturer | create / list classes |
| POST | /api/sessions | lecturer | `{classId, center{lat,lng}, radiusM, durationMin, intervalMin?, minPresencePct?, graceMissed?, lateAfterMin?}` |
| GET | /api/sessions | lecturer | list own sessions |
| POST | /api/sessions/join | student | `{code}` returns map data |
| POST | /api/sessions/:id/checkin | student | `{lat, lng, accuracyM}` |
| GET | /api/sessions/:id/live | lecturer | per-student status, last distance, flags |
| POST | /api/sessions/:id/close | lecturer | finalise statuses |
| PATCH | /api/attendance/:recordId/review | lecturer | `{decision: approve/reject, note?}` |
| GET | /api/attendance/me | student | history and percentage |

## Decision rules
Server-side only. Fix is rejected (nothing stored) if accuracy > `MAX_ACCURACY_M`. Inside = distance <= radius + min(accuracy, `TOLERANCE_CAP_M`). Impossible-speed and frozen-coordinate patterns mark a record **Flagged** for lecturer review. These are heuristics for suspicious activity, not proof or prevention of GPS spoofing. Check-ins are auto-deleted after `CHECKIN_RETENTION_DAYS`.
