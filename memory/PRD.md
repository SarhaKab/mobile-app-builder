# KFIT — PRD
## Original problem
"Créer une application mobile fonctionnelle et sécurisée à partir des éléments envoyés" (KFIT brand kit: black/ivory/sage, Tulum, by T7 Corp, Train Smarter. Live Stronger.)
User choices: Programs + AI Nutrition + Progress + AI Coach + Tulum coaching booking; Auth JWT email + Emergent Google; Claude Sonnet 5.5; EN/ES/FR.

## Architecture
- Expo Router (tabs: Home, Training, Coach, Profile; stack: program/[id], nutrition, progress, booking, welcome, login)
- FastAPI /api + MongoDB; emergentintegrations (claude-sonnet-5-5) for coach SSE stream + nutrition JSON plan
- Security: bcrypt, JWT (iss/aud/jti, 7d) with revocation on logout, Google session tokens, brute-force lock (5 fails/15 min), per-user data isolation, SecureStore token

## Implemented (2026-06)
- Auth (email + Google), i18n EN/ES/FR, dashboard, 3 programs w/ enroll + completion, AI coach chat streaming w/ history, AI nutrition plan, progress log + chart, booking (3 types, 14 days, slots, cancel)

## Backlog
- P0: full automated test run (stopped: credits)
- P1: refresh tokens, password reset, real brand fonts/logo assets, app icon
- P2: payments for coaching sessions, community feed, workout timer
