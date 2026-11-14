"""Construit les vidéos GUIDÉES d'un exercice : une par niveau et par langue (3 x 3 = 9 vidéos).

Chaque vidéo dure le temps réel de l'exercice pour ce niveau :
  présentation -> consignes étape par étape -> pour chaque série : travail (durée calculée) puis repos chronométré.
- Image : la démonstration du niveau (variante débutant / intermédiaire / avancé), rejouée en boucle ; assombrie pendant les repos.
- Voix : coach dynamique (OpenAI TTS) ; pendant chaque repos elle annonce la consigne à soigner pour la série suivante.
- Musique : fond instrumental discret (assets/music-fitness.mp3).
- Sous-titres, compte à rebours des séries et des repos : incrustés dans l'image (lisibles en plein écran).
- Fichier .json associé : sous-titres + segments travail / repos, utilisés par le minuteur interactif de l'application.

Durée d'une série : répétitions (borne haute) x SECONDS_PER_REP, ou la durée indiquée (« 40 s », « 5 min »).
Usage : python build_guided_videos.py <slug> [<slug> ...]   (aucun appel Fal.ai ; voix sur EMERGENT_LLM_KEY)
"""
import asyncio
import hashlib
import json
import os
import re
import subprocess
import sys
import textwrap
import wave
from pathlib import Path

import imageio_ffmpeg
import numpy as np
from emergentintegrations.llm.openai import OpenAITextToSpeech

from generate_level_clips import MUSIC_PATH
from narrate_exercise_videos import RATE, WORDS, labels, spoken_reps
from write_exercise_sheets import LANGS, LEVELS, admin_client, supabase_cfg

WORK, CACHE = Path("/tmp/kfit_guided"), Path("/tmp/kfit_tts")
FONT = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
SECONDS_PER_REP = 3
VOICE, MODEL = "coral", "gpt-4o-mini-tts"
DELIVERY = {
    "fr": "Parle en français comme une coach de fitness dynamique et motivante : énergie positive, sourire dans la voix, rythme soutenu mais très clair.",
    "en": "Speak in English like a dynamic, motivating fitness coach: positive energy, a smile in the voice, lively but very clear pace.",
    "es": "Habla en español como una entrenadora de fitness dinámica y motivadora: energía positiva, sonrisa en la voz, ritmo vivo pero muy claro.",
}
T = {
    "fr": {"plan": "{sets} de {reps}, {rest} entre les séries.", "one": "{sets} de {reps}.", "set": "Série {k} sur {n}", "go": "C'est parti !",
           "last": "Encore un effort, tiens bon jusqu'au bout !", "rest": "Repos", "restsay": "Repos, {r} secondes. Respire et récupère.",
           "next": "Pour la prochaine série",
           "done": "Bravo, exercice terminé ! Pense à boire un peu d'eau.", "ready": "Mets-toi en position."},
    "en": {"plan": "{sets} of {reps}, {rest} between sets.", "one": "{sets} of {reps}.", "set": "Set {k} of {n}", "go": "Let's go!",
           "last": "Almost there, stay strong to the end!", "rest": "Rest", "restsay": "Rest for {r} seconds. Breathe and recover.",
           "next": "For the next set",
           "done": "Well done, exercise complete! Remember to drink some water.", "ready": "Get into position."},
    "es": {"plan": "{sets} de {reps}, {rest} entre series.", "one": "{sets} de {reps}.", "set": "Serie {k} de {n}", "go": "¡Vamos!",
           "last": "¡Un último esfuerzo, aguanta hasta el final!", "rest": "Descanso", "restsay": "Descanso, {r} segundos. Respira y recupera.",
           "next": "Para la próxima serie",
           "done": "¡Bravo, ejercicio terminado! Recuerda beber un poco de agua.", "ready": "Colócate en posición."},
}
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
_sem = asyncio.Semaphore(5)


async def speak(text: str, lang: str) -> np.ndarray:
    """Voix (PCM 24 kHz mono), mise en cache par phrase : les consignes sont communes aux trois niveaux."""
    file = CACHE / f"{hashlib.sha256(f'{MODEL}|{VOICE}|{DELIVERY[lang]}|{text}'.encode()).hexdigest()}.pcm"
    if not file.exists():
        async with _sem:
            audio = await OpenAITextToSpeech(api_key=os.environ["EMERGENT_LLM_KEY"]).generate_speech(
                text=text, model=MODEL, voice=VOICE, instructions=DELIVERY[lang], response_format="pcm")
        file.write_bytes(audio[: len(audio) // 2 * 2])
    return np.frombuffer(file.read_bytes(), dtype=np.int16)


def work_seconds(reps: str) -> int:
    m = re.fullmatch(r"\s*(\d+)(?:\s*-\s*(\d+))?\s*(s|min|m)?\s*", reps)
    if not m:
        return 30
    n = int(m.group(2) or m.group(1))
    return {"s": n, "min": n * 60, "m": n, None: n * SECONDS_PER_REP}[m.group(3)]


async def timeline(ex: dict, level: str, lang: str, names: dict) -> dict:
    """Déroulé complet : phrases placées dans le temps, sous-titres, segments travail / repos."""
    w, tr, v = WORDS[lang], T[lang], ex["level_variants"][level]
    voice: list[tuple[float, np.ndarray]] = []
    cues: list[dict] = []
    segments: list[dict] = []
    t = 0.5

    async def say(spoken: str, shown: str, at: float | None = None) -> float:
        nonlocal t
        audio = await speak(spoken, lang)
        start = t if at is None else at
        end = start + len(audio) / RATE
        voice.append((start, audio))
        cues.append({"start": round(start, 2), "end": round(end, 2), "text": shown})
        if at is None:
            t = end + 0.5
        return end

    listing = lambda prefix, codes: ", ".join(names.get(prefix + c, {}).get(lang, c) for c in codes)  # noqa: E731
    name = ex["name"].get(lang) or ex["name"]["en"]
    intro = f"{name}, {w[level].lower()}. {w['muscles']} : {listing('m_', ex['muscle_groups'])}. {w['equipment']} : {listing('eq_', ex['equipment'])}."
    await say(intro, intro)
    n, rest = v["sets"], v.get("rest_seconds") or 0
    sets = f"{n} {w['sets'][n > 1]}"
    key = "plan" if n > 1 and rest else "one"
    await say(tr[key].format(sets=sets, reps=spoken_reps(v["reps"], lang), rest=f"{rest} {w['rest']}"),
              tr[key].format(sets=sets, reps=v["reps"], rest=f"{rest} {w['rest']}"))
    note = (v.get("note") or {}).get(lang)
    if note:
        await say(note, note)
    steps = [re.sub(r"^\d+[.)]\s*", "", x.strip()) for x in ex["instructions"][lang].split("\n") if x.strip()]
    for i, step in enumerate(steps, 1):
        await say(f"{w['step']} {i}. {step}", f"{i}. {step}")
    await say(tr["ready"], tr["ready"])

    async def announce(k: int, before: float | None = None) -> None:
        label = tr["set"].format(k=k, n=n)
        spoken, shown = f"{label}. {spoken_reps(v['reps'], lang)}. {tr['go']}", f"{label} — {v['reps']}. {tr['go']}"
        length = len(await speak(spoken, lang)) / RATE
        await say(spoken, shown, at=None if before is None else before - length - 0.2)

    duration = work_seconds(v["reps"])
    for k in range(1, n + 1):
        if k == 1 or not rest:
            await announce(k)
        segments.append({"type": "work", "set": k, "sets": n, "start": round(t, 2), "end": round(t + duration, 2)})
        if duration >= 20:
            await say(tr["last"], tr["last"], at=t + duration - 7)
        t += duration
        if k < n and rest:
            segments.append({"type": "rest", "set": k, "sets": n, "start": round(t, 2), "end": round(t + rest, 2)})
            end = await say(tr["restsay"].format(r=rest), tr["restsay"].format(r=rest), at=t)
            tip = steps[(k % max(len(steps) - 1, 1))] if steps else ""  # consigne à soigner à la série suivante
            if tip and rest >= 30:
                await say(f"{tr['next']} : {tip}", f"{tr['next']} : {tip}", at=end + 1.5)
            t += rest
            await announce(k + 1, before=t)  # la série suivante est annoncée à la fin du repos
    t += 0.5
    await say(tr["done"], tr["done"])
    return {"lang": lang, "level": level, "duration": round(t + 0.5, 2), "cues": sorted(cues, key=lambda c: c["start"]),
            "segments": segments, "voice": voice}


def esc(path: Path) -> str:
    return str(path).replace(":", r"\:")


def render(clip: Path, music: Path, tl: dict, out: Path, tmp: Path) -> None:
    total = tl["duration"]
    track = np.zeros(int(total * RATE) + RATE, dtype=np.int32)
    for start, audio in tl["voice"]:
        i = int(start * RATE)
        track[i:i + len(audio)] += audio[: len(track) - i]
    wav = tmp / "voice.wav"
    with wave.open(str(wav), "wb") as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(RATE)
        f.writeframes(np.clip(track, -32768, 32767).astype(np.int16).tobytes())

    filters = ["[0:v]scale=960:540,fps=24"]
    rests = [s for s in tl["segments"] if s["type"] == "rest"]
    if rests:  # image assombrie pendant les repos
        on = "+".join(f"between(t,{s['start']},{s['end']})" for s in rests)
        filters.append(f"eq=brightness=-0.35:saturation=0.4:enable='{on}'")
    box = "fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=14"
    for s in tl["segments"]:  # compte à rebours incrusté : séries (en haut à gauche) et repos (au centre)
        between = f"enable='between(t,{s['start']},{s['end']})'"
        count = f"%{{eif\\:ceil({s['end']}-t)\\:d}}"
        if s["type"] == "rest":
            label = T[tl["lang"]]["rest"].upper()
            filters.append(f"drawtext=fontfile={FONT}:text='{label}  {count} s':fontsize=76:{box}:x=(w-text_w)/2:y=(h-text_h)/2-60:{between}")
        else:
            label = T[tl["lang"]]["set"].format(k=s["set"], n=s["sets"]).upper().replace("'", "")
            filters.append(f"drawtext=fontfile={FONT}:text='{label}  {count} s':fontsize=34:{box}:x=28:y=28:{between}")
    for i, c in enumerate(tl["cues"]):  # sous-titres incrustés
        file = tmp / f"cue{i}.txt"
        file.write_text("\n".join(textwrap.wrap(c["text"], 54)))
        filters.append(f"drawtext=fontfile={FONT}:textfile={esc(file)}:fontsize=28:line_spacing=8:text_align=C:{box}"
                       f":x=(w-text_w)/2:y=h-text_h-34:enable='between(t,{c['start']},{c['end'] + 0.3})'")
    graph = tmp / "graph.txt"
    graph.write_text(",".join(filters) + "[v];[1:a]volume=1.6[a1];[2:a]volume=0.13[a2];[a1][a2]amix=inputs=2:duration=first:normalize=0[a]")
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-stream_loop", "-1", "-i", str(clip), "-i", str(wav), "-stream_loop", "-1", "-i", str(music),
                    "-/filter_complex", str(graph), "-map", "[v]", "-map", "[a]", "-t", str(total), "-c:v", "libx264", "-preset", "veryfast",
                    "-crf", "28", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(out)], check=True)


async def main(slugs: list[str]) -> None:
    WORK.mkdir(exist_ok=True); CACHE.mkdir(exist_ok=True)
    c, rest = admin_client()
    storage = f"{supabase_cfg()[0]}/storage/v1/object"

    def fetch(path: str, local: Path) -> Path:
        if not local.exists():
            r = c.get(f"{storage}/authenticated/videos/{path}", timeout=300)
            r.raise_for_status()
            local.write_bytes(r.content)
        return local

    music, names = fetch(MUSIC_PATH, WORK / "music.mp3"), labels()
    for slug in slugs:
        ex = c.get(rest + f"exercises?select=slug,name,instructions,muscle_groups,equipment,level_variants,media_path&slug=eq.{slug}").json()[0]
        stem = ex["media_path"][: -len(".mp4")]
        for level in LEVELS:
            if level not in ex["level_variants"]:
                continue
            # Démonstration du niveau ; à défaut, la démonstration standard.
            try:
                clip = fetch(f"{stem}.{level}.mp4", WORK / f"{slug}.{level}.silent.mp4")
            except Exception:
                clip = fetch(f"{stem}.mp4", WORK / f"{slug}.silent.mp4")
            for lang in LANGS:
                tl = await timeline(ex, level, lang, names)
                tmp = WORK / f"{slug}.{level}.{lang}"
                tmp.mkdir(exist_ok=True)
                out = WORK / f"{slug}.{level}.{lang}.mp4"
                render(clip, music, tl, out, tmp)
                meta = json.dumps({k: tl[k] for k in ("lang", "level", "duration", "cues", "segments")}, ensure_ascii=False).encode()
                for data, suffix, ctype in ((out.read_bytes(), "mp4", "video/mp4"), (meta, "json", "application/json")):
                    c.post(f"{storage}/videos/{stem}.{level}.{lang}.{suffix}", content=data, timeout=600,
                           headers={"Content-Type": ctype, "x-upsert": "true"}).raise_for_status()
                print(slug, level, lang, f"{tl['duration']:.0f}s", f"{out.stat().st_size / 1e6:.1f}MB", flush=True)


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:]))
