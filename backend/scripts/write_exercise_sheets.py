"""Rédige les fiches des exercices d'exemple (consignes, muscles, matériel, variantes par niveau)
avec Claude, puis les enregistre dans Supabase avec un compte administrateur.

Usage :
  python write_exercise_sheets.py draft   -> écrit /tmp/kfit_sheets.json (aucune écriture en base)
  python write_exercise_sheets.py apply   -> enregistre /tmp/kfit_sheets.json dans Supabase
Nécessite EMERGENT_LLM_KEY (backend/.env) et, pour « apply », KFIT_TEST_EMAIL / KFIT_TEST_PASSWORD (compte admin).
Les fiches sont à relire par un professionnel avant mise en production.
"""
import asyncio
import json
import os
import re
import sys
import uuid
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
from emergentintegrations.llm.chat import LlmChat, UserMessage  # noqa: E402

OUT = Path("/tmp/kfit_sheets.json")
MODEL = ("anthropic", "claude-sonnet-5-5")
LEVELS = ["beginner", "intermediate", "advanced"]
LANGS = ["fr", "en", "es"]
MUSCLES = ["chest", "back", "shoulders", "biceps", "triceps", "forearms", "core", "obliques", "lower_back",
           "glutes", "quads", "hamstrings", "calves", "hips", "full_body"]
EQUIPMENT = ["none", "mat", "dumbbells", "kettlebell", "barbell", "bench", "pull_up_bar", "cable_machine",
             "leg_press_machine", "leg_curl_machine", "dip_bars", "box", "resistance_band", "rack"]

SYSTEM = f"""You are a certified strength and conditioning coach writing exercise sheets for a fitness app.
Return ONLY a JSON array, no prose, no code fence. One object per exercise, in the same order, with exactly:
- "slug": the slug given
- "level": the minimum level the standard version suits, one of {LEVELS}
- "muscle_groups": 1 to 4 codes from {MUSCLES}, main muscle first
- "equipment": 1 to 3 codes from {EQUIPMENT} ("none" alone when bodyweight without a mat)
- "instructions": object with keys {LANGS}; each value is 4 to 6 short numbered steps separated by "\\n"
  (setup, execution, breathing, one common mistake to avoid). Informal "tu" in French, "tú" in Spanish.
- "level_variants": object with keys {LEVELS}; each value is
  {{"sets": integer 1-8, "reps": short string such as "10", "8-10", "30 s", "20 m" or "5 min",
    "rest_seconds": integer 0-180, "note": object with keys {LANGS}: one sentence on how the exercise is adapted at this
    level (easier/harder variation, load guidance as effort level, tempo). Never give absolute weights in kg.}}
Be safe and conservative. No medical claims."""


def supabase_cfg() -> tuple[str, str]:
    src = (Path(__file__).resolve().parents[2] / "frontend/src/supabase.ts").read_text()
    return (re.search(r'"(https://[a-z0-9]+\.supabase\.co)"', src).group(1),
            re.search(r'"(sb_publishable_[^"]+)"', src).group(1))


def admin_client() -> tuple[httpx.Client, str]:
    url, key = supabase_cfg()
    c = httpx.Client(timeout=30)
    r = c.post(f"{url}/auth/v1/token?grant_type=password", headers={"apikey": key},
               json={"email": os.environ["KFIT_TEST_EMAIL"], "password": os.environ["KFIT_TEST_PASSWORD"]})
    r.raise_for_status()
    c.headers.update({"apikey": key, "Authorization": f"Bearer {r.json()['access_token']}"})
    return c, f"{url}/rest/v1/"


def valid(sheet: dict, slug: str) -> bool:
    try:
        assert sheet["slug"] == slug and sheet["level"] in LEVELS
        assert 1 <= len(sheet["muscle_groups"]) <= 4 and set(sheet["muscle_groups"]) <= set(MUSCLES)
        assert 1 <= len(sheet["equipment"]) <= 3 and set(sheet["equipment"]) <= set(EQUIPMENT)
        assert all(isinstance(sheet["instructions"][lang], str) and len(sheet["instructions"][lang]) > 40 for lang in LANGS)
        assert set(sheet["level_variants"]) == set(LEVELS)
        for v in sheet["level_variants"].values():
            assert isinstance(v["sets"], int) and 1 <= v["sets"] <= 8
            assert isinstance(v["reps"], str) and 0 < len(v["reps"]) <= 20
            assert isinstance(v["rest_seconds"], int) and 0 <= v["rest_seconds"] <= 180
            assert all(isinstance(v["note"][lang], str) and v["note"][lang] for lang in LANGS)
        return True
    except (AssertionError, KeyError, TypeError):
        return False


async def draft() -> None:
    c, rest = admin_client()
    rows = c.get(rest + "exercises?select=slug,name&slug=like.sample-*&order=slug").json()
    sheets: dict[str, dict] = json.loads(OUT.read_text()) if OUT.exists() else {}
    todo = [r for r in rows if r["slug"] not in sheets]
    for i in range(0, len(todo), 6):
        batch = todo[i:i + 6]
        prompt = "Exercises:\n" + "\n".join(f'- slug "{r["slug"]}": {r["name"]["en"]}' for r in batch)
        chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"sheets_{uuid.uuid4().hex[:8]}",
                       system_message=SYSTEM).with_model(*MODEL)
        raw = await chat.send_message(UserMessage(text=prompt))
        try:
            data = json.loads(raw[raw.index("["):raw.rindex("]") + 1])
        except ValueError:
            print("batch not parseable:", [r["slug"] for r in batch], flush=True)
            continue
        for r, sheet in zip(batch, data):
            if valid(sheet, r["slug"]):
                sheets[r["slug"]] = sheet
            else:
                print("invalid sheet:", r["slug"], json.dumps(sheet, ensure_ascii=False)[:300], flush=True)
        OUT.write_text(json.dumps(sheets, ensure_ascii=False, indent=1))
        print(f"{len(sheets)}/{len(rows)} sheets", flush=True)


def apply() -> None:
    c, rest = admin_client()
    sheets = json.loads(OUT.read_text())
    # « reps » n'est pas traduit : une précision « par côté » rédigée dans une langue est déplacée dans la note traduite.
    side = re.compile(r"\s*(/\s*side|per side|par (côté|jambe|bras)|por lado)$", re.I)
    per_side = {"fr": "Par côté.", "en": "Per side.", "es": "Por lado."}
    for s in sheets.values():
        for v in s["level_variants"].values():
            if side.search(v["reps"]):
                v["reps"] = side.sub("", v["reps"])
                v["note"] = {lang: f"{per_side[lang]} {v['note'][lang]}" for lang in LANGS}
    ok = 0
    for slug, s in sheets.items():
        r = c.patch(rest + f"exercises?slug=eq.{slug}", headers={"Prefer": "return=representation"},
                    json={k: s[k] for k in ("level", "muscle_groups", "equipment", "instructions", "level_variants")})
        ok += r.status_code == 200 and len(r.json()) == 1
    print(f"applied {ok}/{len(sheets)}")


if __name__ == "__main__":
    asyncio.run(draft()) if sys.argv[1:] == ["draft"] else apply()
