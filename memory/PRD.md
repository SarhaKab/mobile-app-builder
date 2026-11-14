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

## Update 2026-11 (branch kfit-supabase + security)
- Auth is now Supabase Auth only (email + password, confirmation required); Google button removed. Supabase schema/RLS in /supabase, docs in docs/AUTH.md.
- Backend accepts ONLY Supabase access tokens; legacy /api/auth/register|login|session and legacy JWT/session tokens removed (audit SEC-001).
- AI limits per user (audit SEC-002): coach 5/min + 50/day, nutrition 2/min + 5/day (AI_LIMITS in server.py, Mongo `ai_usage`), 429 with translated message.
- Tested: sign-in, session persistence, logout, all main screens, real Supabase token on backend (iterations 1-2).
- Open: audit minor points (CORS *, .gitignore .env, unused python-jose), SMTP provider, password reset, Google/Apple via Supabase, confirm-email screen untested.

## Update 2026-11 (cahier des charges global — phase 1 fin + phase 2 KFIT HOME)
- Spec: /tmp was source; summary: 4 universes (HOME, ON DEMAND, AI, CLUB flag-off), client/coach/admin spaces, payments, MX legal constraints. Order: P1 foundations, P2 KFIT HOME, P3 ON DEMAND, P4 AI, P5 admin/compliance, P6 launch.
- Built (frontend on Supabase): catalogue (programs/videos/exercises, filters, favorites), detail screens, enroll, complete session, history, home summary, contact details (phone/address in client_profiles.preferences.contact), role badge, admin content CRUD + sample loader. Docs: docs/KFIT_HOME.md.
- Tested so far: only empty catalogue + contact save (self smoke test). Content/admin flows UNTESTED until an admin account exists (Supabase catalogue empty).
- Next: admin media upload + video player; migrate progress/nutrition/coach/booking to Supabase and delete legacy /api/programs*; Phase 3 coach space.
- Code also evolves on GitHub branch kfit-supabase (repo SarhaKab/mobile-app-builder): fetch before each step.
- 2026-11 tests (iteration 4 + main-agent browser run, test account = admin): sample loader (3 programmes / 10 videos / 38 exercises, idempotent), catalogue filters, programme/video/exercise sheets, enroll, complete, history, home summary refresh, favourites, contact save, admin programme create/validate/draft/publish/delete all OK. NOT run: admin create/edit of a video and of an exercise; non-admin UI view (single account). Testing agent's "home not refreshing" finding was not reproducible (false positive).
- 2026-11-14 exercise sheets + videos: migration 0004 applied (exercises.level_variants + videos bucket read policy). 38 sample sheets AI-written (instructions fr/en/es, muscle/equipment codes, per-level sets/reps/rest/note) — owner must review. VideoPlayer (expo-video, signed URLs). Fal.ai (Wan 3.0, 8s 720p) pilot: 3 draft videos (push-ups, goblet squat, plank) under drafts/exercises/, admin-only until approved in Admin > exercise > "Vidéo de démonstration" (approve/remove tested on a QA exercise). Tested iteration 5 + main-agent run. Pending owner decision: validate the 3 drafts, then generate remaining 35 (≈3 min and ≈0.80 USD each, estimate) or change approach. Then Phase 3 (coach space).
- 2026-11-14 narrated videos: per-language voice-over (OpenAI TTS gpt-4o-mini-tts via universal key) + synced subtitles + looped demo, scripts/narrate_exercise_videos.py (ffmpeg via imageio-ffmpeg). 3 pilot exercises x fr/en/es uploaded as drafts. Tested iteration 6 (all green). Voice quality NOT judged by anyone but the owner. Pending owner: validate; decide on remaining 35 exercises (Fal video + narration) and session-level narrated videos; then Phase 3.
- 2026-11-14 guided videos v3 (iteration 7 green): per exercise x level x language real-time follow-along (voice gpt-4o-mini-tts dynamic, Fal music, burned subtitles/countdowns, app timer +15s/skip). 27 drafts for 3 pilot exercises (308 MB, 172 min). Known defects: plank beginner clip hips piked; plank advanced uses standard clip (Fal balance exhausted mid-run); picture = 8s loop, not per-step. Approve/remove with new file set not re-tested (same code as iteration 6). Rollout to 38 exercises ≈ 76 Fal clips + ~3-4 GB storage (Supabase free tier is 1 GB). Pending owner: listen/validate, top up Fal, decide rollout; then Phase 3.
