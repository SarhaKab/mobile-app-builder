"""Génère les vidéos de démonstration d'exercices avec Fal.ai (essai pilote).

Usage : python generate_exercise_videos.py <slug> [<slug> ...]
Nécessite FAL_KEY dans l'environnement. Chaque vidéo est facturée sur le compte Fal.ai.
Les fichiers sont enregistrés dans /tmp/kfit_videos/<slug>.mp4 puis envoyés en BROUILLON dans Supabase
(visibles des seuls administrateurs jusqu'à validation). `python generate_exercise_videos.py --upload <slug>`
envoie un fichier déjà généré sans relancer la génération.
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


def upload_draft(slug: str) -> str:
    """Envoie la vidéo dans le stockage privé « videos » en BROUILLON (dossier drafts/) et la rattache à l'exercice.
    Un brouillon n'est montré qu'aux administrateurs, qui le valident ou le retirent depuis l'application."""
    from write_exercise_sheets import admin_client, supabase_cfg
    c, rest = admin_client()
    path = f"drafts/exercises/{slug}.mp4"
    r = c.post(f"{supabase_cfg()[0]}/storage/v1/object/videos/{path}", content=(OUT / f"{slug}.mp4").read_bytes(),
               headers={"Content-Type": "video/mp4", "x-upsert": "true"}, timeout=300)
    r.raise_for_status()
    c.patch(rest + f"exercises?slug=eq.{slug}", json={"media_path": path}).raise_for_status()
    return path


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
            report[slug] = {"ok": True, "bytes": len(data), "seconds": round(time.time() - started), "draft": upload_draft(slug)}
        except Exception as exc:  # on continue avec les autres exercices
            report[slug] = {"ok": False, "error": str(exc)[:500]}
        (OUT / "report.json").write_text(json.dumps(report, indent=2))
        print(slug, report[slug], flush=True)


if __name__ == "__main__":
    if sys.argv[1:2] == ["--upload"]:
        print([upload_draft(s) for s in sys.argv[2:]])
    else:
        main(sys.argv[1:] or list(MOVES))
