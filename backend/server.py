import asyncio
import json
import logging
import os
import re
import time
import uuid
from contextlib import suppress
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal, Optional

import bcrypt
import httpx
import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from pymongo import ASCENDING, DESCENDING, IndexModel
from pymongo.errors import DuplicateKeyError
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from emergentintegrations.llm.chat import LlmChat, StreamDone, TextDelta, UserMessage  # noqa: E402

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
JWT_SECRET = os.environ["JWT_SECRET"]
LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
JWT_ALG = "HS256"
JWT_ISS, JWT_AUD = "kfit-api", "kfit-app"
TOKEN_DAYS = 7
MAX_FAILED, LOCK_MINUTES = 5, 15
MODEL = ("anthropic", "claude-sonnet-5-5")
# Supabase Auth (transition) : l'application s'authentifie désormais auprès de Supabase.
# Ces deux valeurs sont publiques par conception (URL + clé « publishable »).
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://soaivvemysgzmjntmkta.supabase.co").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_MgI2Me489KLXdfeANIVnkQ_GKMdHeRy")
SUPABASE_CACHE_SECONDS = 60
logger = logging.getLogger("kfit")

INDEXES: dict[str, list[IndexModel]] = {
    "users": [IndexModel([("email", ASCENDING)], name="email", unique=True),
              IndexModel([("user_id", ASCENDING)], name="user_id", unique=True),
              IndexModel([("supabase_id", ASCENDING)], name="supabase_id", unique=True, sparse=True)],
    "user_sessions": [IndexModel([("session_token", ASCENDING)], name="token", unique=True),
                      IndexModel([("user_id", ASCENDING)], name="user_id"),
                      IndexModel([("expires_at", ASCENDING)], name="ttl", expireAfterSeconds=0)],
    "revoked_tokens": [IndexModel([("jti", ASCENDING)], name="jti", unique=True),
                       IndexModel([("expires_at", ASCENDING)], name="ttl", expireAfterSeconds=0)],
    "login_attempts": [IndexModel([("email", ASCENDING)], name="email", unique=True)],
    "progress": [IndexModel([("user_id", ASCENDING), ("date", DESCENDING)], name="user_date")],
    "completions": [IndexModel([("user_id", ASCENDING), ("program_id", ASCENDING), ("workout_index", ASCENDING)],
                               name="uniq", unique=True)],
    "coach_messages": [IndexModel([("user_id", ASCENDING), ("created_at", ASCENDING)], name="user_time")],
    "nutrition_plans": [IndexModel([("user_id", ASCENDING)], name="user_id", unique=True)],
    "bookings": [IndexModel([("date", ASCENDING), ("time", ASCENDING)], name="slot", unique=True),
                 IndexModel([("user_id", ASCENDING), ("date", ASCENDING)], name="user_date")],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)


app = FastAPI()


@app.get("/health", include_in_schema=False)
@app.head("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


api = APIRouter(prefix="/api")


def now() -> datetime:
    return datetime.now(timezone.utc)


def aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


# ---------------------------------------------------------------- models
Lang = Literal["en", "es", "fr"]


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=60)
    lang: Lang = "fr"


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class SessionIn(BaseModel):
    session_id: str = Field(min_length=1, max_length=512)


class ProfileIn(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=60)
    lang: Optional[Lang] = None
    goal: Optional[Literal["muscle", "fat_loss", "balance", "endurance"]] = None


class PublicUser(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    lang: str = "fr"
    goal: Optional[str] = None
    program_id: Optional[str] = None
    auth_provider: str = "email"


class AuthOut(BaseModel):
    token: str
    user: PublicUser


class ProgressIn(BaseModel):
    weight: float = Field(gt=20, lt=400)
    body_fat: Optional[float] = Field(None, ge=2, le=70)
    note: Optional[str] = Field(None, max_length=200)


class NutritionIn(BaseModel):
    goal: Literal["muscle", "fat_loss", "balance", "endurance"]
    weight: float = Field(gt=20, lt=400)
    height: float = Field(gt=100, lt=250)
    age: int = Field(gt=12, lt=100)
    sex: Literal["male", "female"]
    activity: Literal["low", "moderate", "high"]
    diet: Literal["omnivore", "vegetarian", "vegan"] = "omnivore"


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


class BookingIn(BaseModel):
    type: Literal["gym", "outdoor", "online"]
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    time: str


# ---------------------------------------------------------------- auth helpers
def public(u: dict) -> PublicUser:
    return PublicUser(**{k: u.get(k) for k in PublicUser.model_fields if u.get(k) is not None})


def make_jwt(user_id: str) -> str:
    t = now()
    return jwt.encode({"sub": user_id, "iss": JWT_ISS, "aud": JWT_AUD, "iat": t,
                       "exp": t + timedelta(days=TOKEN_DAYS), "jti": uuid.uuid4().hex}, JWT_SECRET, algorithm=JWT_ALG)


def bearer(request: Request) -> str:
    h = request.headers.get("Authorization", "")
    if not h.lower().startswith("bearer ") or len(h) < 10:
        raise HTTPException(401, "Not authenticated")
    return h[7:].strip()


_supabase_cache: dict[str, tuple[str, float]] = {}


async def supabase_user_id(token: str) -> Optional[str]:
    """Vérifie un jeton Supabase auprès de Supabase Auth et renvoie le user_id local.

    Le jeton n'est jamais validé localement : c'est Supabase qui confirme qu'il est
    authentique et non expiré. Un compte historique (même e-mail) n'est rattaché que si
    l'adresse a été confirmée côté Supabase, pour qu'on ne puisse pas s'approprier les
    données d'un autre en s'inscrivant avec son adresse.
    """
    hit = _supabase_cache.get(token)
    if hit and hit[1] > time.time():
        return hit[0]
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"{SUPABASE_URL}/auth/v1/user",
                            headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {token}"})
    except httpx.HTTPError as exc:
        logger.error("supabase auth unreachable: %s", exc)
        return None
    if r.status_code != 200:
        return None
    data = r.json()
    sid, email = data.get("id"), (data.get("email") or "").lower()
    if not sid or not email:
        return None
    user = await db.users.find_one({"supabase_id": sid}, {"_id": 0})
    if not user:
        legacy = await db.users.find_one({"email": email}, {"_id": 0})
        if legacy:
            if not (data.get("email_confirmed_at") or data.get("confirmed_at")):
                return None
            await db.users.update_one({"user_id": legacy["user_id"]}, {"$set": {"supabase_id": sid}})
            user = legacy
        else:
            meta = data.get("user_metadata") or {}
            user = {"user_id": f"user_{uuid.uuid4().hex[:12]}", "email": email, "supabase_id": sid,
                    "name": str(meta.get("full_name") or email.split("@")[0])[:60],
                    "lang": meta.get("lang") if meta.get("lang") in ("en", "es", "fr") else "fr",
                    "auth_provider": "supabase", "created_at": now()}
            try:
                await db.users.insert_one(dict(user))
            except DuplicateKeyError:
                user = await db.users.find_one({"supabase_id": sid}, {"_id": 0})
                if not user:
                    return None
    if len(_supabase_cache) > 5000:
        _supabase_cache.clear()
    _supabase_cache[token] = (user["user_id"], time.time() + SUPABASE_CACHE_SECONDS)
    return user["user_id"]


async def current_user(request: Request) -> dict:
    token = bearer(request)
    user_id = None
    try:
        claims = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG], issuer=JWT_ISS, audience=JWT_AUD)
        if await db.revoked_tokens.find_one({"jti": claims["jti"]}):
            raise HTTPException(401, "Session revoked")
        user_id = claims["sub"]
    except jwt.InvalidTokenError:
        s = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
        if s and aware(s["expires_at"]) >= now():
            user_id = s["user_id"]
        else:
            user_id = await supabase_user_id(token)
            if not user_id:
                raise HTTPException(401, "Invalid or expired session")
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user


# ---------------------------------------------------------------- auth routes
@api.post("/auth/register", response_model=AuthOut, status_code=201)
async def register(body: RegisterIn):
    email = body.email.lower()
    doc = {"user_id": f"user_{uuid.uuid4().hex[:12]}", "email": email, "name": body.name.strip(),
           "lang": body.lang, "auth_provider": "email", "created_at": now(),
           "password_hash": bcrypt.hashpw(body.password.encode(), bcrypt.gensalt(12)).decode()}
    try:
        await db.users.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(409, "Email already registered")
    return AuthOut(token=make_jwt(doc["user_id"]), user=public(doc))


DUMMY_HASH = bcrypt.hashpw(b"dummy-password", bcrypt.gensalt(12))


@api.post("/auth/login", response_model=AuthOut)
async def login(body: LoginIn):
    email = body.email.lower()
    att = await db.login_attempts.find_one({"email": email}, {"_id": 0})
    if att and att.get("locked_until") and aware(att["locked_until"]) > now():
        raise HTTPException(429, "Too many attempts. Try again later.")
    user = await db.users.find_one({"email": email}, {"_id": 0})
    hashed = (user or {}).get("password_hash")
    ok = bcrypt.checkpw(body.password.encode(), hashed.encode() if hashed else DUMMY_HASH) and bool(hashed)
    if not ok:
        fails = (att or {}).get("count", 0) + 1
        upd = {"count": fails, "updated_at": now()}
        if fails >= MAX_FAILED:
            upd = {"count": 0, "locked_until": now() + timedelta(minutes=LOCK_MINUTES)}
        await db.login_attempts.update_one({"email": email}, {"$set": upd}, upsert=True)
        raise HTTPException(401, "Invalid email or password")
    await db.login_attempts.delete_one({"email": email})
    return AuthOut(token=make_jwt(user["user_id"]), user=public(user))


@api.post("/auth/session", response_model=AuthOut)
async def google_session(body: SessionIn):
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get("https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                        headers={"X-Session-ID": body.session_id})
    if r.status_code != 200:
        raise HTTPException(401, "Invalid session")
    data = r.json()
    email = data["email"].lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if user:
        await db.users.update_one({"email": email}, {"$set": {"picture": data.get("picture")}})
        user["picture"] = data.get("picture")
    else:
        user = {"user_id": f"user_{uuid.uuid4().hex[:12]}", "email": email, "name": data.get("name") or email,
                "picture": data.get("picture"), "lang": "fr", "auth_provider": "google", "created_at": now()}
        await db.users.insert_one(dict(user))
    await db.user_sessions.insert_one({"session_token": data["session_token"], "user_id": user["user_id"],
                                       "expires_at": now() + timedelta(days=7), "created_at": now()})
    return AuthOut(token=data["session_token"], user=public(user))


@api.get("/auth/me", response_model=PublicUser)
async def me(user: dict = Depends(current_user)):
    return public(user)


@api.post("/auth/logout")
async def logout(request: Request, user: dict = Depends(current_user)):
    token = bearer(request)
    try:
        claims = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG], issuer=JWT_ISS, audience=JWT_AUD)
        await db.revoked_tokens.update_one({"jti": claims["jti"]},
                                           {"$set": {"expires_at": datetime.fromtimestamp(claims["exp"], timezone.utc)}},
                                           upsert=True)
    except jwt.InvalidTokenError:
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


@api.patch("/profile", response_model=PublicUser)
async def update_profile(body: ProfileIn, user: dict = Depends(current_user)):
    upd = body.model_dump(exclude_none=True)
    if upd:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": upd})
    user.update(upd)
    return public(user)


# ---------------------------------------------------------------- programs
def W(name, minutes, focus, ex):
    return {"name": name, "minutes": minutes, "focus": focus,
            "exercises": [{"name": n, "sets": s, "reps": r} for n, s, r in ex]}


PROGRAMS = [
    {"id": "strength-balance", "title": "Strength & Balance", "level": "intermediate", "weeks": 8,
     "image": "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=900",
     "desc": {"en": "Build functional strength and stability with full-body sessions.",
              "es": "Desarrolla fuerza funcional y estabilidad con sesiones de cuerpo completo.",
              "fr": "Développe force fonctionnelle et stabilité avec des séances full-body."},
     "workouts": [
         W("Upper Body", 45, "strength", [("Push-ups", 4, "12"), ("Dumbbell Row", 4, "10"), ("Overhead Press", 3, "10"), ("Plank", 3, "45s")]),
         W("Lower Body", 50, "strength", [("Goblet Squat", 4, "12"), ("Romanian Deadlift", 4, "10"), ("Walking Lunges", 3, "20"), ("Glute Bridge", 3, "15")]),
         W("Core & Mobility", 30, "balance", [("Dead Bug", 3, "12"), ("Side Plank", 3, "30s"), ("Bird Dog", 3, "12"), ("Hip Flow", 2, "5 min")]),
         W("Full Body Power", 45, "power", [("Kettlebell Swing", 5, "15"), ("Burpees", 4, "10"), ("Thrusters", 4, "10"), ("Farmer Carry", 3, "40m")]),
     ]},
    {"id": "hypertrophy", "title": "Hypertrophy", "level": "advanced", "weeks": 8,
     "image": "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=900",
     "desc": {"en": "Progressive overload split to maximize muscle gain.",
              "es": "Rutina dividida con sobrecarga progresiva para ganar músculo.",
              "fr": "Split en surcharge progressive pour maximiser la prise de muscle."},
     "workouts": [
         W("Push", 60, "chest/shoulders", [("Bench Press", 4, "8"), ("Incline DB Press", 4, "10"), ("Lateral Raise", 4, "15"), ("Triceps Dips", 3, "12")]),
         W("Pull", 60, "back/biceps", [("Pull-ups", 4, "8"), ("Barbell Row", 4, "8"), ("Face Pull", 3, "15"), ("Curl", 4, "12")]),
         W("Legs", 65, "legs", [("Back Squat", 5, "6"), ("Leg Press", 4, "12"), ("Hamstring Curl", 4, "12"), ("Calf Raise", 4, "15")]),
     ]},
    {"id": "tulum-shred", "title": "Tulum Shred", "level": "beginner", "weeks": 6,
     "image": "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=900",
     "desc": {"en": "Outdoor conditioning and fat loss inspired by the jungle and the beach.",
              "es": "Acondicionamiento al aire libre y pérdida de grasa inspirados en la selva y la playa.",
              "fr": "Conditionnement outdoor et perte de gras inspirés par la jungle et la plage."},
     "workouts": [
         W("Beach HIIT", 30, "cardio", [("Sprint", 8, "20s"), ("Jump Squats", 4, "15"), ("Mountain Climbers", 4, "30s"), ("Bear Crawl", 3, "20m")]),
         W("Jungle Circuit", 40, "conditioning", [("Step-ups", 4, "12"), ("Push-ups", 4, "10"), ("Skater Jumps", 4, "20"), ("Hollow Hold", 3, "30s")]),
         W("Recovery Flow", 25, "recovery", [("Breathwork", 1, "5 min"), ("Yoga Flow", 1, "15 min"), ("Stretching", 1, "5 min")]),
     ]},
]
PROG_BY_ID = {p["id"]: p for p in PROGRAMS}


async def completed_set(user_id: str, program_id: str) -> list[int]:
    docs = await db.completions.find({"user_id": user_id, "program_id": program_id}, {"_id": 0, "workout_index": 1}).to_list(100)
    return sorted(d["workout_index"] for d in docs)


@api.get("/programs")
async def list_programs(user: dict = Depends(current_user)):
    return [{k: p[k] for k in ("id", "title", "level", "weeks", "image", "desc")} | {"count": len(p["workouts"])} for p in PROGRAMS]


@api.get("/programs/{pid}")
async def get_program(pid: str, user: dict = Depends(current_user)):
    p = PROG_BY_ID.get(pid)
    if not p:
        raise HTTPException(404, "Program not found")
    return p | {"completed": await completed_set(user["user_id"], pid), "enrolled": user.get("program_id") == pid}


@api.post("/programs/{pid}/enroll")
async def enroll(pid: str, user: dict = Depends(current_user)):
    if pid not in PROG_BY_ID:
        raise HTTPException(404, "Program not found")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"program_id": pid}})
    return {"ok": True}


@api.post("/programs/{pid}/workouts/{idx}/complete")
async def complete_workout(pid: str, idx: int, user: dict = Depends(current_user)):
    p = PROG_BY_ID.get(pid)
    if not p or not 0 <= idx < len(p["workouts"]):
        raise HTTPException(404, "Workout not found")
    with suppress(DuplicateKeyError):
        await db.completions.insert_one({"user_id": user["user_id"], "program_id": pid, "workout_index": idx,
                                         "minutes": p["workouts"][idx]["minutes"], "created_at": now()})
    return {"completed": await completed_set(user["user_id"], pid)}


@api.get("/dashboard")
async def dashboard(user: dict = Depends(current_user)):
    pid = user.get("program_id")
    prog = None
    if pid in PROG_BY_ID:
        p, done = PROG_BY_ID[pid], await completed_set(user["user_id"], pid)
        nxt = next((i for i in range(len(p["workouts"])) if i not in done), None)
        prog = {"id": pid, "title": p["title"], "image": p["image"], "total": len(p["workouts"]), "done": len(done),
                "next_index": nxt, "next": p["workouts"][nxt] if nxt is not None else None}
    comps = await db.completions.find({"user_id": user["user_id"]}, {"_id": 0, "minutes": 1}).to_list(1000)
    last = await db.progress.find({"user_id": user["user_id"]}, {"_id": 0}).sort("date", -1).limit(1).to_list(1)
    plan = await db.nutrition_plans.find_one({"user_id": user["user_id"]}, {"_id": 0, "plan.calories": 1})
    booking = await db.bookings.find({"user_id": user["user_id"], "date": {"$gte": now().strftime("%Y-%m-%d")}},
                                     {"_id": 0}).sort([("date", 1), ("time", 1)]).limit(1).to_list(1)
    return {"program": prog, "workouts": len(comps), "minutes": sum(c["minutes"] for c in comps),
            "weight": last[0]["weight"] if last else None,
            "calories": plan["plan"]["calories"] if plan else None, "next_booking": booking[0] if booking else None}


# ---------------------------------------------------------------- progress
@api.post("/progress", status_code=201)
async def add_progress(body: ProgressIn, user: dict = Depends(current_user)):
    doc = {"id": uuid.uuid4().hex, "user_id": user["user_id"], "date": now().isoformat()} | body.model_dump()
    await db.progress.insert_one(dict(doc))
    return {k: v for k, v in doc.items() if k != "user_id"}


@api.get("/progress")
async def get_progress(user: dict = Depends(current_user)):
    return await db.progress.find({"user_id": user["user_id"]}, {"_id": 0, "user_id": 0}).sort("date", -1).limit(60).to_list(60)


@api.delete("/progress/{eid}")
async def del_progress(eid: str, user: dict = Depends(current_user)):
    await db.progress.delete_one({"id": eid, "user_id": user["user_id"]})
    return {"ok": True}


# ---------------------------------------------------------------- AI
LANG_NAME = {"en": "English", "es": "Spanish", "fr": "French"}


def llm(session: str, system: str) -> LlmChat:
    return LlmChat(api_key=LLM_KEY, session_id=session, system_message=system).with_model(*MODEL)


@api.post("/nutrition/plan")
async def gen_plan(body: NutritionIn, user: dict = Depends(current_user)):
    lang = LANG_NAME.get(user.get("lang", "fr"), "French")
    system = ("You are KFIT's expert sports nutritionist. Reply ONLY with valid minified JSON, no markdown. "
              f"All text values must be in {lang}.")
    prompt = (f"Create a 1-day nutrition plan for: {body.model_dump_json()}. JSON schema: "
              '{"calories":int,"protein":int,"carbs":int,"fats":int,"summary":str,'
              '"meals":[{"name":str,"time":str,"calories":int,"items":[str]}],"tips":[str]} '
              "with 4 meals and 3 tips. Macros in grams.")
    try:
        raw = await llm(f"nut_{user['user_id']}_{uuid.uuid4().hex[:6]}", system).send_message(UserMessage(text=prompt))
        plan = json.loads(re.search(r"\{.*\}", raw, re.S).group(0))
    except Exception as exc:
        logger.error("nutrition plan failed: %s", exc)
        raise HTTPException(502, "AI generation failed, please retry")
    await db.nutrition_plans.update_one({"user_id": user["user_id"]},
                                        {"$set": {"plan": plan, "input": body.model_dump(), "updated_at": now().isoformat()}},
                                        upsert=True)
    return {"plan": plan, "input": body.model_dump()}


@api.get("/nutrition/plan")
async def get_plan(user: dict = Depends(current_user)):
    doc = await db.nutrition_plans.find_one({"user_id": user["user_id"]}, {"_id": 0, "user_id": 0})
    return doc or {"plan": None}


@api.get("/coach/messages")
async def coach_messages(user: dict = Depends(current_user)):
    return await db.coach_messages.find({"user_id": user["user_id"]}, {"_id": 0, "user_id": 0}).sort("created_at", 1).limit(100).to_list(100)


@api.delete("/coach/messages")
async def clear_messages(user: dict = Depends(current_user)):
    await db.coach_messages.delete_many({"user_id": user["user_id"]})
    return {"ok": True}


@api.post("/coach/chat")
async def coach_chat(body: ChatIn, user: dict = Depends(current_user)):
    uid = user["user_id"]
    history = await db.coach_messages.find({"user_id": uid}, {"_id": 0}).sort("created_at", -1).limit(12).to_list(12)
    transcript = "\n".join(f"{m['role'].upper()}: {m['content']}" for m in reversed(history))
    prog = PROG_BY_ID.get(user.get("program_id") or "", {}).get("title", "none")
    system = (f"You are the KFIT AI Coach (brand by T7 Corp, lead coach Kemy Figaro, based in Tulum). "
              f"Train smarter, live stronger. Be concise, motivating, practical; use short paragraphs or bullet lists. "
              f"Always reply in {LANG_NAME.get(user.get('lang', 'fr'), 'French')}. User: {user['name']}, goal: "
              f"{user.get('goal') or 'unknown'}, program: {prog}. Never give medical diagnoses; suggest a professional when needed.")
    text = (f"Conversation so far:\n{transcript}\n\nUSER: {body.message}" if transcript else body.message)
    await db.coach_messages.insert_one({"id": uuid.uuid4().hex, "user_id": uid, "role": "user",
                                        "content": body.message, "created_at": now().isoformat()})

    async def gen():
        full = ""
        try:
            async for ev in llm(f"coach_{uid}", system).stream_message(UserMessage(text=text)):
                if isinstance(ev, TextDelta):
                    full += ev.content
                    yield f"data: {json.dumps({'delta': ev.content})}\n\n"
                elif isinstance(ev, StreamDone):
                    break
        except Exception as exc:
            logger.error("coach stream failed: %s", exc)
            yield f"data: {json.dumps({'error': 'AI unavailable'})}\n\n"
        if full:
            await db.coach_messages.insert_one({"id": uuid.uuid4().hex, "user_id": uid, "role": "assistant",
                                                "content": full, "created_at": now().isoformat()})
        yield "data: [DONE]\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ---------------------------------------------------------------- coaching bookings (Tulum)
SLOTS = ["07:00", "08:30", "10:00", "16:00", "17:30", "19:00"]


@api.get("/coaching/slots")
async def slots(date: str = Query(pattern=r"^\d{4}-\d{2}-\d{2}$"), user: dict = Depends(current_user)):
    taken = {b["time"] for b in await db.bookings.find({"date": date}, {"_id": 0, "time": 1}).to_list(50)}
    today = now().strftime("%Y-%m-%d")
    cur = now().strftime("%H:%M")
    return [{"time": t, "available": t not in taken and (date > today or (date == today and t > cur))} for t in SLOTS]


@api.post("/bookings", status_code=201)
async def book(body: BookingIn, user: dict = Depends(current_user)):
    if body.time not in SLOTS or body.date < now().strftime("%Y-%m-%d"):
        raise HTTPException(400, "Invalid slot")
    doc = {"id": uuid.uuid4().hex, "user_id": user["user_id"], "type": body.type, "date": body.date,
           "time": body.time, "coach": "Kemy Figaro", "created_at": now().isoformat()}
    try:
        await db.bookings.insert_one(dict(doc))
    except DuplicateKeyError:
        raise HTTPException(409, "Slot already booked")
    return {k: v for k, v in doc.items() if k != "user_id"}


@api.get("/bookings")
async def my_bookings(user: dict = Depends(current_user)):
    return await db.bookings.find({"user_id": user["user_id"]}, {"_id": 0, "user_id": 0}).sort([("date", 1), ("time", 1)]).to_list(100)


@api.delete("/bookings/{bid}")
async def cancel(bid: str, user: dict = Depends(current_user)):
    r = await db.bookings.delete_one({"id": bid, "user_id": user["user_id"]})
    if not r.deleted_count:
        raise HTTPException(404, "Booking not found")
    return {"ok": True}


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")


@app.on_event("startup")
async def start_index_build():
    app.state.index_task = asyncio.create_task(ensure_indexes())


@app.on_event("shutdown")
async def shutdown_db_client():
    app.state.index_task.cancel()
    with suppress(asyncio.CancelledError):
        await app.state.index_task
    client.close()
