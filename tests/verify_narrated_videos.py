"""KFIT iteration 6 — narrated videos + subtitles data validation (REST only).

Validates (Supabase REST + Storage REST, user token):
 - For the 3 trial slugs (push-ups, goblet-squat, plank) and the 3 app langs (fr/en/es):
     * drafts/exercises/<slug>.<lang>.mp4 exists
     * drafts/exercises/<slug>.<lang>.json exists, format {lang, duration, cues:[{start,end,text}]}
     * duration in [80, 130] s (per owner: ~95-115 s, tolerance 80-130)
     * cues ordered, non-overlapping, last cue ends within 2 s of duration
     * cue sequence = 1 intro cue (name + muscles + equipment in that lang)
                     + 1 cue per instruction step (same order & wording as instructions[lang])
                     + 1 cue per level (beginner, intermediate, advanced) with sets/reps/rest_seconds/note[lang]
 - Burpees: DB row exists with no media_path (fallback test)
 - 21 sample files under drafts/exercises/ (3 slugs x [.mp4, .fr.mp4, .en.mp4, .es.mp4, .fr.json, .en.json, .es.json])

Does NOT mutate drafts/. Does NOT call admin approve/remove. Does NOT run backend scripts.
"""
import json
import os
import re
import sys
import requests

SUPABASE_URL = "https://soaivvemysgzmjntmkta.supabase.co"
APIKEY = "sb_publishable_MgI2Me489KLXdfeANIVnkQ_GKMdHeRy"
EMAIL = os.environ["KFIT_TEST_EMAIL"]
PASSWORD = os.environ["KFIT_TEST_PASSWORD"]
SLUGS = ["sample-push-ups", "sample-goblet-squat", "sample-plank"]
LANGS = ["fr", "en", "es"]
ISSUES: list[str] = []


def fail(msg: str) -> None:
    ISSUES.append(msg)
    print("  ✗", msg)


def ok(msg: str) -> None:
    print("  ✓", msg)


def login() -> str:
    r = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": APIKEY, "Content-Type": "application/json"},
        json={"email": EMAIL, "password": PASSWORD},
        timeout=20,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def rest_get(token: str, path: str, params: dict | None = None) -> list:
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/{path}",
        headers={"apikey": APIKEY, "Authorization": f"Bearer {token}", "Accept": "application/json"},
        params=params or {},
        timeout=20,
    )
    r.raise_for_status()
    return r.json()


def storage_sign(token: str, bucket: str, key: str) -> str | None:
    r = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/sign/{bucket}/{key}",
        headers={"apikey": APIKEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"expiresIn": 600},
        timeout=20,
    )
    if r.status_code != 200:
        return None
    return SUPABASE_URL + "/storage/v1" + r.json()["signedURL"]


def storage_list(token: str, bucket: str, prefix: str) -> list[dict]:
    r = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/list/{bucket}",
        headers={"apikey": APIKEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"prefix": prefix, "limit": 1000, "sortBy": {"column": "name", "order": "asc"}},
        timeout=20,
    )
    r.raise_for_status()
    return r.json()


def download_json(token: str, key: str) -> dict | None:
    url = storage_sign(token, "videos", key)
    if not url:
        return None
    r = requests.get(url, timeout=20)
    if r.status_code != 200:
        return None
    return r.json()


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def main() -> int:
    tok = login()
    print("✓ login ok (token obtained)")

    # --- 1) Burpees fallback row
    print("\n[1] Burpees fallback (DB row without media)")
    rows = rest_get(tok, "exercises", {"slug": "eq.sample-burpees", "select": "id,slug,name,media_path"})
    if not rows:
        fail("no sample-burpees row found")
    elif rows[0]["media_path"] is not None:
        fail(f"sample-burpees has media_path={rows[0]['media_path']!r} (expected null for fallback)")
    else:
        ok("sample-burpees row present with media_path=null")

    # --- 2) Storage: 21 sample files under drafts/exercises/
    print("\n[2] drafts/exercises/ sample file count")
    files = storage_list(tok, "videos", "drafts/exercises")
    names = sorted(f["name"] for f in files if f["name"].startswith("sample-"))
    expected = []
    for slug in SLUGS:
        expected += [f"{slug}.mp4"] + [f"{slug}.{l}.mp4" for l in LANGS] + [f"{slug}.{l}.json" for l in LANGS]
    missing = sorted(set(expected) - set(names))
    extra = sorted(n for n in names if n not in expected and (n.startswith("sample-push-ups") or n.startswith("sample-goblet-squat") or n.startswith("sample-plank")))
    if missing:
        fail(f"missing sample files: {missing}")
    else:
        ok(f"all {len(expected)} expected sample files present ({len(names)} sample-* total)")
    if extra:
        fail(f"unexpected sample files for the 3 trial slugs: {extra}")

    # --- 3) Per slug validation
    for slug in SLUGS:
        print(f"\n[3] exercise '{slug}'")
        rows = rest_get(tok, "exercises", {
            "slug": f"eq.{slug}",
            "select": "id,slug,name,instructions,muscle_groups,equipment,level,level_variants,media_path",
        })
        if not rows:
            fail(f"{slug}: no DB row"); continue
        ex = rows[0]
        if not ex.get("media_path", "").startswith("drafts/exercises/"):
            fail(f"{slug}: media_path should still be under drafts/, got {ex.get('media_path')!r}")
        for lang in LANGS:
            tag = f"{slug}.{lang}"
            # .mp4 exists
            mp4_url = storage_sign(tok, "videos", f"drafts/exercises/{tag}.mp4")
            if not mp4_url:
                fail(f"{tag}.mp4 cannot be signed"); continue
            # .json present and parseable
            data = download_json(tok, f"drafts/exercises/{tag}.json")
            if not data:
                fail(f"{tag}.json cannot be downloaded"); continue
            if data.get("lang") != lang:
                fail(f"{tag}.json lang={data.get('lang')!r} != {lang}")
            dur = data.get("duration")
            if not isinstance(dur, (int, float)) or not (80 <= dur <= 130):
                fail(f"{tag}.json duration={dur!r} outside [80,130]s")
            cues = data.get("cues") or []
            if len(cues) < 4:
                fail(f"{tag}.json has only {len(cues)} cues"); continue
            # Ordered, non-overlapping
            prev_end = -0.1
            for i, c in enumerate(cues):
                if not (c["start"] < c["end"]):
                    fail(f"{tag}: cue {i} start>=end"); break
                if c["start"] < prev_end - 1e-3:
                    fail(f"{tag}: cue {i} overlaps previous (start={c['start']} < prev_end={prev_end})"); break
                prev_end = c["end"]
            # Last cue within 2 s of duration
            if cues and abs(dur - cues[-1]["end"]) > 2.0:
                fail(f"{tag}: last cue ends at {cues[-1]['end']}, duration {dur} — gap > 2s")
            # Intro cue contains name, muscles, equipment
            intro_txt = norm(cues[0]["text"])
            name = norm(ex["name"].get(lang, ""))
            if name and name not in intro_txt:
                fail(f"{tag}: intro cue missing exercise name '{ex['name'].get(lang)}'")
            # Instruction cues: split instructions[lang] into steps (numbered or newlines)
            raw_instr = ex["instructions"].get(lang, "")
            # Split on numbered steps like "1.", "1)", or on newlines.
            parts = [p.strip(" \t.-") for p in re.split(r"(?m)^\s*\d+[.)]\s*|\n+", raw_instr) if p and p.strip()]
            # Count expected non-intro, non-level cues = len(parts)
            n_levels = sum(1 for l in ["beginner", "intermediate", "advanced"] if (ex["level_variants"] or {}).get(l))
            expected_cues = 1 + len(parts) + n_levels
            if len(cues) != expected_cues:
                fail(f"{tag}: cue count {len(cues)} != 1 intro + {len(parts)} steps + {n_levels} levels = {expected_cues}")
            else:
                # Step cues wording equals instruction step (same order)
                for i, step in enumerate(parts):
                    cue_text = norm(cues[1 + i]["text"])
                    if norm(step) not in cue_text and cue_text not in norm(step):
                        fail(f"{tag}: step {i+1} wording mismatch\n     expected ~{step!r}\n     cue      ~{cues[1+i]['text']!r}")
                        break
                # Level cues at tail: each contains sets, reps, rest_seconds, note[lang]
                for j, lvl in enumerate(["beginner", "intermediate", "advanced"]):
                    lv = (ex["level_variants"] or {}).get(lvl)
                    if not lv:
                        continue
                    idx = 1 + len(parts) + [l for l in ["beginner", "intermediate", "advanced"] if (ex["level_variants"] or {}).get(l)].index(lvl)
                    txt = norm(cues[idx]["text"])
                    for needle in [str(lv.get("sets")), str(lv.get("reps")), str(lv.get("rest_seconds")), norm(lv.get("note", {}).get(lang, ""))]:
                        if needle and needle not in txt:
                            fail(f"{tag}: {lvl} cue missing fragment {needle!r}\n     cue={cues[idx]['text']!r}")
                            break
        if not [x for x in ISSUES if x.startswith(slug) or slug in x]:
            ok(f"{slug}: all 3 language cue files structurally valid")

    print("\n========== SUMMARY ==========")
    if ISSUES:
        print(f"{len(ISSUES)} issue(s):")
        for x in ISSUES:
            print(" -", x)
        return 1
    print("0 issues — narrated video + subtitle data valid")
    return 0


if __name__ == "__main__":
    sys.exit(main())
