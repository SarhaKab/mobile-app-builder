# KFIT ON DEMAND — phase 3

## Étape 1 — inscription et vérification des coachs (16/11/2026)

### Parcours coach (`frontend/app/pro/`)
1. Profil → « Devenir coach KFIT » : présentation des libertés du coach, puis ouverture du dossier (`start_coach_registration`).
2. Quatre étapes, dans l'ordre que le coach veut :
   - **Profil et tarif** (`pro/profile`) — nom public, présentation, spécialités, expérience, tarif horaire plafonné par le marché.
   - **Disponibilités** (`pro/availability`) — créneaux hebdomadaires libres, sans minimum.
   - **Zone d'intervention** (`pro/area`) — centre + rayon ; la position n'est lue qu'une fois, à la demande.
   - **Justificatifs** (`pro/documents`) — PDF ou photo, 10 Mo max, stockage privé.
3. Envoi du dossier : la base refuse un dossier incomplet.
4. Après décision : pause/reprise libre pour un coach validé ; recours écrit après un refus ou une suspension.

### Parcours équipe KFIT (`frontend/app/admin/coaches`, `admin/coach`)
- File des dossiers par état, ouverture de chaque pièce (lien valable 5 minutes), approbation ou refus pièce par pièce.
- Décision : valider, demander des pièces, refuser, suspendre. Motif écrit obligatoire sauf validation.
- Un coach ne peut être validé que si chaque pièce obligatoire est approuvée.
- Chaque décision est journalisée (`audit_logs`) et notifiée au coach (`notifications`).

### Règles garanties par la base (migration `0006_coach_onboarding.sql`)
Testées sur le projet Supabase : dossier incomplet refusé à l'envoi ; un coach ne peut ni s'approuver ni approuver ses pièces ;
validation impossible tant que les pièces ne sont pas approuvées ; refus sans motif impossible ; tarif au-dessus du plafond refusé.

### Pièces
Obligatoires pour tous : pièce d'identité, photo professionnelle, CV, diplôme ou certification, assurance RC professionnelle.
Selon le régime et les activités (réclamées au cas par cas) : justificatif d'activité indépendante, RFC, premiers secours, qualifications spécifiques.
**À valider par l'avocat mexicain** : cette répartition obligatoire / conditionnelle.

### Non intégré (rien n'est simulé)
- Vérification automatique des diplômes ou de l'identité : la vérification est humaine.
- Notifications push : la décision est enregistrée dans `notifications`, mais aucun message n'est poussé sur le téléphone.
- Reconnaissance des diplômes étrangers : à traiter par l'équipe selon les règles mexicaines.

### État des tests
- Base : scénarios joués sur le projet Supabase (voir ci-dessus).
- Application : code vérifié syntaxiquement et clés de traduction contrôlées ; **pas encore exécuté sur un téléphone**.
  Nouvelles dépendances à installer : `expo-document-picker`, `expo-location` (`yarn install` dans `frontend/`).

## Étapes suivantes
2. Recherche de coachs à proximité et fiche publique du coach (côté client).
3. Demande de séance, proposition aux coachs éligibles, acceptation ou refus, réservation.
4. Suivi de séance (début, fin), annulation, incidents, évaluations.
5. Paiement : dépend du prestataire de paiement et de la validation juridique.
