"""Génère les vidéos de démonstration d'exercices avec Fal.ai (essai pilote).

Usage : python generate_exercise_videos.py <slug> [<slug> ...]
Nécessite FAL_KEY dans l'environnement. Chaque vidéo est facturée sur le compte Fal.ai.
Les fichiers sont enregistrés dans /tmp/kfit_videos/<slug>.mp4 ; rien n'est publié par ce script.
"""
import json
import os
import sys
import time
from pathlib import Path

import fal_client
import httpx

MODEL = "alibaba/wan-3.0/text-to-video"
SECONDS = 8
OUT = Path("/tmp/kfit_videos")

# Description du mouvement, rédigée pour une démonstration claire et réaliste.
MOVES = {
    "sample-push-ups": "performs strict push-ups on a mat: hands under shoulders, body in a straight line from head to heels, "
                       "chest lowers close to the floor, elbows at about 45 degrees, then pushes back up with control",
    "sample-goblet-squat": "performs goblet squats holding one kettlebell against the chest with both hands: feet shoulder-width, "
                           "hips go down and back until thighs are parallel to the floor, chest up, heels on the ground, then stands up",
    "sample-plank": "holds a forearm plank on a mat: elbows under shoulders, forearms on the floor, body in one straight line "
                    "from head to heels, core braced, hips neither sagging nor raised, steady breathing",
}


def prompt(move: str) -> str:
    return ("Realistic fitness instruction video, filmed in a bright minimalist premium gym with natural light. "
            f"One athletic adult in plain dark sportswear {move}. Side view, full body always in frame, fixed camera on a tripod, "
            "slow controlled tempo, anatomically correct movement and proportions, two full repetitions. "
            "No text, no logo, no other people, no camera movement.")


def main(slugs: list[str]) -> None:
    OUT.mkdir(exist_ok=True)
    report = {}
    for slug in slugs:
        started = time.time()
        try:
            result = fal_client.subscribe(MODEL, arguments={
                "prompt": prompt(MOVES[slug]), "duration": SECONDS, "aspect_ratio": "16:9", "resolution": "720p"})
            url = result["video"]["url"]
            data = httpx.get(url, timeout=120, follow_redirects=True).content
            (OUT / f"{slug}.mp4").write_bytes(data)
            report[slug] = {"ok": True, "bytes": len(data), "seconds": round(time.time() - started)}
        except Exception as exc:  # on continue avec les autres exercices
            report[slug] = {"ok": False, "error": str(exc)[:500]}
        (OUT / "report.json").write_text(json.dumps(report, indent=2))
        print(slug, report[slug], flush=True)


if __name__ == "__main__":
    main(sys.argv[1:] or list(MOVES))
