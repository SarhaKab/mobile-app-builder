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
| Lecture vidéo | Aucun fichier vidéo n'existe. À faire : envoi de fichiers dans le stockage privé `videos` depuis l'administration + lecteur. |
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
