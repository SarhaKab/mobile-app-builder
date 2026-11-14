"""Génère avec Fal.ai les démonstrations par NIVEAU (débutant / avancé) et la musique de fond.

Usage : python generate_level_clips.py <slug> [<slug> ...]      -> clips <slug>.beginner.mp4 et <slug>.advanced.mp4
        python generate_level_clips.py --music                  -> musique de fond instrumentale
La démonstration existante <slug>.mp4 sert de niveau intermédiaire. Les fichiers sont écrits dans /tmp/kfit_videos
et envoyés dans le stockage Supabase « videos » à côté de la vidéo de l'exercice (même statut brouillon / validé).
Chaque clip est facturé sur le compte Fal.ai (FAL_KEY).
"""
import sys
from pathlib import Path

import fal_client
import httpx

from generate_exercise_videos import MODEL, OUT, SECONDS, prompt
from write_exercise_sheets import admin_client, supabase_cfg

MUSIC_MODEL = "fal-ai/stable-audio-3/small/music/text-to-audio"
MUSIC_PATH = "assets/music-fitness.mp3"
# Variante montrée à l'image pour chaque niveau (alignée sur la note « adaptation » de la fiche).
LEVEL_MOVES = {
    "sample-push-ups": {
        "beginner": "performs incline push-ups with both hands on the edge of a sturdy flat gym bench and feet on the floor: body in a "
                    "straight line from head to heels, chest lowers to the bench, elbows at about 45 degrees, then pushes back up with control",
        "advanced": "performs decline push-ups with both feet elevated on a flat gym bench and hands on the floor: body in a straight line, "
                    "lowers slowly for three seconds until the chest is close to the floor, short pause, then pushes back up",
    },
    "sample-goblet-squat": {
        "beginner": "performs box squats holding one small light kettlebell against the chest with both hands: sits back slowly until lightly "
                    "touching a wooden box placed behind, chest up, heels on the ground, then stands up",
        "advanced": "performs deep goblet squats holding one large heavy kettlebell against the chest with both hands: lowers below parallel, "
                    "holds a clear two-second pause at the bottom with chest up and heels down, then stands up powerfully",
    },
    "sample-plank": {
        "beginner": "holds a kneeling forearm plank on a mat, completely still for the whole video: both knees stay on the mat the entire "
                    "time, lower legs resting on the mat, forearms on the mat with elbows under shoulders, straight line from head to knees. "
                    "The person never lifts the knees and never changes position",
        "advanced": "holds a strict forearm plank on a mat, completely still for the whole video: feet together side by side on the toes, "
                    "legs fully straight, elbows slightly in front of the shoulders, body in one perfectly straight rigid line, no equipment "
                    "other than the mat. The person never changes position",
    },
}


def upload(local: Path, path: str, ctype: str) -> None:
    c, _ = admin_client()
    c.post(f"{supabase_cfg()[0]}/storage/v1/object/videos/{path}", content=local.read_bytes(), timeout=300,
           headers={"Content-Type": ctype, "x-upsert": "true"}).raise_for_status()


def clips(slug: str) -> None:
    c, rest = admin_client()
    base = c.get(rest + f"exercises?select=media_path&slug=eq.{slug}").json()[0]["media_path"]
    for level, move in LEVEL_MOVES[slug].items():
        try:
            result = fal_client.subscribe(MODEL, arguments={
                "prompt": prompt(move), "duration": SECONDS, "aspect_ratio": "16:9", "resolution": "720p"})
            local = OUT / f"{slug}.{level}.mp4"
            local.write_bytes(httpx.get(result["video"]["url"], timeout=120, follow_redirects=True).content)
            upload(local, base[: -len(".mp4")] + f".{level}.mp4", "video/mp4")
            print(slug, level, "ok", flush=True)
        except Exception as exc:
            print(slug, level, "FAILED", str(exc)[:300], flush=True)


def music() -> None:
    result = fal_client.subscribe(MUSIC_MODEL, arguments={
        "prompt": "Motivating fitness workout instrumental, modern upbeat electronic with steady driving beat around 120 BPM, warm bass, "
                  "light synth plucks, positive and energetic but discreet enough for a voice-over, no vocals, seamless loop",
        "duration": 90, "output_format": "mp3"})
    local = OUT / "music-fitness.mp3"
    local.write_bytes(httpx.get(result["audio"]["url"], timeout=120, follow_redirects=True).content)
    upload(local, MUSIC_PATH, "audio/mpeg")
    print("music ok", local.stat().st_size, flush=True)


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    music() if sys.argv[1:] == ["--music"] else [clips(s) for s in sys.argv[1:]]
