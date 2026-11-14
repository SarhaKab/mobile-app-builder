-- KFIT — durcissement après passage du linter de sécurité Supabase.

alter function is_trusted_context() set search_path = public;
alter function guard_booking_price() set search_path = public;

-- Le statut de consentement d'un utilisateur n'est consultable que par lui-même
-- (ou par le serveur).
create or replace function has_consent(p_user uuid, p_purpose text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select granted from consents
                   where user_id = p_user and purpose = p_purpose
                     and (p_user = auth.uid() or auth.uid() is null)
                   order by created_at desc limit 1), false);
$$;

-- Les fonctions de déclencheur ne sont jamais appelées directement par l'application.
revoke execute on function
  audit_row(), audit_sensitive_changes(), guard_review(), handle_new_auth_user(),
  refresh_coach_rating(), guard_users(), guard_coach_profile(), guard_review_fields(),
  guard_ticket(), guard_booking_price(), require_health_consent()
from authenticated, anon, public;

-- Le service d'authentification Supabase déclenche la création du profil à l'inscription.
grant execute on function public.handle_new_auth_user() to supabase_auth_admin;
