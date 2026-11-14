"""KFIT backend API test suite - pytest."""
import os
import time
import uuid
import json
import requests
import pytest

BASE = "https://mobile-app-builder-3917--7y5j233b.preview.emergentagent.com"
API = f"{BASE}/api"
DEMO_EMAIL, DEMO_PW = "demo@kfit.app", "Kfit2026!"


# ---------------- fixtures ----------------
@pytest.fixture(scope="session")
def demo_token():
    r = requests.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PW}, timeout=15)
    assert r.status_code == 200, f"demo login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def demo_headers(demo_token):
    return {"Authorization": f"Bearer {demo_token}"}


@pytest.fixture(scope="session")
def second_user():
    email = f"TEST_{uuid.uuid4().hex[:8]}@kfit.test"
    r = requests.post(f"{API}/auth/register",
                      json={"email": email, "password": "SecondPw1!", "name": "TEST_Second"}, timeout=15)
    assert r.status_code == 201, r.text
    return {"email": email, "token": r.json()["token"],
            "headers": {"Authorization": f"Bearer {r.json()['token']}"}}


# ---------------- auth ----------------
class TestAuth:
    def test_register_and_duplicate(self):
        email = f"TEST_{uuid.uuid4().hex[:8]}@kfit.test"
        payload = {"email": email, "password": "Strong1!x", "name": "TEST_User"}
        r = requests.post(f"{API}/auth/register", json=payload, timeout=15)
        assert r.status_code == 201
        assert r.json()["user"]["email"] == email
        # duplicate -> 409
        r2 = requests.post(f"{API}/auth/register", json=payload, timeout=15)
        assert r2.status_code == 409

    def test_register_short_password_422(self):
        r = requests.post(f"{API}/auth/register",
                          json={"email": f"TEST_{uuid.uuid4().hex[:6]}@kfit.test", "password": "x", "name": "n"},
                          timeout=10)
        assert r.status_code == 422

    def test_login_wrong_password_401(self):
        email = f"TEST_{uuid.uuid4().hex[:8]}@kfit.test"
        requests.post(f"{API}/auth/register",
                      json={"email": email, "password": "Strong1!x", "name": "u"}, timeout=10)
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": "wrong1234"}, timeout=10)
        assert r.status_code == 401

    def test_me_401_without_token(self):
        assert requests.get(f"{API}/auth/me", timeout=10).status_code == 401

    def test_me_200_with_token(self, demo_headers):
        r = requests.get(f"{API}/auth/me", headers=demo_headers, timeout=10)
        assert r.status_code == 200 and r.json()["email"] == DEMO_EMAIL

    def test_logout_revokes_jwt(self):
        email = f"TEST_{uuid.uuid4().hex[:8]}@kfit.test"
        rr = requests.post(f"{API}/auth/register",
                           json={"email": email, "password": "Strong1!x", "name": "u"}, timeout=10)
        tok = rr.json()["token"]
        h = {"Authorization": f"Bearer {tok}"}
        assert requests.get(f"{API}/auth/me", headers=h, timeout=10).status_code == 200
        assert requests.post(f"{API}/auth/logout", headers=h, timeout=10).status_code == 200
        assert requests.get(f"{API}/auth/me", headers=h, timeout=10).status_code == 401

    def test_rate_limit_after_5_failures(self):
        email = f"TEST_lock_{uuid.uuid4().hex[:6]}@kfit.test"
        requests.post(f"{API}/auth/register",
                      json={"email": email, "password": "Strong1!x", "name": "u"}, timeout=10)
        codes = []
        for _ in range(5):
            r = requests.post(f"{API}/auth/login", json={"email": email, "password": "wrong1234"}, timeout=10)
            codes.append(r.status_code)
        r6 = requests.post(f"{API}/auth/login", json={"email": email, "password": "wrong1234"}, timeout=10)
        assert r6.status_code == 429, f"Expected 429 lockout, got {r6.status_code}; prior codes={codes}"


# ---------------- profile ----------------
class TestProfile:
    def test_patch_lang_goal(self, demo_headers):
        r = requests.patch(f"{API}/profile", headers=demo_headers,
                           json={"lang": "en", "goal": "balance"}, timeout=10)
        assert r.status_code == 200 and r.json()["lang"] == "en" and r.json()["goal"] == "balance"
        # restore
        requests.patch(f"{API}/profile", headers=demo_headers, json={"lang": "fr"}, timeout=10)


# ---------------- programs ----------------
class TestPrograms:
    def test_list_programs(self, demo_headers):
        r = requests.get(f"{API}/programs", headers=demo_headers, timeout=10)
        assert r.status_code == 200
        ids = [p["id"] for p in r.json()]
        assert "strength-balance" in ids

    def test_get_program_404(self, demo_headers):
        assert requests.get(f"{API}/programs/nope", headers=demo_headers, timeout=10).status_code == 404

    def test_enroll_and_complete(self, demo_headers):
        pid = "strength-balance"
        assert requests.post(f"{API}/programs/{pid}/enroll", headers=demo_headers, timeout=10).status_code == 200
        r = requests.get(f"{API}/programs/{pid}", headers=demo_headers, timeout=10)
        assert r.status_code == 200 and r.json()["enrolled"] is True
        r2 = requests.post(f"{API}/programs/{pid}/workouts/0/complete", headers=demo_headers, timeout=10)
        assert r2.status_code == 200 and 0 in r2.json()["completed"]

    def test_dashboard(self, demo_headers):
        r = requests.get(f"{API}/dashboard", headers=demo_headers, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert "workouts" in d and "minutes" in d


# ---------------- progress ----------------
class TestProgress:
    def test_crud(self, demo_headers):
        r = requests.post(f"{API}/progress", headers=demo_headers,
                          json={"weight": 72.5, "body_fat": 15.0, "note": "TEST_entry"}, timeout=10)
        assert r.status_code == 201
        eid = r.json()["id"]
        rg = requests.get(f"{API}/progress", headers=demo_headers, timeout=10)
        assert rg.status_code == 200 and any(e["id"] == eid for e in rg.json())
        rd = requests.delete(f"{API}/progress/{eid}", headers=demo_headers, timeout=10)
        assert rd.status_code == 200
        rg2 = requests.get(f"{API}/progress", headers=demo_headers, timeout=10)
        assert not any(e["id"] == eid for e in rg2.json())


# ---------------- bookings ----------------
class TestBookings:
    def test_slots_and_booking_cycle(self, demo_headers, second_user):
        from datetime import datetime, timedelta, timezone
        date = (datetime.now(timezone.utc) + timedelta(days=3)).strftime("%Y-%m-%d")
        r = requests.get(f"{API}/coaching/slots", headers=demo_headers, params={"date": date}, timeout=10)
        assert r.status_code == 200
        slot = next(s["time"] for s in r.json() if s["available"])
        b = requests.post(f"{API}/bookings", headers=demo_headers,
                          json={"type": "gym", "date": date, "time": slot}, timeout=10)
        assert b.status_code == 201
        bid = b.json()["id"]
        # duplicate slot -> 409 (by second user)
        dup = requests.post(f"{API}/bookings", headers=second_user["headers"],
                            json={"type": "gym", "date": date, "time": slot}, timeout=10)
        assert dup.status_code == 409
        # isolation: second user cannot delete
        bad = requests.delete(f"{API}/bookings/{bid}", headers=second_user["headers"], timeout=10)
        assert bad.status_code == 404
        # owner cancels
        ok = requests.delete(f"{API}/bookings/{bid}", headers=demo_headers, timeout=10)
        assert ok.status_code == 200

    def test_slots_bad_date_422(self, demo_headers):
        r = requests.get(f"{API}/coaching/slots", headers=demo_headers, params={"date": "bad"}, timeout=10)
        assert r.status_code == 422


# ---------------- coach chat (SSE) ----------------
class TestCoach:
    def test_stream_chat(self, demo_headers):
        with requests.post(f"{API}/coach/chat", headers=demo_headers,
                           json={"message": "Say 'hello' in one word."},
                           stream=True, timeout=60) as r:
            assert r.status_code == 200
            deltas = 0
            done = False
            for line in r.iter_lines(decode_unicode=True):
                if not line:
                    continue
                if line.startswith("data: "):
                    payload = line[6:]
                    if payload == "[DONE]":
                        done = True
                        break
                    try:
                        obj = json.loads(payload)
                        if "delta" in obj:
                            deltas += 1
                    except Exception:
                        pass
            assert done, "SSE never emitted [DONE]"
            assert deltas > 0, "No delta chunks received"

    def test_messages_and_clear(self, demo_headers):
        msgs = requests.get(f"{API}/coach/messages", headers=demo_headers, timeout=10)
        assert msgs.status_code == 200 and isinstance(msgs.json(), list)
        clr = requests.delete(f"{API}/coach/messages", headers=demo_headers, timeout=10)
        assert clr.status_code == 200


# ---------------- nutrition ----------------
class TestNutrition:
    def test_generate_and_get_plan(self, demo_headers):
        r = requests.post(f"{API}/nutrition/plan", headers=demo_headers, json={
            "goal": "balance", "weight": 72, "height": 178, "age": 32,
            "sex": "male", "activity": "moderate", "diet": "omnivore"}, timeout=90)
        assert r.status_code == 200, f"nutrition failed: {r.status_code} {r.text[:200]}"
        plan = r.json()["plan"]
        assert "calories" in plan and len(plan.get("meals", [])) >= 1
        g = requests.get(f"{API}/nutrition/plan", headers=demo_headers, timeout=10)
        assert g.status_code == 200 and g.json()["plan"]["calories"] == plan["calories"]
