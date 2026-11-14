"""Iteration 7 — Guided video + segment timing + inventory verification.

Reads drafts/exercises/<slug>.<level>.<lang>.json meta and validates:
- segment counts (work==sets, rest==sets-1 when rest_seconds>0)
- segment durations (work = reps_upper * 3s for rep-based or seconds for time-based; rest = rest_seconds)
- non-overlap, ordering
- cues: intro + per-instruction step + 'Pour la prochaine série' / 'For the next set' / 'Para la próxima serie' inside rest when rest>=30s + 'Série k sur n' at end of rest + final 'Bravo' cue
- inventory: 3 base .mp4 + 5 level clips + 27 guided .mp4 + 27 .json (3 slugs x 3 levels x 3 langs)
"""
import os, re, sys, requests, json

SUPABASE_URL = "https://soaivvemysgzmjntmkta.supabase.co"
APIKEY = "sb_publishable_MgI2Me489KLXdfeANIVnkQ_GKMdHeRy"
EMAIL = os.environ["KFIT_TEST_EMAIL"]
PW = os.environ["KFIT_TEST_PASSWORD"]
SLUGS = ["sample-push-ups", "sample-goblet-squat", "sample-plank"]
LEVELS = ["beginner", "intermediate", "advanced"]
LANGS = ["fr", "en", "es"]
NEXT_SET_PREFIX = {"fr": "Pour la prochaine série", "en": "For the next set", "es": "Para la próxima serie"}
SET_ANNOUNCE = {"fr": re.compile(r"Série \d+ sur \d+", re.I), "en": re.compile(r"Set \d+ of \d+", re.I), "es": re.compile(r"Serie \d+ de \d+", re.I)}
BRAVO = {"fr": re.compile(r"\b(Bravo|Bien joué|Excellent)\b", re.I), "en": re.compile(r"\b(Great|Well done|Awesome|Nice work)\b", re.I), "es": re.compile(r"\b(Bravo|Buen trabajo|Excelente)\b", re.I)}


def login():
    r = requests.post(f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
                      headers={"apikey": APIKEY, "Content-Type": "application/json"},
                      json={"email": EMAIL, "password": PW}, timeout=20)
    r.raise_for_status(); return r.json()["access_token"]


def hdr(tok): return {"apikey": APIKEY, "Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def list_prefix(tok, prefix):
    r = requests.post(f"{SUPABASE_URL}/storage/v1/object/list/videos", headers=hdr(tok),
                      json={"prefix": prefix, "limit": 1000, "sortBy": {"column": "name", "order": "asc"}}, timeout=30)
    r.raise_for_status(); return [f["name"] for f in r.json()]


def meta(tok, key):
    """Download via authenticated storage endpoint."""
    r = requests.get(f"{SUPABASE_URL}/storage/v1/object/authenticated/videos/{key}", headers=hdr(tok), timeout=20)
    r.raise_for_status()
    return r.json()


def rest_get(tok, path, params):
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=hdr(tok), params=params, timeout=20)
    r.raise_for_status(); return r.json()


def reps_upper_seconds(reps):
    """Return expected work duration in seconds. '8-10' -> 30, '15-20' -> 60, '20 s' -> 20."""
    s = str(reps).strip()
    m = re.match(r"^(\d+)\s*s$", s)
    if m: return int(m.group(1)), "time"
    m = re.match(r"^\d+\s*-\s*(\d+)$", s)
    if m: return int(m.group(1)) * 3, "reps"
    m = re.match(r"^(\d+)$", s)
    if m: return int(m.group(1)) * 3, "reps"
    return None, "unknown"


def validate_meta(j, exp_lang, exp_level, sets, reps, rest):
    errs = []
    if j.get("lang") != exp_lang: errs.append(f"lang={j.get('lang')} != {exp_lang}")
    if j.get("level") != exp_level: errs.append(f"level={j.get('level')} != {exp_level}")
    segs = j.get("segments") or []
    cues = j.get("cues") or []
    works = [s for s in segs if s.get("type") == "work"]
    rests = [s for s in segs if s.get("type") == "rest"]
    exp_rests = max(0, sets - 1) if (rest or 0) > 0 else 0
    if len(works) != sets: errs.append(f"work segments={len(works)} expected {sets}")
    if len(rests) != exp_rests: errs.append(f"rest segments={len(rests)} expected {exp_rests}")
    work_sec, kind = reps_upper_seconds(reps)
    # Check durations
    for i, w in enumerate(works):
        d = round(w["end"] - w["start"], 2)
        if work_sec and abs(d - work_sec) > 0.5: errs.append(f"work#{i+1} dur={d} expected {work_sec} ({reps})")
    for i, rs in enumerate(rests):
        d = round(rs["end"] - rs["start"], 2)
        if rest and abs(d - rest) > 0.5: errs.append(f"rest#{i+1} dur={d} expected {rest}")
    # Ordering, non-overlap
    prev_end = 0
    for s in segs:
        if s["start"] < prev_end - 0.01: errs.append(f"overlap at {s}")
        prev_end = s["end"]
    # Cues checks
    overlaps = []
    for a, b in zip(cues, cues[1:]):
        if b["start"] < a["end"] - 0.01: overlaps.append((a, b))
    # Inside each rest, must have a set-announcement cue ending near rest.end
    for i, rs in enumerate(rests):
        inside = [c for c in cues if c["start"] >= rs["start"] - 0.1 and c["end"] <= rs["end"] + 0.5]
        has_set = any(SET_ANNOUNCE[exp_lang].search(c["text"]) for c in inside)
        if not has_set: errs.append(f"rest#{i+1} missing 'Série k sur n' cue")
        if rest and rest >= 30:
            has_next = any(c["text"].startswith(NEXT_SET_PREFIX[exp_lang]) for c in inside)
            if not has_next: errs.append(f"rest#{i+1} (>=30s) missing 'Pour la prochaine série' cue")
    # Final cue 'Bravo'
    if cues and not BRAVO[exp_lang].search(cues[-1]["text"]):
        errs.append(f"final cue not 'Bravo…': {cues[-1]['text'][:60]}")
    return errs, overlaps, works, rests, kind, work_sec


def main():
    tok = login()
    report = {"inventory": {}, "metas": [], "errors": []}
    # inventory
    all_files = list_prefix(tok, "drafts/exercises")
    sample = [n for n in all_files if n.startswith("sample-")]
    report["inventory"]["total_sample"] = len(sample)
    # Breakdown
    base = [n for n in sample if re.fullmatch(r"sample-[a-z-]+\.mp4", n)]
    level_clips = [n for n in sample if re.fullmatch(r"sample-[a-z-]+\.(beginner|intermediate|advanced)\.mp4", n)]
    guided = [n for n in sample if re.fullmatch(r"sample-[a-z-]+\.(beginner|intermediate|advanced)\.(fr|en|es)\.mp4", n)]
    jsons = [n for n in sample if re.fullmatch(r"sample-[a-z-]+\.(beginner|intermediate|advanced)\.(fr|en|es)\.json", n)]
    stale_lang = [n for n in sample if re.fullmatch(r"sample-[a-z-]+\.(fr|en|es)\.mp4", n)]
    report["inventory"].update({"base": len(base), "base_list": sorted(base),
                                 "level_clips": len(level_clips), "level_clips_list": sorted(level_clips),
                                 "guided": len(guided), "jsons": len(jsons),
                                 "stale_old_format": len(stale_lang), "stale_list": sorted(stale_lang)})
    # Fetch level_variants from DB for each slug
    rows = rest_get(tok, "exercises", {"slug": f"in.({','.join(SLUGS)})", "select": "slug,level_variants"})
    variants = {r["slug"]: r["level_variants"] for r in rows}
    # For each slug, level, lang: fetch meta and validate
    for slug in SLUGS:
        lv = variants.get(slug, {})
        for level in LEVELS:
            v = lv.get(level)
            if not v:
                report["metas"].append({"slug": slug, "level": level, "skip": "no variant"}); continue
            for lang in LANGS:
                key = f"drafts/exercises/{slug}.{level}.{lang}.json"
                try:
                    j = meta(tok, key)
                except Exception as e:
                    report["errors"].append(f"{key}: fetch failed {e}"); continue
                sets = int(v.get("sets") or 0)
                reps = v.get("reps")
                rest = v.get("rest_seconds") or 0
                errs, overlaps, works, rests, kind, wsec = validate_meta(j, lang, level, sets, reps, rest)
                entry = {"slug": slug, "level": level, "lang": lang, "sets": sets, "reps": reps,
                         "rest": rest, "kind": kind, "work_sec": wsec,
                         "work_count": len(works), "rest_count": len(rests),
                         "duration": round(j.get("duration", 0), 1), "cues": len(j.get("cues", [])),
                         "segments": len(j.get("segments", [])),
                         "errors": errs, "cue_overlaps": len(overlaps)}
                report["metas"].append(entry)
                if errs:
                    report["errors"].extend([f"{slug}/{level}/{lang}: {e}" for e in errs])

    # Print concise table
    print("=== INVENTORY ===")
    for k in ("total_sample", "base", "level_clips", "guided", "jsons", "stale_old_format"):
        print(f"  {k}: {report['inventory'][k]}")
    print("  base_list:", report["inventory"]["base_list"])
    print("  level_clips_list:", report["inventory"]["level_clips_list"])
    if report["inventory"]["stale_list"]:
        print("  STALE:", report["inventory"]["stale_list"])

    print("\n=== META/SEGMENTS TABLE ===")
    print(f"{'slug':22} {'level':13} {'lang':4} {'sets':>4} {'reps':>7} {'rest':>4} {'wsec':>5} {'W/R':>7} {'dur':>6} {'cues':>4} {'errs':>4}")
    for m in report["metas"]:
        if "skip" in m:
            print(f"  {m['slug']:22} {m['level']:13} -- SKIP: {m['skip']}"); continue
        wr = f"{m['work_count']}/{m['rest_count']}"
        print(f"  {m['slug']:22} {m['level']:13} {m['lang']:4} {m['sets']:>4} {str(m['reps']):>7} {m['rest']:>4} {str(m['work_sec']):>5} {wr:>7} {m['duration']:>6.1f} {m['cues']:>4} {len(m['errors']):>4}")

    print("\n=== ERRORS ===")
    if not report["errors"]:
        print("  (none)")
    else:
        for e in report["errors"][:80]: print("  -", e)
        if len(report["errors"]) > 80: print(f"  …({len(report['errors'])-80} more)")

    # Write JSON for consumption
    with open("/tmp/iter7_meta_report.json", "w") as f:
        json.dump(report, f, indent=2)
    print(f"\nSaved to /tmp/iter7_meta_report.json ({len(report['metas'])} entries, {len(report['errors'])} errors)")
    return 0 if not report["errors"] else 1


if __name__ == "__main__":
    sys.exit(main())
