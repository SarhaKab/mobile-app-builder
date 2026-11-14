"""Produit les vidéos COMMENTÉES d'un exercice, une par langue (fr, en, es).

Pour chaque langue : une voix off (OpenAI TTS) lit la fiche de l'exercice — présentation, consignes étape par étape,
puis séries / répétitions / repos de chaque niveau. La démonstration muette (déjà générée) est rejouée en boucle
pendant toute la durée du commentaire. Les sous-titres sont synchronisés sur chaque phrase (fichier .json).

Usage : python narrate_exercise_videos.py <slug> [<slug> ...]
Entrée : drafts/exercises/<slug>.mp4 (ou exercises/<slug>.mp4) dans le stockage Supabase « videos ».
Sortie : <même dossier>/<slug>.<langue>.mp4 et .json — même statut (brouillon ou validé) que la vidéo d'origine.
Nécessite EMERGENT_LLM_KEY (voix) et KFIT_TEST_EMAIL / KFIT_TEST_PASSWORD (compte admin). Aucun appel Fal.ai.
"""
import asyncio
import json
import os
import re
import subprocess
import sys
import wave
from pathlib import Path

import imageio_ffmpeg
from emergentintegrations.llm.openai import OpenAITextToSpeech

from write_exercise_sheets import LANGS, LEVELS, admin_client, supabase_cfg

WORK = Path("/tmp/kfit_narration")
RATE = 24000  # PCM 16 bits mono renvoyé par l'API
GAP = 0.6  # silence entre deux phrases (secondes)
VOICE, MODEL = "coral", "gpt-4o-mini-tts"
DELIVERY = {
    "fr": "Parle en français, comme une coach sportive bienveillante : voix calme, claire et posée, rythme lent, articulation nette.",
    "en": "Speak in English like a supportive fitness coach: calm, clear and steady, slow pace, crisp articulation.",
    "es": "Habla en español, como una entrenadora cercana: voz tranquila, clara y pausada, ritmo lento, buena articulación.",
}
WORDS = {
    "fr": {"muscles": "Muscles travaillés", "equipment": "Matériel", "sets": ("série", "séries"), "of": "de", "reps": "répétitions",
           "rest": "secondes de repos", "norest": "sans repos", "to": "à", "s": "secondes", "m": "mètres", "min": "minutes",
           "beginner": "Niveau débutant", "intermediate": "Niveau intermédiaire", "advanced": "Niveau avancé", "step": "Étape"},
    "en": {"muscles": "Muscles worked", "equipment": "Equipment", "sets": ("set", "sets"), "of": "of", "reps": "reps",
           "rest": "seconds of rest", "norest": "no rest", "to": "to", "s": "seconds", "m": "metres", "min": "minutes",
           "beginner": "Beginner level", "intermediate": "Intermediate level", "advanced": "Advanced level", "step": "Step"},
    "es": {"muscles": "Músculos trabajados", "equipment": "Material", "sets": ("serie", "series"), "of": "de", "reps": "repeticiones",
           "rest": "segundos de descanso", "norest": "sin descanso", "to": "a", "s": "segundos", "m": "metros", "min": "minutos",
           "beginner": "Nivel principiante", "intermediate": "Nivel intermedio", "advanced": "Nivel avanzado", "step": "Paso"},
}


def labels() -> dict[str, dict[str, str]]:
    """Traductions des codes muscles / matériel, lues dans l'application (ordre des dictionnaires : en, es, fr)."""
    src = (Path(__file__).resolve().parents[2] / "frontend/src/i18n.tsx").read_text()
    out: dict[str, dict[str, str]] = {}
    for key, value in re.findall(r'\b((?:m|eq)_[a-z_]+): "([^"]+)"', src):
        out.setdefault(key, {})[("en", "es", "fr")[len(out.get(key, {}))]] = value
    return out


def spoken_reps(reps: str, lang: str) -> str:
    """« 8-10 » -> « 8 à 10 répétitions », « 30 s » -> « 30 secondes », « 20 m » -> « 20 mètres »."""
    w = WORDS[lang]
    m = re.fullmatch(r"\s*(\d+)(?:\s*-\s*(\d+))?\s*(s|m|min)?\s*", reps)
    if not m:
        return reps
    amount = m.group(1) + (f" {w['to']} {m.group(2)}" if m.group(2) else "")
    return f"{amount} {w[m.group(3)] if m.group(3) else w['reps']}"


def segments(ex: dict, lang: str, names: dict) -> list[dict]:
    """Phrases du commentaire : `say` est lu par la voix, `text` est affiché en sous-titre."""
    w = WORDS[lang]
    name = ex["name"].get(lang) or ex["name"]["en"]
    listing = lambda prefix, codes: ", ".join(names.get(prefix + c, {}).get(lang, c) for c in codes)  # noqa: E731
    intro = f"{name}. {w['muscles']} : {listing('m_', ex['muscle_groups'])}. {w['equipment']} : {listing('eq_', ex['equipment'])}."
    segs = [{"say": intro, "text": intro}]
    for i, line in enumerate(filter(None, (x.strip() for x in ex["instructions"][lang].split("\n"))), 1):
        step = re.sub(r"^\d+[.)]\s*", "", line)
        segs.append({"say": f"{w['step']} {i}. {step}", "text": f"{i}. {step}"})
    for level in LEVELS:
        v = ex["level_variants"].get(level)
        if not v:
            continue
        sets = f"{v['sets']} {w['sets'][v['sets'] > 1]}"
        rest = f"{v['rest_seconds']} {w['rest']}" if v.get("rest_seconds") else w["norest"]
        note = (v.get("note") or {}).get(lang, "")
        segs.append({"say": f"{w[level]} : {sets} {w['of']} {spoken_reps(v['reps'], lang)}, {rest}. {note}",
                     "text": f"{w[level]} : {v['sets']} × {v['reps']}, {rest}. {note}".strip()})
    return segs


async def narrate(slug: str, ex: dict, lang: str, names: dict, silent: Path) -> tuple[Path, Path, float]:
    tts = OpenAITextToSpeech(api_key=os.environ["EMERGENT_LLM_KEY"])
    pcm, cues, t = b"", [], 0.3
    pcm += b"\x00" * int(RATE * 2 * t)
    for seg in segments(ex, lang, names):
        audio = await tts.generate_speech(text=seg["say"], model=MODEL, voice=VOICE, instructions=DELIVERY[lang], response_format="pcm")
        audio = audio[: len(audio) // 2 * 2]
        dur = len(audio) / (RATE * 2)
        cues.append({"start": round(t, 2), "end": round(t + dur, 2), "text": seg["text"]})
        pcm += audio + b"\x00" * (int(RATE * GAP) * 2)
        t += dur + GAP
    wav, out, cue_file = WORK / f"{slug}.{lang}.wav", WORK / f"{slug}.{lang}.mp4", WORK / f"{slug}.{lang}.json"
    with wave.open(str(wav), "wb") as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(RATE); f.writeframes(pcm)
    # La démonstration est rejouée en boucle jusqu'à la fin du commentaire.
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error", "-stream_loop", "-1", "-i", str(silent), "-i", str(wav),
                    "-map", "0:v", "-map", "1:a", "-vf", "scale=-2:540", "-c:v", "libx264", "-preset", "veryfast", "-crf", "27",
                    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-shortest", "-movflags", "+faststart", str(out)], check=True)
    cue_file.write_text(json.dumps({"lang": lang, "duration": round(t, 2), "cues": cues}, ensure_ascii=False))
    return out, cue_file, t


async def main(slugs: list[str]) -> None:
    WORK.mkdir(exist_ok=True)
    c, rest = admin_client()
    storage = f"{supabase_cfg()[0]}/storage/v1/object"
    names = labels()
    for slug in slugs:
        ex = c.get(rest + f"exercises?select=slug,name,instructions,muscle_groups,equipment,level_variants,media_path&slug=eq.{slug}").json()[0]
        base = ex["media_path"]
        if not base:
            print(slug, "no demonstration video: skipped", flush=True)
            continue
        silent = WORK / f"{slug}.mp4"
        r = c.get(f"{storage}/authenticated/videos/{base}", timeout=300)
        r.raise_for_status()
        silent.write_bytes(r.content)
        for lang in LANGS:
            video, cues, seconds = await narrate(slug, ex, lang, names, silent)
            for file, ctype in ((video, "video/mp4"), (cues, "application/json")):
                path = base[: -len(".mp4")] + f".{lang}{file.suffix}"
                c.post(f"{storage}/videos/{path}", content=file.read_bytes(), timeout=300,
                       headers={"Content-Type": ctype, "x-upsert": "true"}).raise_for_status()
            print(slug, lang, f"{seconds:.0f}s", f"{video.stat().st_size / 1e6:.1f}MB", flush=True)


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:]))
