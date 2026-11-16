# KFIT — base de données Supabase

Projet Supabase : `KFIT` (région us-east-1). Migrations appliquées le 14/11/2026.

- `migrations/0001_kfit_core.sql` — tables, rôles (client, coach, support, admin), règles RLS, fonctions métier, données du marché pilote de Tulum.
- `migrations/0002_kfit_geo.sql` — PostGIS : zones d'intervention, recherche de coachs dans le rayon du marché, attribution des missions, stockage privé.
- `migrations/0003_kfit_hardening.sql` — durcissement après le linter de sécurité Supabase.
- `migrations/0004` et `0005` — fiches d'exercices par niveau, vidéos brouillon réservées aux administrateurs (Emergent).
- `migrations/0006_coach_onboarding.sql` — dossier coach : pièces obligatoires, envoi d'un dossier complet uniquement, décision motivée de l'équipe.
- `tests/` — scénarios de sécurité joués sur PostgreSQL local (`local_auth_stub.sql` simule le schéma `auth` de Supabase).

## Éléments volontairement désactivés

| Interrupteur (`feature_flags`) | Condition d'activation |
| --- | --- |
| `kfit_club` | Ouverture effective d'un club T7 CORP |
| `coach_subscription` | Validation juridique écrite (art. 291-S LFT) |
| `booking_commission` | Validation par un avocat mexicain |
| `online_payments` | Intégration d'un prestataire de paiement |

La base refuse d'activer la commission, l'abonnement coach ou une configuration
juridique (A/B) sans référence d'avis juridique (`legal_validation_ref`).

## Non intégré à ce stade

Paiement réel, vérification professionnelle (elle est humaine, via l'administration),
notifications push. Aucune de ces fonctions n'est simulée.
