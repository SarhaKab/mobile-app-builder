"""Admin approve/remove QA flow — setup via REST, UI test via Playwright, verification via REST.

Safe: operates ONLY on slug 'qa-narr-test' (never on sample-*).
Cleans up at the end.
"""
import os
import sys
import requests

SUPABASE_URL = "https://soaivvemysgzmjntmkta.supabase.co"
APIKEY = "sb_publishable_MgI2Me489KLXdfeANIVnkQ_GKMdHeRy"
EMAIL = os.environ["KFIT_TEST_EMAIL"]
PASSWORD = os.environ["KFIT_TEST_PASSWORD"]
SLUG = "qa-narr-test"


def hdrs(tok: str, extra: dict | None = None) -> dict:
    h = {"apikey": APIKEY, "Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
    if extra:
        h.update(extra)
    return h


def login() -> str:
    r = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": APIKEY, "Content-Type": "application/json"},
        json={"email": EMAIL, "password": PASSWORD}, timeout=20,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def list_prefix(tok: str, prefix: str) -> list[str]:
    r = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/list/videos",
        headers=hdrs(tok),
        json={"prefix": prefix, "limit": 1000, "sortBy": {"column": "name", "order": "asc"}},
        timeout=20,
    )
    r.raise_for_status()
    return [f["name"] for f in r.json()]


def copy_file(tok: str, src: str, dst: str) -> int:
    r = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/copy",
        headers=hdrs(tok),
        json={"bucketId": "videos", "sourceKey": src, "destinationKey": dst},
        timeout=20,
    )
    return r.status_code


def rest_get(tok: str, path: str, params: dict | None = None) -> list:
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=hdrs(tok), params=params or {}, timeout=20)
    r.raise_for_status()
    return r.json()


def rest_post(tok: str, path: str, body: dict) -> dict:
    r = requests.post(f"{SUPABASE_URL}/rest/v1/{path}", headers=hdrs(tok, {"Prefer": "return=representation"}), json=body, timeout=20)
    r.raise_for_status()
    return r.json()[0]


def rest_patch(tok: str, path: str, params: dict, body: dict) -> None:
    r = requests.patch(f"{SUPABASE_URL}/rest/v1/{path}", headers=hdrs(tok), params=params, json=body, timeout=20)
    r.raise_for_status()


def rest_delete(tok: str, path: str, params: dict) -> None:
    r = requests.delete(f"{SUPABASE_URL}/rest/v1/{path}", headers=hdrs(tok), params=params, timeout=20)
    r.raise_for_status()


def storage_remove(tok: str, keys: list[str]) -> None:
    requests.request(
        "DELETE",
        f"{SUPABASE_URL}/storage/v1/object/videos",
        headers=hdrs(tok),
        json={"prefixes": keys},
        timeout=20,
    )


def main(action: str) -> int:
    tok = login()
    if action == "setup":
        # Clean slate
        existing = rest_get(tok, "exercises", {"slug": f"eq.{SLUG}", "select": "id"})
        if existing:
            rest_delete(tok, "exercises", {"slug": f"eq.{SLUG}"})
        for pfx in ("drafts/exercises", "exercises"):
            names = [n for n in list_prefix(tok, pfx) if n.startswith(f"{SLUG}.")]
            if names:
                storage_remove(tok, [f"{pfx}/{n}" for n in names])
        # Create QA row
        row = rest_post(tok, "exercises", {
            "slug": SLUG, "name": {"fr": "Exercice QA", "en": "QA Exercise", "es": "Ejercicio QA"},
            "instructions": {"fr": "Étape QA."}, "muscle_groups": [], "equipment": [], "level": "beginner",
            "is_published": True, "level_variants": {},
            "media_path": f"drafts/exercises/{SLUG}.mp4",
        })
        print("created exercise id:", row["id"])
        # Copy 3 files from sample-plank
        for ext in ("mp4", "fr.mp4", "fr.json"):
            sc = copy_file(tok, f"drafts/exercises/sample-plank.{ext}", f"drafts/exercises/{SLUG}.{ext}")
            print(f"  copy sample-plank.{ext} -> {SLUG}.{ext}: HTTP {sc}")
            if sc >= 300:
                return 1
        print("setup OK. QA exercise id:", row["id"])
        print(row["id"])
        return 0
    if action == "verify_approved":
        # DB media_path should be 'exercises/qa-narr-test.mp4'
        rows = rest_get(tok, "exercises", {"slug": f"eq.{SLUG}", "select": "id,media_path"})
        mp = rows[0]["media_path"] if rows else None
        drafts_f = [n for n in list_prefix(tok, "drafts/exercises") if n.startswith(f"{SLUG}.")]
        exer_f = [n for n in list_prefix(tok, "exercises") if n.startswith(f"{SLUG}.")]
        print("db media_path:", mp)
        print("drafts/ files:", drafts_f)
        print("exercises/ files:", exer_f)
        ok = (mp == f"exercises/{SLUG}.mp4" and not drafts_f and sorted(exer_f) == sorted([f"{SLUG}.mp4", f"{SLUG}.fr.mp4", f"{SLUG}.fr.json"]))
        print("APPROVED OK:", ok)
        return 0 if ok else 1
    if action == "verify_removed":
        rows = rest_get(tok, "exercises", {"slug": f"eq.{SLUG}", "select": "media_path"})
        mp = rows[0]["media_path"] if rows else "ROW_MISSING"
        drafts_f = [n for n in list_prefix(tok, "drafts/exercises") if n.startswith(f"{SLUG}.")]
        exer_f = [n for n in list_prefix(tok, "exercises") if n.startswith(f"{SLUG}.")]
        print("db media_path:", mp, "| drafts:", drafts_f, "| exercises:", exer_f)
        ok = mp is None and not drafts_f and not exer_f
        print("REMOVED OK:", ok)
        return 0 if ok else 1
    if action == "cleanup":
        rows = rest_get(tok, "exercises", {"slug": f"eq.{SLUG}", "select": "id"})
        if rows:
            rest_delete(tok, "exercises", {"slug": f"eq.{SLUG}"})
        for pfx in ("drafts/exercises", "exercises"):
            names = [n for n in list_prefix(tok, pfx) if n.startswith(f"{SLUG}.")]
            if names:
                storage_remove(tok, [f"{pfx}/{n}" for n in names])
        # Verify 21 sample files still intact
        drafts_f = [n for n in list_prefix(tok, "drafts/exercises") if n.startswith("sample-")]
        exer_f = [n for n in list_prefix(tok, "exercises") if n.startswith("sample-")]
        print(f"cleanup done. drafts/ sample-* count={len(drafts_f)} exercises/ sample-* count={len(exer_f)}")
        return 0 if len(drafts_f) == 21 and len(exer_f) == 0 else 1
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "setup"))
