"""Data-level validation of the 38 sample exercises via Supabase REST (user token + RLS).
Reports missing i18n keys (m_<code>, eq_<code>), empty instructions/variants, suspect reps strings.
Reads KFIT_TEST_EMAIL / KFIT_TEST_PASSWORD from the shell env only; nothing is written.
"""
import os
import re
import sys
import json
import requests

SUPABASE_URL = "https://soaivvemysgzmjntmkta.supabase.co"
PUB_KEY = "sb_publishable_MgI2Me489KLXdfeANIVnkQ_GKMdHeRy"

email = os.environ.get("KFIT_TEST_EMAIL")
password = os.environ.get("KFIT_TEST_PASSWORD")
if not email or not password:
    print("BLOCKER: KFIT_TEST_EMAIL / KFIT_TEST_PASSWORD not set")
    sys.exit(2)

# Auth
r = requests.post(
    f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
    headers={"apikey": PUB_KEY, "Content-Type": "application/json"},
    json={"email": email, "password": password},
    timeout=20,
)
if r.status_code != 200:
    print(f"AUTH FAIL: {r.status_code} {r.text[:200]}")
    sys.exit(2)
token = r.json()["access_token"]

# Load i18n keys from /app/frontend/src/i18n.tsx (french dict is fine; keys are stable across languages)
i18n_src = open("/app/frontend/src/i18n.tsx").read()
m_keys = set(re.findall(r"\bm_([a-z_]+):", i18n_src))
eq_keys = set(re.findall(r"\beq_([a-z_]+):", i18n_src))
print(f"i18n keys: {len(m_keys)} muscles, {len(eq_keys)} equipment")

# Fetch the 38 sample exercises
cols = "id,slug,name,instructions,muscle_groups,equipment,level,is_published,media_path,level_variants"
r = requests.get(
    f"{SUPABASE_URL}/rest/v1/exercises",
    headers={"apikey": PUB_KEY, "Authorization": f"Bearer {token}"},
    params={"select": cols, "slug": "like.sample-%", "order": "slug"},
    timeout=20,
)
assert r.status_code == 200, r.text[:300]
rows = r.json()
print(f"Fetched {len(rows)} sample exercises")

LANGS = ("fr", "en", "es")
LEVELS = ("beginner", "intermediate", "advanced")
# Language-specific words that should NOT appear in a locale-neutral reps string
reps_lang_words = re.compile(r"\b(seconds?|secs?|reps|rep|per|side|each|chaque|cote|côté|segundo|lado|cada|por)\b", re.I)

issues = []
missing_muscle_codes = set()
missing_equip_codes = set()

for e in rows:
    s = e["slug"]
    # 1. instructions non-empty in fr/en/es
    instr = e.get("instructions") or {}
    for lang in LANGS:
        if not (instr.get(lang) or "").strip():
            issues.append(f"{s}: empty instructions[{lang}]")
    # 2. muscles / equipment lists
    mg = e.get("muscle_groups") or []
    eq = e.get("equipment") or []
    if not mg:
        issues.append(f"{s}: no muscle_groups")
    if not eq:
        issues.append(f"{s}: no equipment")
    for c in mg:
        if c not in m_keys:
            missing_muscle_codes.add(c)
            issues.append(f"{s}: muscle code '{c}' has no i18n key m_{c}")
    for c in eq:
        if c not in eq_keys:
            missing_equip_codes.add(c)
            issues.append(f"{s}: equipment code '{c}' has no i18n key eq_{c}")
    # 3. level
    if not e.get("level"):
        issues.append(f"{s}: level not set")
    # 4. level_variants
    lv = e.get("level_variants") or {}
    for lvl in LEVELS:
        v = lv.get(lvl) or {}
        if not v:
            issues.append(f"{s}: level_variants.{lvl} missing")
            continue
        sets = v.get("sets")
        reps = v.get("reps")
        rest = v.get("rest_seconds")
        note = v.get("note") or {}
        if not isinstance(sets, int):
            issues.append(f"{s}.{lvl}: sets is not int ({sets!r})")
        if not (isinstance(reps, str) and reps.strip()):
            issues.append(f"{s}.{lvl}: reps is not a non-empty string ({reps!r})")
        else:
            if reps_lang_words.search(reps):
                issues.append(f"{s}.{lvl}: reps '{reps}' contains language-specific words")
        if not isinstance(rest, int):
            issues.append(f"{s}.{lvl}: rest_seconds is not int ({rest!r})")
        for lg in LANGS:
            if not (note.get(lg) or "").strip():
                issues.append(f"{s}.{lvl}: note[{lg}] empty")

print()
print(f"TOTAL ISSUES: {len(issues)}")
for it in issues[:80]:
    print(" -", it)
if len(issues) > 80:
    print(f" ... and {len(issues) - 80} more")

print()
print(f"Missing i18n muscle codes: {sorted(missing_muscle_codes)}")
print(f"Missing i18n equipment codes: {sorted(missing_equip_codes)}")

# Summary counts
with_video = [e for e in rows if e.get("media_path")]
drafts = [e for e in rows if (e.get("media_path") or "").startswith("drafts/")]
print(f"Sample exercises with media_path: {len(with_video)}; of which drafts: {len(drafts)}")
for e in with_video:
    print(f"  - {e['slug']}: {e['media_path']}")

# Save slug -> id map for later UI tests
out = {e["slug"]: e["id"] for e in rows}
json.dump(out, open("/tmp/sample_exercise_ids.json", "w"), indent=2)
print(f"\nWrote /tmp/sample_exercise_ids.json ({len(out)} entries)")
