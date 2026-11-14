# KFIT — Inscription et connexion (Supabase Auth)

## Ce qui est opérationnel

- Inscription par e-mail et mot de passe (prénom et langue enregistrés dans le profil).
- Connexion, déconnexion, session conservée entre deux ouvertures de l'application.
- Renouvellement automatique du jeton ; session rangée dans le trousseau sécurisé du téléphone.
- Tout nouvel inscrit a le rôle `client`. Le rôle ne peut pas être choisi ni modifié depuis l'application.
- Messages d'erreur traduits (FR / EN / ES).
- Transition : l'ancien serveur FastAPI accepte le jeton Supabase, donc les écrans existants
  (programmes, coach IA, nutrition, progrès, réservations) continuent de fonctionner.
  Un ancien compte est rattaché automatiquement si l'e-mail est le même **et confirmé**.

## Ce qui n'est pas intégré (rien n'est simulé)

| Élément | Ce qu'il faut |
| --- | --- |
| Envoi d'e-mails en production | Un fournisseur SMTP (ex. Resend, Brevo, SES) à brancher dans Supabase. Le service d'e-mail intégré de Supabase est limité à quelques messages par heure et réservé aux tests. |
| Page d'arrivée du lien de confirmation | Une adresse de redirection (site KFIT ou lien profond `kfit://`) à déclarer dans Supabase → Authentication → URL Configuration. Sans elle, le lien confirme bien le compte mais affiche une page vide. |
| Mot de passe oublié | Dépend des deux points ci-dessus (e-mail + page de saisie du nouveau mot de passe). |
| Connexion Google / Apple | Identifiants OAuth à créer chez Google et Apple, puis à saisir dans Supabase. Le bouton Google du prototype (service Emergent) a été retiré. |

## État des tests

- Base de données : création automatique du profil à l'inscription et règles de sécurité testées sur le projet Supabase.
- Application : le code a été vérifié syntaxiquement, mais **n'a pas encore été exécuté sur un téléphone**
  (l'environnement de développement utilisé ne peut ni installer les dépendances ni lancer Expo).
  À faire au premier lancement : `yarn install` dans `frontend/`, puis tester inscription, confirmation, connexion, déconnexion.

## Fichiers

- `frontend/src/supabase.ts` — client Supabase et stockage sécurisé de la session.
- `frontend/src/auth.tsx` — état de connexion, inscription, connexion, profil.
- `frontend/src/api.ts` — les appels à l'ancien serveur envoient le jeton Supabase.
- `frontend/app/login.tsx` — écran de connexion / inscription / « vérifie ta boîte mail ».
- `backend/server.py` — `supabase_user_id()` : vérification du jeton auprès de Supabase.
