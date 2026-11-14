# KFIT HOME, rôles et coordonnées — état au 14/11/2026

## Opérationnel (données réelles dans Supabase, protégées par RLS)

- **Catalogue KFIT HOME** (`frontend/app/(tabs)/training.tsx`) : programmes, vidéos (séances) et exercices publiés ;
  filtres par objectif (6), niveau (3), durée (vidéos) ; favoris ; accès à l'historique.
- **Fiches** : programme (`app/program/[id].tsx`), séance (`app/video/[id].tsx`), exercice (`app/exercise/[id].tsx`).
- **Suivi** : inscription à un programme (`program_enrollments`), séance terminée (`workout_history`),
  favoris (`favorites`), historique (`app/history.tsx`), carte « Ton programme » et totaux sur l'accueil.
- **Coordonnées** (`app/contact.tsx`) : nom, téléphone, adresse postale, enregistrés dans
  `client_profiles.preferences.contact` (lisible par l'utilisateur et l'équipe KFIT uniquement).
- **Rôles** : le rôle (client, coach, support, admin) est affiché dans le profil ; l'entrée
  « Gestion des contenus » n'apparaît que pour le rôle `admin`.
- **Administration des contenus** (`app/admin/`) : créer, modifier, publier, supprimer programmes, vidéos, exercices.
  La base refuse toute écriture aux autres rôles, quel que soit l'écran.
- Accès aux données : `frontend/src/home.ts`. Contenus d'exemple : `frontend/src/sample-content.ts`
  (les 3 programmes du prototype, slug préfixé `sample-`, chargés par un admin depuis l'écran d'administration).

## Non intégré (rien n'est simulé)

| Élément | Ce qu'il faut |
| --- | --- |
| Vidéos des séances | Le lecteur existe (`src/components/video-player.tsx`) mais aucune séance n'a de fichier. Envoi de fichiers depuis l'administration : à faire. |
| Image de couverture | Saisie d'une adresse (URL) uniquement ; pas encore d'envoi d'image. |
| Contenus premium | Le drapeau « Premium » est affiché mais ne bloque rien tant que l'abonnement n'est pas intégré. |
| Séries / répétitions par séance | Non modifiables depuis l'administration (présentes dans les contenus d'exemple). |
| Catégories (`program_categories`) | Non utilisées : le filtre repose sur l'objectif du programme. |
| Colonnes dédiées téléphone / adresse | Les coordonnées sont dans `preferences` (jsonb) ; une migration peut créer des colonnes dédiées. |

## Reste sur l'ancien serveur (FastAPI + MongoDB), à migrer

Progrès (poids), plan nutrition, coach IA, réservation de créneaux. Les routes `/api/programs*` et la partie
« programme » de `/api/dashboard` ne sont plus utilisées par l'application et seront supprimées lors de cette migration.

## Créer un administrateur

Dans Supabase → SQL Editor :

```sql
update public.users set role = 'admin'
where id = (select id from auth.users where email = 'adresse@exemple.com');
```

## Fiches d'exercices et vidéos de démonstration (14/11/2026)

- Migration `supabase/migrations/0004_exercise_levels.sql` (appliquée) : colonne `exercises.level_variants`
  (séries, répétitions, repos, adaptation par niveau) et lecture du stockage privé `videos` par les utilisateurs connectés.
- Fiches des 38 exercices d'exemple rédigées par IA (`backend/scripts/write_exercise_sheets.py`) : consignes FR/EN/ES,
  muscles et matériel (codes traduits `m_*` / `eq_*` dans `src/i18n.tsx`), variantes par niveau. **À relire par un professionnel.**
  Modifiables dans l'administration.
- Vidéos générées par IA (Fal.ai, `backend/scripts/generate_exercise_videos.py`, modèle Wan 3.0, 8 s, 720p, sans son) :
  essai sur 3 exercices (pompes, goblet squat, planche). Elles sont en **brouillon** (`drafts/…` dans le stockage) :
  seuls les administrateurs les voient ; validation ou retrait depuis Administration → exercice → « Vidéo de démonstration ».
- Limite connue : le masquage des brouillons est fait par l'application ; un utilisateur connecté qui connaîtrait le chemin
  exact du fichier pourrait le lire (règle de stockage ouverte à tout le bucket `videos`).
