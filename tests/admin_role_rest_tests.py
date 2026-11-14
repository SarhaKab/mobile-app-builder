"""KFIT iter 9 — admin READ-ONLY checks: drafts/* must still be readable/signable/listable.
No writes. No approve/remove. No credentials or tokens printed.
"""
import os
import pytest
import requests

SUPABASE_URL = "https://soaivvemysgzmjntmkta.supabase.co"
SUPABASE_KEY = "sb_publishable_MgI2Me489KLXdfeANIVnkQ_GKMdHeRy"

ADMIN_EMAIL = os.environ.get("KFIT_TEST_EMAIL")
ADMIN_PASSWORD = os.environ.get("KFIT_TEST_PASSWORD")


@pytest.fixture(scope="session")
def admin_token():
    assert ADMIN_EMAIL and ADMIN_PASSWORD, "KFIT_TEST_EMAIL/PASSWORD missing"
    r = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": SUPABASE_KEY, "Content-Type": "application/json"},
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"admin login failed: {r.status_code}"
    return r.json()["access_token"]


def test_admin_role_is_admin(admin_token):
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/users?select=role",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    assert r.status_code == 200
    rows = r.json()
    assert any(row.get("role") == "admin" for row in rows), rows


def test_admin_read_draft(admin_token):
    r = requests.get(
        f"{SUPABASE_URL}/storage/v1/object/authenticated/videos/drafts/exercises/sample-plank.beginner.fr.mp4",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {admin_token}",
                 "Range": "bytes=0-1023"},
        timeout=15,
    )
    assert r.status_code == 206, f"admin draft read got {r.status_code}: {r.text[:120]}"


def test_admin_sign_draft(admin_token):
    r = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/sign/videos/drafts/exercises/sample-plank.beginner.fr.mp4",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {admin_token}",
                 "Content-Type": "application/json"},
        json={"expiresIn": 60},
        timeout=10,
    )
    assert r.status_code == 200, f"admin sign got {r.status_code}: {r.text[:120]}"


def test_admin_list_drafts_has_samples(admin_token):
    r = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/list/videos",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {admin_token}",
                 "Content-Type": "application/json"},
        json={"prefix": "drafts/exercises/", "limit": 1000},
        timeout=10,
    )
    assert r.status_code == 200
    names = [x["name"] for x in r.json()]
    sample = [n for n in names if n.startswith("sample-")]
    assert len(names) >= 60, f"expected ~62 files, got {len(names)}"
    assert sample, "no sample-* files visible to admin"
