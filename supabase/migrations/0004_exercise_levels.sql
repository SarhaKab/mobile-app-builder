-- KFIT — fiches d'exercices détaillées par niveau.
-- Ajoute aux exercices les variantes par niveau (séries, répétitions, repos, charge conseillée).
-- La vidéo de démonstration utilise la colonne existante `media_path` (bucket privé « videos »).
--
-- Format de `level_variants` :
-- { "beginner":     { "sets": 3, "reps": "10", "rest_seconds": 60, "note": {"fr": "...", "en": "...", "es": "..."} },
--   "intermediate": { ... }, "advanced": { ... } }

alter table exercises
  add column if not exists level_variants jsonb not null default '{}'::jsonb;

alter table exercises
  add constraint exercises_level_variants_is_object check (jsonb_typeof(level_variants) = 'object');

-- Lecture des vidéos (bucket privé « videos ») par les utilisateurs connectés, via une URL signée
-- de courte durée. L'écriture reste réservée à l'administration (policy media_admin_write).
create policy videos_read on storage.objects for select to authenticated
  using (bucket_id = 'videos');
