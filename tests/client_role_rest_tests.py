"""KFIT Client-role REST tests (Supabase direct + backend API).

Iteration 8 — second (non-admin) Supabase account.
STRICT: never print tokens, emails, passwords. Cleans up its own TEST_* data.
"""

import os
import time
import uuid

import pytest
import requests

SUPABASE_URL = "https://soaivvemysgzmjntmkta.supabase.co"
SUPABASE_KEY = "sb_publishable_MgI2Me489KLXdfeANIVnkQ_GKMdHeRy"
BACKEND_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else None
if not BACKEND_URL:
    # fall back to reading frontend/.env
    for line in open("/app/frontend/.env").read().splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BACKEND_URL = line.split("=", 1)[1].strip().rstrip("/")
            break

CLIENT_EMAIL = os.environ.get("KFIT_CLIENT_EMAIL")
CLIENT_PASSWORD = os.environ.get("KFIT_CLIENT_PASSWORD")


@pytest.fixture(scope="session")
def client_token():
    assert CLIENT_EMAIL and CLIENT_PASSWORD, "KFIT_CLIENT_EMAIL/PASSWORD env missing"
    r = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": SUPABASE_KEY, "Content-Type": "application/json"},
        json={"email": CLIENT_EMAIL, "password": CLIENT_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"Supabase login failed: {r.status_code}"
    tok = r.json()["access_token"]
    uid = r.json()["user"]["id"]
    return {"token": tok, "uid": uid}


@pytest.fixture(scope="session")
def rest_h(client_token):
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {client_token['token']}",
        "Content-Type": "application/json",
    }


@pytest.fixture(scope="session")
def api_h(client_token):
    return {"Authorization": f"Bearer {client_token['token']}", "Content-Type": "application/json"}


# ---------------------------------------------------------- 1. role & basic reads
def test_backend_me_role_client(api_h):
    r = requests.get(f"{BACKEND_URL}/api/auth/me", headers=api_h, timeout=10)
    assert r.status_code == 200, r.text
    # Role is not exposed by backend PublicUser; just make sure login works.


def test_supabase_users_self_only(rest_h, client_token):
    r = requests.get(f"{SUPABASE_URL}/rest/v1/users?select=id,role,full_name", headers=rest_h, timeout=10)
    assert r.status_code == 200, r.text
    rows = r.json()
    assert len(rows) == 1
    assert rows[0]["id"] == client_token["uid"]
    assert rows[0]["role"] == "client"


def test_supabase_client_profile_self_only(rest_h, client_token):
    r = requests.get(f"{SUPABASE_URL}/rest/v1/client_profiles?select=user_id,preferences", headers=rest_h, timeout=10)
    assert r.status_code == 200, r.text
    rows = r.json()
    for row in rows:
        assert row["user_id"] == client_token["uid"]


def test_programs_videos_exercises_visible(rest_h):
    for table, minimum in [("programs", 3), ("videos", 10), ("exercises", 38)]:
        r = requests.get(f"{SUPABASE_URL}/rest/v1/{table}?select=id&limit=1000", headers=rest_h, timeout=10)
        assert r.status_code == 200, f"{table}: {r.status_code}"
        assert len(r.json()) >= minimum, f"{table}: expected >={minimum} got {len(r.json())}"


# ---------------------------------------------------------- 2. write refusals
def test_insert_program_refused(rest_h):
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/programs",
        headers={**rest_h, "Prefer": "return=representation"},
        json={"slug": "rls-probe", "title": {"fr": "x", "en": "x", "es": "x"},
              "description": {"fr": "x", "en": "x", "es": "x"},
              "goal": "muscle_gain", "level": "beginner", "weeks": 4,
              "is_published": True},
        timeout=10,
    )
    assert r.status_code in (401, 403), f"insert_program got {r.status_code}: {r.text[:120]}"


def test_patch_exercise_affects_zero_rows(rest_h):
    # Capture "before"
    r0 = requests.get(
        f"{SUPABASE_URL}/rest/v1/exercises?slug=eq.sample-plank&select=slug,level_variants",
        headers=rest_h, timeout=10)
    assert r0.status_code == 200 and r0.json(), "sample-plank must exist"
    before = r0.json()[0]
    r = requests.patch(
        f"{SUPABASE_URL}/rest/v1/exercises?slug=eq.sample-plank",
        headers={**rest_h, "Prefer": "return=representation"},
        json={"level_variants": {}},
        timeout=10,
    )
    # Either refused outright, or "returned 200 with []" meaning 0 rows affected
    if r.status_code == 200:
        assert r.json() == [], f"PATCH unexpectedly affected rows: {r.text[:120]}"
    else:
        assert r.status_code in (401, 403), f"{r.status_code}: {r.text[:120]}"
    # Re-read to confirm unchanged
    r1 = requests.get(
        f"{SUPABASE_URL}/rest/v1/exercises?slug=eq.sample-plank&select=slug,level_variants",
        headers=rest_h, timeout=10)
    assert r1.json()[0]["level_variants"] == before["level_variants"]


def test_delete_exercise_affects_zero_rows(rest_h):
    r = requests.delete(
        f"{SUPABASE_URL}/rest/v1/exercises?slug=eq.sample-plank",
        headers={**rest_h, "Prefer": "return=representation"},
        timeout=10,
    )
    if r.status_code == 200:
        assert r.json() == [], f"DELETE unexpectedly removed rows: {r.text[:120]}"
    else:
        assert r.status_code in (401, 403), f"{r.status_code}: {r.text[:120]}"
    r1 = requests.get(f"{SUPABASE_URL}/rest/v1/exercises?slug=eq.sample-plank&select=id", headers=rest_h)
    assert r1.status_code == 200 and r1.json(), "sample-plank was removed!"


# ---------------------------------------------------------- 3. storage probes
def test_storage_upload_refused(rest_h, client_token):
    r = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/videos/_probe/x.txt",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {client_token['token']}",
                 "Content-Type": "text/plain"},
        data=b"probe",
        timeout=10,
    )
    assert r.status_code in (400, 401, 403), f"upload got {r.status_code}"


def test_storage_delete_nonexistent_refused(rest_h, client_token):
    r = requests.delete(
        f"{SUPABASE_URL}/storage/v1/object/videos/_probe/nonexistent-{uuid.uuid4().hex[:6]}.mp4",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {client_token['token']}"},
        timeout=10,
    )
    assert r.status_code in (400, 401, 403, 404), f"delete got {r.status_code}"


# ---------------------------------------------------------- 4. storage read drafts REFUSED (iter 9)
# After migration 0005: client CAN'T read/sign/list anything under drafts/, but can still read non-drafts.
DRAFT_PATHS = [
    "drafts/exercises/sample-plank.beginner.fr.mp4",
    "drafts/exercises/sample-plank.mp4",
    "drafts/exercises/sample-plank.beginner.fr.json",
    "drafts/exercises/sample-push-ups.beginner.fr.mp4",
    "drafts/exercises/sample-goblet-squat.beginner.fr.mp4",
]


@pytest.mark.parametrize("path", DRAFT_PATHS)
def test_storage_read_drafts_refused(client_token, path):
    r = requests.get(
        f"{SUPABASE_URL}/storage/v1/object/authenticated/videos/{path}",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {client_token['token']}",
                 "Range": "bytes=0-1023"},
        timeout=15,
    )
    assert r.status_code in (400, 401, 403, 404), f"range GET got {r.status_code}"
    body = r.text.lower()
    assert "not found" in body or "unauthor" in body or "forbidden" in body or "error" in body, body[:200]


@pytest.mark.parametrize("path", DRAFT_PATHS[:3])
def test_storage_sign_drafts_refused(client_token, path):
    r = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/sign/videos/{path}",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {client_token['token']}",
                 "Content-Type": "application/json"},
        json={"expiresIn": 60},
        timeout=10,
    )
    assert r.status_code in (400, 401, 403, 404), f"sign got {r.status_code}: {r.text[:120]}"


@pytest.mark.parametrize("prefix", ["drafts/exercises/", "drafts/", ""])
def test_storage_list_drafts_hidden(client_token, prefix):
    r = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/list/videos",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {client_token['token']}",
                 "Content-Type": "application/json"},
        json={"prefix": prefix, "limit": 1000},
        timeout=10,
    )
    assert r.status_code == 200
    # list may return items where the user has no SELECT rights; at least no draft file name must leak.
    names = [x.get("name", "") for x in r.json()]
    for n in names:
        full = f"{prefix}{n}"
        assert not full.startswith("drafts/") or n in ("drafts", "drafts/"), f"draft leaked: {full}"


def test_storage_read_non_draft_still_ok(client_token):
    # Any non-draft object must still be readable. Use the public assets/music-fitness.mp3.
    r = requests.get(
        f"{SUPABASE_URL}/storage/v1/object/authenticated/videos/assets/music-fitness.mp3",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {client_token['token']}",
                 "Range": "bytes=0-1023"},
        timeout=15,
    )
    # If the file exists, must be 206; if it is simply absent in this environment, skip.
    if r.status_code == 404:
        pytest.skip("assets/music-fitness.mp3 not present in storage")
    assert r.status_code == 206, f"non-draft read got {r.status_code}"


def test_storage_write_to_drafts_refused(client_token):
    # Writes/overwrites inside drafts/ must still be refused.
    r = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/videos/drafts/_probe.txt",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {client_token['token']}",
                 "Content-Type": "text/plain"},
        data=b"probe",
        timeout=10,
    )
    assert r.status_code in (400, 401, 403), f"drafts upload got {r.status_code}: {r.text[:120]}"
    if r.status_code == 200:
        # Undo if accidentally accepted.
        requests.delete(f"{SUPABASE_URL}/storage/v1/object/videos/drafts/_probe.txt",
                        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {client_token['token']}"},
                        timeout=10)


def test_exercises_media_path_exposed_to_client(rest_h):
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/exercises?slug=in.(sample-push-ups,sample-goblet-squat,sample-plank)&select=slug,media_path",
        headers=rest_h, timeout=10)
    assert r.status_code == 200
    rows = {x["slug"]: x["media_path"] for x in r.json()}
    assert len(rows) == 3
    for slug, mp in rows.items():
        assert mp and "drafts/" in mp, f"{slug} media_path={mp}"


# ---------------------------------------------------------- 5. backend AI/booking/progress flows
_created = {}


def test_progress_create_list_delete(api_h):
    r = requests.post(f"{BACKEND_URL}/api/progress", headers=api_h,
                      json={"weight": 72.5, "note": "TEST_client_iter8"}, timeout=10)
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    _created["progress_id"] = pid
    r2 = requests.get(f"{BACKEND_URL}/api/progress", headers=api_h, timeout=10)
    assert r2.status_code == 200
    assert any(x["id"] == pid for x in r2.json())
    r3 = requests.delete(f"{BACKEND_URL}/api/progress/{pid}", headers=api_h, timeout=10)
    assert r3.status_code == 200
    _created.pop("progress_id", None)


def test_booking_create_list_cancel(api_h):
    from datetime import datetime, timedelta, timezone
    future = (datetime.now(timezone.utc) + timedelta(days=14)).strftime("%Y-%m-%d")
    r0 = requests.get(f"{BACKEND_URL}/api/coaching/slots?date={future}", headers=api_h, timeout=10)
    assert r0.status_code == 200
    avail = [s for s in r0.json() if s["available"]]
    assert avail
    slot = avail[0]["time"]
    r = requests.post(f"{BACKEND_URL}/api/bookings", headers=api_h,
                      json={"type": "gym", "date": future, "time": slot}, timeout=10)
    assert r.status_code == 201, r.text
    bid = r.json()["id"]
    _created["booking_id"] = bid
    r2 = requests.get(f"{BACKEND_URL}/api/bookings", headers=api_h, timeout=10)
    assert any(x["id"] == bid for x in r2.json())
    r3 = requests.delete(f"{BACKEND_URL}/api/bookings/{bid}", headers=api_h, timeout=10)
    assert r3.status_code == 200
    _created.pop("booking_id", None)


def test_coach_message_and_cleanup(api_h):
    r = requests.post(f"{BACKEND_URL}/api/coach/chat", headers=api_h,
                      json={"message": "Bonjour"}, timeout=60, stream=True)
    assert r.status_code == 200
    got = False
    for chunk in r.iter_lines():
        if chunk and chunk.startswith(b"data:"):
            got = True
            if b"[DONE]" in chunk:
                break
    assert got
    time.sleep(1)
    r2 = requests.get(f"{BACKEND_URL}/api/coach/messages", headers=api_h, timeout=10)
    assert r2.status_code == 200 and len(r2.json()) >= 2
    r3 = requests.delete(f"{BACKEND_URL}/api/coach/messages", headers=api_h, timeout=10)
    assert r3.status_code == 200
    r4 = requests.get(f"{BACKEND_URL}/api/coach/messages", headers=api_h, timeout=10)
    assert r4.json() == []


def test_nutrition_generate_once(api_h):
    r = requests.post(f"{BACKEND_URL}/api/nutrition/plan", headers=api_h,
                      json={"goal": "balance", "weight": 72, "height": 175, "age": 30,
                            "sex": "male", "activity": "moderate", "diet": "omnivore"}, timeout=90)
    assert r.status_code == 200, r.text
    plan = r.json()["plan"]
    assert isinstance(plan.get("calories"), int)
    assert len(plan.get("meals", [])) == 4
    assert len(plan.get("tips", [])) == 3
    # No delete endpoint — tracked as a finding; cleanup script empties client_profiles contact instead.


# ---------------------------------------------------------- 6. final cleanup of any client-created Supabase rows
def test_zz_cleanup_supabase(rest_h, client_token):
    for table in ("favorites", "workout_history", "program_enrollments"):
        requests.delete(f"{SUPABASE_URL}/rest/v1/{table}?user_id=eq.{client_token['uid']}",
                        headers=rest_h, timeout=10)
    # reset contact details
    requests.patch(
        f"{SUPABASE_URL}/rest/v1/client_profiles?id=eq.{client_token['uid']}",
        headers={**rest_h, "Prefer": "return=minimal"},
        json={"preferences": {"contact": {"phone": "", "address": "", "postal_code": "",
                                          "city": "", "state": "", "country": ""}}},
        timeout=10,
    )
    # Verify empty
    for table in ("favorites", "workout_history", "program_enrollments"):
        r = requests.get(f"{SUPABASE_URL}/rest/v1/{table}?user_id=eq.{client_token['uid']}&select=user_id",
                         headers=rest_h, timeout=10)
        assert r.status_code == 200
        assert r.json() == [], f"{table} not cleaned: {r.json()}"
