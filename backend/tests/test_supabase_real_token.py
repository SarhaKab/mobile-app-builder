"""Backend tests using a REAL Supabase access token.

Reads credentials from the shell environment variables KFIT_TEST_EMAIL and
KFIT_TEST_PASSWORD. Never prints them. Supabase URL and publishable key are
public by design and taken from /app/frontend/src/supabase.ts.
"""
import os
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else None
if not BASE_URL:
    # Fall back to frontend/.env
    for line in open("/app/frontend/.env").read().splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
            break

SUPABASE_URL = "https://soaivvemysgzmjntmkta.supabase.co"
SUPABASE_PUBLISHABLE_KEY = "sb_publishable_MgI2Me489KLXdfeANIVnkQ_GKMdHeRy"

EMAIL = os.environ.get("KFIT_TEST_EMAIL")
PASSWORD = os.environ.get("KFIT_TEST_PASSWORD")


@pytest.fixture(scope="module")
def access_token():
    if not EMAIL or not PASSWORD:
        pytest.skip("KFIT_TEST_EMAIL/KFIT_TEST_PASSWORD env vars not set")
    r = requests.post(
        f"{SUPABASE_URL}/auth/v1/token",
        params={"grant_type": "password"},
        headers={"apikey": SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json"},
        json={"email": EMAIL, "password": PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"Supabase token endpoint failed: {r.status_code} (body omitted for safety)"
    tok = r.json().get("access_token")
    assert tok, "No access_token returned"
    return tok


def _auth(tok):
    return {"Authorization": f"Bearer {tok}"}


def test_auth_me_returns_user(access_token):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=_auth(access_token), timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("email", "").lower() == EMAIL.lower()
    assert "user_id" in data


def test_auth_me_idempotent_no_duplicate(access_token):
    r1 = requests.get(f"{BASE_URL}/api/auth/me", headers=_auth(access_token), timeout=15)
    r2 = requests.get(f"{BASE_URL}/api/auth/me", headers=_auth(access_token), timeout=15)
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json()["user_id"] == r2.json()["user_id"]


def test_dashboard(access_token):
    r = requests.get(f"{BASE_URL}/api/dashboard", headers=_auth(access_token), timeout=15)
    assert r.status_code == 200, r.text
    # response should be a JSON object
    data = r.json()
    assert isinstance(data, (dict, list))


def test_programs(access_token):
    r = requests.get(f"{BASE_URL}/api/programs", headers=_auth(access_token), timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list)


def test_programs_detail(access_token):
    r = requests.get(f"{BASE_URL}/api/programs", headers=_auth(access_token), timeout=15)
    assert r.status_code == 200
    programs = r.json()
    if not programs:
        pytest.skip("no programs seeded")
    pid = programs[0].get("program_id") or programs[0].get("id") or programs[0].get("_id")
    assert pid, f"program has no id-like field: {list(programs[0].keys())}"
    r2 = requests.get(f"{BASE_URL}/api/programs/{pid}", headers=_auth(access_token), timeout=15)
    assert r2.status_code == 200, r2.text
