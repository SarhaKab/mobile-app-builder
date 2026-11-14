"""Focused backend tests for the Supabase-transition auth flow.

Scope (per review request):
- No token on protected endpoints -> 401 (not 500)
- Garbage Bearer token -> 401, answer < ~10s (must not hang on Supabase lookup)
- Legacy demo login still works, and the returned token works on /auth/me
"""
import os
import time

import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"] if "EXPO_PUBLIC_BACKEND_URL" in os.environ \
    else "https://mobile-app-builder-3917--7y5j233b.preview.emergentagent.com"
API = f"{BASE.rstrip('/')}/api"

DEMO_EMAIL = "demo@kfit.app"
DEMO_PW = "Kfit2026!"


# -------------------- no token --------------------
class TestNoToken:
    def test_me_no_token_401(self):
        r = requests.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401, r.text

    def test_dashboard_no_token_401(self):
        r = requests.get(f"{API}/dashboard", timeout=15)
        assert r.status_code == 401, r.text

    def test_programs_no_token_401(self):
        r = requests.get(f"{API}/programs", timeout=15)
        assert r.status_code == 401, r.text


# -------------------- garbage token --------------------
GARBAGE = "this.is.not-a-real-token-abcdef1234567890"


class TestGarbageToken:
    def _call(self, path):
        t0 = time.monotonic()
        r = requests.get(f"{API}{path}", headers={"Authorization": f"Bearer {GARBAGE}"}, timeout=20)
        return r, time.monotonic() - t0

    def test_me_garbage_401_fast(self):
        r, dt = self._call("/auth/me")
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"
        assert dt < 12, f"response took {dt:.1f}s (should be <~10s)"

    def test_dashboard_garbage_401_fast(self):
        r, dt = self._call("/dashboard")
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"
        assert dt < 12, f"response took {dt:.1f}s"

    def test_programs_garbage_401_fast(self):
        r, dt = self._call("/programs")
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"
        assert dt < 12, f"response took {dt:.1f}s"


# -------------------- legacy demo login --------------------
class TestLegacyDemoLogin:
    @pytest.fixture(scope="class")
    def demo_token(self):
        r = requests.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PW}, timeout=20)
        assert r.status_code == 200, f"legacy demo login failed: {r.status_code} {r.text}"
        body = r.json()
        assert "token" in body and body["user"]["email"] == DEMO_EMAIL
        return body["token"]

    def test_demo_token_works_on_me(self, demo_token):
        r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {demo_token}"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["email"] == DEMO_EMAIL
