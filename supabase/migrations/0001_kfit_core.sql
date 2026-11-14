-- =====================================================================
-- KFIT — Architecture de données (Phase 1) — socle
-- Propriété exclusive de T7 CORP.
--
-- Principes appliqués (cahier des charges) :
--  * Aucun prix, devise, taxe ou rayon codé en dur : tout vit dans `markets`,
--    `subscription_plans`, `platform_fees` et `feature_flags`.
--  * Commission KFIT et abonnement coach : présents mais DÉSACTIVÉS, et
--    impossibles à activer sans référence de validation juridique écrite.
--  * Un coach n'est visible et réservable qu'après validation humaine.
--  * Refuser une mission n'a aucune conséquence (ni pénalité, ni déclassement).
--  * Les paiements ne sont écrits que par le serveur (service role) : aucune
--    écriture possible depuis l'application tant qu'un prestataire n'est pas intégré.
--  * RLS activée sur toutes les tables ; rôles : client, coach, support, admin.
-- =====================================================================

create extension if not exists btree_gist;

-- ---------------------------------------------------------------- types
create type user_role          as enum ('client', 'coach', 'support', 'admin');
create type coach_status       as enum ('registration_in_progress', 'documents_missing',
                                        'under_review', 'approved', 'rejected', 'suspended');
create type document_type      as enum ('identity', 'professional_photo', 'cv', 'diploma',
                                        'qualification', 'independent_status_proof',
                                        'tax_rfc', 'liability_insurance', 'first_aid');
create type review_state       as enum ('pending', 'approved', 'rejected');
create type request_status     as enum ('open', 'matched', 'cancelled', 'expired');
create type offer_status       as enum ('offered', 'accepted', 'declined', 'expired', 'withdrawn');
create type booking_status     as enum ('confirmed', 'in_progress', 'completed',
                                        'cancelled_by_client', 'cancelled_by_coach',
                                        'cancelled_by_admin', 'no_show', 'disputed');
create type payment_status     as enum ('pending', 'authorized', 'captured', 'refunded',
                                        'partially_refunded', 'failed', 'cancelled');
create type payout_status      as enum ('pending', 'processing', 'paid', 'failed', 'on_hold');
create type subscription_status as enum ('trialing', 'active', 'past_due', 'cancelled', 'expired');
create type plan_audience      as enum ('client', 'coach');
create type legal_config       as enum ('undetermined', 'A_independent_contractor', 'B_platform_worker');
create type ticket_status      as enum ('open', 'in_review', 'resolved', 'rejected');
create type fitness_level      as enum ('beginner', 'intermediate', 'advanced');
create type fitness_goal       as enum ('weight_loss', 'muscle_gain', 'strengthening',
                                        'cardio', 'mobility', 'fitness_recovery');

-- ---------------------------------------------------------------- marchés et configuration
create table markets (
  code                    text primary key,                 -- ex. 'mx-tulum'
  name                    text not null,
  country_code            char(2) not null,
  currency                char(3) not null,                 -- devise de référence
  display_currencies      char(3)[] not null default '{}',  -- ex. {USD,MXN}
  timezone                text not null,                    -- IANA
  search_radius_km        numeric(5,1) not null check (search_radius_km > 0),
  max_hourly_rate_cents   integer not null check (max_hourly_rate_cents > 0),
  min_hourly_rate_cents   integer check (min_hourly_rate_cents >= 0), -- « reste à définir »
  legal_configuration     legal_config not null default 'undetermined',
  legal_validation_ref    text,                             -- référence de l'avis écrit de l'avocat
  tax_rules               jsonb not null default '{}',
  is_active               boolean not null default false,
  created_at              timestamptz not null default now(),
  check (min_hourly_rate_cents is null or min_hourly_rate_cents <= max_hourly_rate_cents),
  -- On ne choisit pas une configuration juridique sans avis écrit.
  check (legal_configuration = 'undetermined' or legal_validation_ref is not null)
);

create table feature_flags (
  key          text not null,
  market_code  text references markets(code) on delete cascade,
  enabled      boolean not null default false,
  description  text,
  updated_by   uuid,
  updated_at   timestamptz not null default now()
);
create unique index feature_flags_key_market on feature_flags (key, coalesce(market_code, '*'));

-- ---------------------------------------------------------------- utilisateurs et rôles
create table users (
  id           uuid primary key references auth.users(id) on delete cascade,
  role         user_role not null default 'client',
  full_name    text not null default '' check (char_length(full_name) <= 80),
  avatar_path  text,
  lang         text not null default 'fr' check (lang in ('fr', 'en', 'es')),
  market_code  text references markets(code),
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz                                  -- demande de suppression de compte
);

create or replace function current_role_kfit() returns user_role
language sql stable security definer set search_path = public as $$
  select role from users where id = auth.uid();
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from users where id = auth.uid()), false);
$$;

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin', 'support') from users where id = auth.uid()), false);
$$;

-- Contexte de confiance : service role, tâches serveur, ou fonction métier KFIT
-- (security definer). Faux pour toute écriture directe venant de l'application.
-- Les déclencheurs de contrôle qui l'utilisent s'exécutent avec les droits de
-- l'appelant (pas de security definer), sinon ce test serait toujours vrai.
create or replace function is_trusted_context() returns boolean
language sql stable as $$
  select current_user not in ('authenticated', 'anon');
$$;

-- Tout nouvel inscrit est « client ». Le rôle n'est jamais lu depuis les métadonnées
-- fournies par l'application : personne ne peut s'auto-déclarer coach validé ou admin.
create or replace function handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into users (id, full_name, lang)
  values (new.id,
          left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 80),
          case when new.raw_user_meta_data ->> 'lang' in ('fr', 'en', 'es')
               then new.raw_user_meta_data ->> 'lang' else 'fr' end)
  on conflict (id) do nothing;
  insert into client_profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create or replace function guard_users() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.id <> old.id then raise exception 'id is immutable'; end if;
  if new.role is distinct from old.role and not (is_admin() or is_trusted_context()) then
    raise exception 'role change not allowed';
  end if;
  return new;
end $$;
create trigger users_guard before update on users for each row execute function guard_users();

-- ---------------------------------------------------------------- espace client
create table client_profiles (
  user_id      uuid primary key references users(id) on delete cascade,
  goals        fitness_goal[] not null default '{}',
  level        fitness_level,
  preferences  jsonb not null default '{}',
  updated_at   timestamptz not null default now()
);

-- Consentements explicites (données de santé, géolocalisation, CGU…), horodatés et versionnés.
create table consents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  purpose      text not null check (purpose in ('health_data', 'geolocation', 'terms',
                                                'privacy_policy', 'marketing', 'ai_assistant')),
  version      text not null,
  granted      boolean not null,
  created_at   timestamptz not null default now()
);
create index consents_user on consents (user_id, purpose, created_at desc);

create or replace function has_consent(p_user uuid, p_purpose text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select granted from consents
                   where user_id = p_user and purpose = p_purpose
                   order by created_at desc limit 1), false);
$$;

-- Données sensibles (santé, allergies, nutrition) : table séparée, jamais lisible par
-- les coachs ni par le support ; écriture refusée sans consentement « health_data ».
create table client_health_data (
  user_id             uuid primary key references users(id) on delete cascade,
  allergies           text[] not null default '{}',
  dietary_preferences text[] not null default '{}',
  height_cm           numeric(5,1) check (height_cm between 100 and 250),
  birth_year          integer check (birth_year between 1900 and 2100),
  sex                 text check (sex in ('male', 'female', 'unspecified')),
  activity_level      text check (activity_level in ('low', 'moderate', 'high')),
  notes               text check (char_length(notes) <= 1000),
  updated_at          timestamptz not null default now()
);

create table progress_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  measured_at timestamptz not null default now(),
  weight_kg   numeric(5,1) check (weight_kg between 20 and 400),
  body_fat_pct numeric(4,1) check (body_fat_pct between 2 and 70),
  note        text check (char_length(note) <= 200)
);
create index progress_user on progress_entries (user_id, measured_at desc);

create or replace function require_health_consent() returns trigger
language plpgsql set search_path = public as $$
begin
  if not is_trusted_context() and not has_consent(new.user_id, 'health_data') then
    raise exception 'health data consent required';
  end if;
  return new;
end $$;
create trigger health_consent before insert or update on client_health_data
  for each row execute function require_health_consent();
create trigger progress_consent before insert or update on progress_entries
  for each row execute function require_health_consent();

-- ---------------------------------------------------------------- coachs
create table coach_profiles (
  user_id             uuid primary key references users(id) on delete cascade,
  market_code         text not null references markets(code),
  display_name        text not null default '' check (char_length(display_name) <= 80),
  headline            text check (char_length(headline) <= 140),
  bio                 text check (char_length(bio) <= 2000),
  photo_path          text,
  specialties         text[] not null default '{}',
  experience_years    integer check (experience_years between 0 and 70),
  experience_summary  text check (char_length(experience_summary) <= 2000),
  hourly_rate_cents   integer check (hourly_rate_cents > 0),
  currency            char(3),
  status              coach_status not null default 'registration_in_progress',
  status_reason       text,
  verified_at         timestamptz,
  verified_by         uuid references users(id),
  is_paused           boolean not null default false,       -- suspension volontaire par le coach
  sessions_completed  integer not null default 0,
  rating_avg          numeric(3,2),
  rating_count        integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index coach_profiles_listing on coach_profiles (market_code, status) where status = 'approved';

create or replace function market_rate_bounds(p_market text,
  out max_cents integer, out min_cents integer, out currency char(3))
language sql stable security definer set search_path = public as $$
  select max_hourly_rate_cents, min_hourly_rate_cents, currency from markets where code = p_market;
$$;

create or replace function guard_coach_profile() returns trigger
language plpgsql set search_path = public as $$
declare m record;
begin
  select * into m from market_rate_bounds(new.market_code);
  if m.max_cents is null then raise exception 'unknown market'; end if;
  if new.hourly_rate_cents is not null then
    if new.hourly_rate_cents > m.max_cents then
      raise exception 'hourly rate above market maximum (%)', m.max_cents;
    end if;
    if m.min_cents is not null and new.hourly_rate_cents < m.min_cents then
      raise exception 'hourly rate below market minimum (%)', m.min_cents;
    end if;
    new.currency := m.currency;
  end if;
  if tg_op = 'UPDATE' and not (is_staff() or is_trusted_context()) then
    -- Le coach gère librement son profil, son tarif et sa pause ; il ne peut pas
    -- se valider lui-même ni modifier ses statistiques.
    if new.status is distinct from old.status
       and not (old.status in ('registration_in_progress', 'documents_missing')
                and new.status = 'under_review') then
      raise exception 'status can only be changed by KFIT staff';
    end if;
    if (new.verified_at, new.verified_by, new.sessions_completed, new.rating_avg,
        new.rating_count, new.market_code, new.status_reason)
       is distinct from
       (old.verified_at, old.verified_by, old.sessions_completed, old.rating_avg,
        old.rating_count, old.market_code, old.status_reason) then
      raise exception 'protected coach fields cannot be modified';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger coach_profile_guard before insert or update on coach_profiles
  for each row execute function guard_coach_profile();

-- Passage client -> coach : crée un dossier « inscription en cours ». Aucune réservation
-- possible avant validation humaine.
create or replace function start_coach_registration(p_market text) returns coach_status
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if (select role from users where id = auth.uid()) not in ('client', 'coach') then
    raise exception 'staff accounts cannot register as coach';
  end if;
  if not exists (select 1 from markets where code = p_market and is_active) then
    raise exception 'unknown or inactive market';
  end if;
  update users set role = 'coach', market_code = p_market where id = auth.uid();
  insert into coach_profiles (user_id, market_code, display_name)
  select id, p_market, full_name from users where id = auth.uid()
  on conflict (user_id) do nothing;
  return (select status from coach_profiles where user_id = auth.uid());
end $$;

create table coach_documents (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null references coach_profiles(user_id) on delete cascade,
  type          document_type not null,
  storage_path  text not null,            -- bucket privé « coach-documents »
  issued_country char(2),
  expires_on    date,
  state         review_state not null default 'pending',
  reviewed_by   uuid references users(id),
  reviewed_at   timestamptz,
  review_note   text,
  created_at    timestamptz not null default now()
);
create index coach_documents_coach on coach_documents (coach_id, type);

create table coach_qualifications (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null references coach_profiles(user_id) on delete cascade,
  title         text not null check (char_length(title) <= 160),
  issuer        text check (char_length(issuer) <= 160),
  country_code  char(2),
  obtained_on   date,
  document_id   uuid references coach_documents(id) on delete set null,
  state         review_state not null default 'pending',   -- « vérifié » = approved
  reviewed_by   uuid references users(id),
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index coach_qualifications_coach on coach_qualifications (coach_id);

-- Seul le staff peut statuer sur un document ou une qualification.
create or replace function guard_review_fields() returns trigger
language plpgsql set search_path = public as $$
begin
  if is_staff() or is_trusted_context() then return new; end if;
  if tg_op = 'INSERT' then
    new.state := 'pending'; new.reviewed_by := null; new.reviewed_at := null;
  elsif (new.state, new.reviewed_by, new.reviewed_at) is distinct from
        (old.state, old.reviewed_by, old.reviewed_at) then
    raise exception 'review fields can only be changed by KFIT staff';
  end if;
  return new;
end $$;
create trigger coach_documents_guard before insert or update on coach_documents
  for each row execute function guard_review_fields();
create trigger coach_qualifications_guard before insert or update on coach_qualifications
  for each row execute function guard_review_fields();

-- Disponibilités : déclarées librement par le coach, sans volume minimum.
create table coach_availability (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references coach_profiles(user_id) on delete cascade,
  weekday     smallint not null check (weekday between 0 and 6),   -- 0 = dimanche
  start_time  time not null,
  end_time    time not null,
  check (end_time > start_time)
);
create index coach_availability_coach on coach_availability (coach_id, weekday);

-- Zone d'intervention : la géométrie (PostGIS) est ajoutée par la migration 0002.
create table coach_service_areas (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references coach_profiles(user_id) on delete cascade,
  label       text check (char_length(label) <= 120),
  radius_km   numeric(5,1) not null check (radius_km > 0 and radius_km <= 100),
  created_at  timestamptz not null default now()
);
create index coach_service_areas_coach on coach_service_areas (coach_id);

-- ---------------------------------------------------------------- KFIT HOME (contenus administrables)
create table program_categories (
  id        uuid primary key default gen_random_uuid(),
  slug      text not null unique,
  title     jsonb not null,                -- {"fr": "...", "en": "...", "es": "..."}
  goal      fitness_goal,
  position  integer not null default 0
);

create table programs (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  title         jsonb not null,
  description   jsonb not null default '{}',
  category_id   uuid references program_categories(id) on delete set null,
  goal          fitness_goal,
  level         fitness_level not null,
  weeks         integer check (weeks > 0),
  cover_path    text,
  coach_id      uuid references coach_profiles(user_id) on delete set null,
  is_premium    boolean not null default false,
  is_published  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table exercises (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          jsonb not null,
  instructions  jsonb not null default '{}',
  muscle_groups text[] not null default '{}',
  equipment     text[] not null default '{}',
  level         fitness_level,
  media_path    text,
  is_published  boolean not null default false
);

create table videos (
  id               uuid primary key default gen_random_uuid(),
  program_id       uuid references programs(id) on delete cascade,
  position         integer not null default 0,
  title            jsonb not null,
  description      jsonb not null default '{}',
  storage_path     text,                   -- bucket privé, accès par URL signée
  duration_seconds integer check (duration_seconds > 0),
  level            fitness_level,
  goal             fitness_goal,
  coach_id         uuid references coach_profiles(user_id) on delete set null,
  is_premium       boolean not null default false,
  is_published     boolean not null default false,
  created_at       timestamptz not null default now()
);
create index videos_program on videos (program_id, position);

create table video_exercises (
  video_id    uuid not null references videos(id) on delete cascade,
  exercise_id uuid not null references exercises(id) on delete cascade,
  position    integer not null default 0,
  sets        integer,
  reps        text,
  primary key (video_id, exercise_id)
);

create table program_enrollments (
  user_id     uuid not null references users(id) on delete cascade,
  program_id  uuid not null references programs(id) on delete cascade,
  started_at  timestamptz not null default now(),
  primary key (user_id, program_id)
);

create table workout_history (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  video_id      uuid references videos(id) on delete set null,
  program_id    uuid references programs(id) on delete set null,
  completed_at  timestamptz not null default now(),
  minutes       integer check (minutes > 0)
);
create index workout_history_user on workout_history (user_id, completed_at desc);

create table favorites (
  user_id     uuid not null references users(id) on delete cascade,
  item_type   text not null check (item_type in ('program', 'video', 'exercise', 'coach', 'recipe')),
  item_id     uuid not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, item_type, item_id)
);

-- ---------------------------------------------------------------- KFIT AI
create table recipes (
  id            uuid primary key default gen_random_uuid(),
  title         jsonb not null,
  ingredients   jsonb not null default '[]',
  steps         jsonb not null default '[]',
  allergens     text[] not null default '{}',
  diet_tags     text[] not null default '{}',
  calories      integer,
  macros        jsonb not null default '{}',
  is_published  boolean not null default false
);

create table nutrition_plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  input       jsonb not null default '{}',
  plan        jsonb not null,
  disclaimer_version text not null,        -- avertissement « pas un avis médical » affiché
  model       text,
  created_at  timestamptz not null default now()
);
create index nutrition_plans_user on nutrition_plans (user_id, created_at desc);
create trigger nutrition_consent before insert on nutrition_plans
  for each row execute function require_health_consent();

create table ai_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null check (char_length(content) <= 8000),
  created_at  timestamptz not null default now()
);
create index ai_messages_user on ai_messages (user_id, created_at);

-- ---------------------------------------------------------------- KFIT ON DEMAND
create table service_requests (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references users(id) on delete cascade,
  market_code       text not null references markets(code),
  preferred_coach_id uuid references coach_profiles(user_id) on delete set null,
  specialty         text,
  goal_note         text check (char_length(goal_note) <= 500),
  starts_at         timestamptz not null,
  duration_minutes  integer not null check (duration_minutes between 30 and 480
                                            and duration_minutes % 30 = 0),
  address_text      text check (char_length(address_text) <= 300),
  status            request_status not null default 'open',
  created_at        timestamptz not null default now(),
  check (starts_at > created_at)
);
create index service_requests_client on service_requests (client_id, created_at desc);

-- Proposition d'une mission à un coach éligible. « declined » est un état neutre :
-- aucune colonne, aucun compteur et aucun classement ne dépend des refus.
create table mission_offers (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references service_requests(id) on delete cascade,
  coach_id      uuid not null references coach_profiles(user_id) on delete cascade,
  status        offer_status not null default 'offered',
  policy_version integer,                  -- version des critères d'attribution appliqués
  distance_km   numeric(6,2),
  offered_at    timestamptz not null default now(),
  responded_at  timestamptz,
  expires_at    timestamptz,
  unique (request_id, coach_id)
);
create index mission_offers_coach on mission_offers (coach_id, status);

create table bookings (
  id                 uuid primary key default gen_random_uuid(),
  request_id         uuid unique references service_requests(id) on delete set null,
  client_id          uuid not null references users(id),
  coach_id           uuid not null references coach_profiles(user_id),
  market_code        text not null references markets(code),
  starts_at          timestamptz not null,
  ends_at            timestamptz not null,
  duration_minutes   integer not null,
  -- Tarif figé à la confirmation : une modification ultérieure du tarif du coach
  -- ne touche jamais une réservation existante.
  hourly_rate_cents  integer not null,
  currency           char(3) not null,
  session_price_cents integer not null,
  status             booking_status not null default 'confirmed',
  cancel_reason      text,
  cancelled_at       timestamptz,
  created_at         timestamptz not null default now(),
  check (ends_at > starts_at),
  -- Un coach ne peut pas avoir deux séances actives qui se chevauchent.
  constraint bookings_no_overlap exclude using gist
    (coach_id with =, tstzrange(starts_at, ends_at) with &&)
    where (status in ('confirmed', 'in_progress'))
);
create index bookings_client on bookings (client_id, starts_at desc);
create index bookings_coach on bookings (coach_id, starts_at desc);

create or replace function guard_booking_price() returns trigger
language plpgsql as $$
begin
  if (new.hourly_rate_cents, new.currency, new.session_price_cents, new.client_id, new.coach_id)
     is distinct from
     (old.hourly_rate_cents, old.currency, old.session_price_cents, old.client_id, old.coach_id) then
    raise exception 'booking price and parties are immutable once confirmed';
  end if;
  return new;
end $$;
create trigger bookings_price_guard before update on bookings
  for each row execute function guard_booking_price();

create or replace function is_booking_party(p_booking uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from bookings
                 where id = p_booking and auth.uid() in (client_id, coach_id));
$$;

create or replace function shares_booking_with(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from bookings
                 where (client_id = auth.uid() and coach_id = p_user)
                    or (coach_id = auth.uid() and client_id = p_user));
$$;

create or replace function owns_request(p_request uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from service_requests where id = p_request and client_id = auth.uid());
$$;

create or replace function has_offer_for(p_request uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from mission_offers where request_id = p_request and coach_id = auth.uid());
$$;

-- Réponse du coach à une mission. Accepter crée la réservation (tarif figé) ;
-- refuser ne fait rien d'autre que clore la proposition.
create or replace function respond_to_offer(p_offer uuid, p_accept boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare o mission_offers; r service_requests; c coach_profiles; v_booking uuid;
begin
  select * into o from mission_offers where id = p_offer for update;
  if o.id is null or o.coach_id <> auth.uid() then raise exception 'offer not found'; end if;
  if o.status <> 'offered' then raise exception 'offer already answered'; end if;
  if o.expires_at is not null and o.expires_at < now() then
    update mission_offers set status = 'expired' where id = o.id;
    raise exception 'offer expired';
  end if;

  if not p_accept then
    update mission_offers set status = 'declined', responded_at = now() where id = o.id;
    return null;
  end if;

  select * into r from service_requests where id = o.request_id for update;
  if r.status <> 'open' then raise exception 'request no longer available'; end if;
  select * into c from coach_profiles where user_id = o.coach_id;
  if c.status <> 'approved' or c.is_paused or c.hourly_rate_cents is null then
    raise exception 'coach profile is not bookable';
  end if;

  insert into bookings (request_id, client_id, coach_id, market_code, starts_at, ends_at,
                        duration_minutes, hourly_rate_cents, currency, session_price_cents)
  values (r.id, r.client_id, c.user_id, r.market_code, r.starts_at,
          r.starts_at + make_interval(mins => r.duration_minutes), r.duration_minutes,
          c.hourly_rate_cents, c.currency,
          round(c.hourly_rate_cents * r.duration_minutes / 60.0)::integer)
  returning id into v_booking;

  update mission_offers set status = 'accepted', responded_at = now() where id = o.id;
  update mission_offers set status = 'withdrawn'
   where request_id = r.id and id <> o.id and status = 'offered';
  update service_requests set status = 'matched' where id = r.id;
  insert into session_tracking (booking_id) values (v_booking);
  insert into notifications (user_id, kind, payload)
  values (r.client_id, 'booking_confirmed', jsonb_build_object('booking_id', v_booking));
  return v_booking;
end $$;

create or replace function cancel_booking(p_booking uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  select * into b from bookings where id = p_booking for update;
  if b.id is null or not (auth.uid() in (b.client_id, b.coach_id) or is_staff()) then
    raise exception 'booking not found';
  end if;
  if b.status <> 'confirmed' then raise exception 'booking cannot be cancelled in its current state'; end if;
  update bookings
     set status = case when auth.uid() = b.client_id then 'cancelled_by_client'
                       when auth.uid() = b.coach_id  then 'cancelled_by_coach'
                       else 'cancelled_by_admin' end::booking_status,
         cancel_reason = left(p_reason, 500), cancelled_at = now()
   where id = b.id;
  insert into notifications (user_id, kind, payload)
  select u, 'booking_cancelled', jsonb_build_object('booking_id', b.id)
    from unnest(array[b.client_id, b.coach_id]) u where u is distinct from auth.uid();
end $$;

-- Suivi de séance : confirmations de début et de fin par chaque partie.
-- Pas de suivi permanent : seule une position ponctuelle peut être jointe au
-- pointage (colonnes ajoutées par la migration 0002), jamais de trace continue.
create table session_tracking (
  booking_id            uuid primary key references bookings(id) on delete cascade,
  coach_started_at      timestamptz,
  client_started_at     timestamptz,
  coach_ended_at        timestamptz,
  client_ended_at       timestamptz,
  effective_minutes     integer
);

create table work_time_records (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null references coach_profiles(user_id) on delete cascade,
  booking_id    uuid unique references bookings(id) on delete set null,
  started_at    timestamptz not null,
  ended_at      timestamptz not null,
  minutes       integer not null check (minutes >= 0),
  created_at    timestamptz not null default now()
);
create index work_time_coach on work_time_records (coach_id, started_at desc);

create or replace function confirm_session(p_booking uuid, p_phase text) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings; t session_tracking; v_start timestamptz; v_end timestamptz;
begin
  select * into b from bookings where id = p_booking for update;
  if b.id is null or auth.uid() not in (b.client_id, b.coach_id) then
    raise exception 'booking not found';
  end if;
  if p_phase = 'start' then
    if b.status not in ('confirmed', 'in_progress') then raise exception 'invalid booking state'; end if;
    if auth.uid() = b.coach_id then
      update session_tracking set coach_started_at = coalesce(coach_started_at, now()) where booking_id = b.id;
    else
      update session_tracking set client_started_at = coalesce(client_started_at, now()) where booking_id = b.id;
    end if;
    update bookings set status = 'in_progress' where id = b.id and status = 'confirmed';
  elsif p_phase = 'end' then
    if b.status <> 'in_progress' then raise exception 'session has not started'; end if;
    if auth.uid() = b.coach_id then
      update session_tracking set coach_ended_at = coalesce(coach_ended_at, now()) where booking_id = b.id;
    else
      update session_tracking set client_ended_at = coalesce(client_ended_at, now()) where booking_id = b.id;
    end if;
    select * into t from session_tracking where booking_id = b.id;
    if t.coach_ended_at is not null and t.client_ended_at is not null then
      v_start := least(coalesce(t.coach_started_at, t.client_started_at),
                       coalesce(t.client_started_at, t.coach_started_at));
      v_end   := least(t.coach_ended_at, t.client_ended_at);
      update session_tracking
         set effective_minutes = greatest(0, round(extract(epoch from (v_end - v_start)) / 60))::integer
       where booking_id = b.id;
      update bookings set status = 'completed' where id = b.id;
      insert into work_time_records (coach_id, booking_id, started_at, ended_at, minutes)
      values (b.coach_id, b.id, v_start, v_end,
              greatest(0, round(extract(epoch from (v_end - v_start)) / 60))::integer)
      on conflict (booking_id) do nothing;
      update coach_profiles set sessions_completed = sessions_completed + 1 where user_id = b.coach_id;
    end if;
  else
    raise exception 'phase must be start or end';
  end if;
end $$;

create table booking_messages (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references bookings(id) on delete cascade,
  sender_id   uuid not null references users(id),
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index booking_messages_booking on booking_messages (booking_id, created_at);

create table reviews (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null unique references bookings(id) on delete cascade,
  client_id   uuid not null references users(id),
  coach_id    uuid not null references coach_profiles(user_id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  comment     text check (char_length(comment) <= 1000),
  is_hidden   boolean not null default false,              -- modération par le staff
  created_at  timestamptz not null default now()
);
create index reviews_coach on reviews (coach_id, created_at desc);

create or replace function guard_review() returns trigger
language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  select * into b from bookings where id = new.booking_id;
  if b.id is null or b.status <> 'completed' or b.client_id <> new.client_id then
    raise exception 'a review requires a completed booking of your own';
  end if;
  new.coach_id := b.coach_id;
  if not is_staff() then new.is_hidden := false; end if;
  return new;
end $$;
create trigger reviews_guard before insert on reviews for each row execute function guard_review();

-- La note moyenne reflète uniquement les avis clients sur des séances réalisées.
create or replace function refresh_coach_rating() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_coach uuid := coalesce(new.coach_id, old.coach_id);
begin
  update coach_profiles c
     set rating_avg = s.avg, rating_count = s.n
    from (select round(avg(rating), 2) as avg, count(*)::integer as n
            from reviews where coach_id = v_coach and not is_hidden) s
   where c.user_id = v_coach;
  return null;
end $$;
create trigger reviews_rating after insert or update or delete on reviews
  for each row execute function refresh_coach_rating();

-- ---------------------------------------------------------------- abonnements et finances
create table subscription_plans (
  id                   uuid primary key default gen_random_uuid(),
  market_code          text not null references markets(code),
  audience             plan_audience not null,
  name                 text not null,
  price_cents          integer not null check (price_cents >= 0),
  currency             char(3) not null,
  interval_months      integer not null default 1 check (interval_months > 0),
  includes             jsonb not null default '{}',        -- périmètre configurable
  is_active            boolean not null default false,
  legal_validation_ref text,
  created_at           timestamptz not null default now(),
  -- Art. 291-S LFT : pas d'abonnement coach actif sans validation juridique écrite.
  check (not (audience = 'coach' and is_active) or legal_validation_ref is not null)
);

create table subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references users(id) on delete cascade,
  plan_id               uuid not null references subscription_plans(id),
  status                subscription_status not null,
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  cancel_at_period_end  boolean not null default false,
  provider              text,
  provider_subscription_id text,
  created_at            timestamptz not null default now()
);
create index subscriptions_user on subscriptions (user_id, status);

-- Règles de frais de plateforme (commission). Inactives par défaut.
create table platform_fees (
  id                   uuid primary key default gen_random_uuid(),
  market_code          text not null references markets(code),
  kind                 text not null check (kind in ('booking_commission', 'client_service_fee')),
  rate_bps             integer not null check (rate_bps between 0 and 10000), -- 1000 = 10 %
  applies_to_config    legal_config not null,
  is_active            boolean not null default false,
  legal_validation_ref text,
  created_at           timestamptz not null default now(),
  check (not is_active or legal_validation_ref is not null),
  -- Jamais de retenue automatique sur un coach relevant du régime salarié des plateformes.
  check (not (is_active and kind = 'booking_commission'
              and applies_to_config = 'B_platform_worker'))
);

create table payments (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references users(id),
  booking_id          uuid references bookings(id) on delete set null,
  subscription_id     uuid references subscriptions(id) on delete set null,
  amount_cents        integer not null check (amount_cents >= 0),
  currency            char(3) not null,
  status              payment_status not null default 'pending',
  provider            text not null,
  provider_payment_id text,                -- jamais de numéro de carte ici
  refunded_cents      integer not null default 0,
  created_at          timestamptz not null default now(),
  check ((booking_id is not null) <> (subscription_id is not null))
);
create index payments_user on payments (user_id, created_at desc);

-- Décomposition financière d'une séance (prix client / dû au coach / frais / taxes…).
create table earnings (
  id                    uuid primary key default gen_random_uuid(),
  booking_id            uuid not null unique references bookings(id),
  coach_id              uuid not null references coach_profiles(user_id),
  currency              char(3) not null,
  client_price_cents    integer not null,
  coach_gross_cents     integer not null,
  platform_fee_cents    integer not null default 0,
  payment_fee_cents     integer not null default 0,
  tax_cents             integer not null default 0,
  social_charges_cents  integer not null default 0,
  coach_net_cents       integer not null,
  platform_fee_id       uuid references platform_fees(id),
  payout_id             uuid,
  created_at            timestamptz not null default now()
);
create index earnings_coach on earnings (coach_id, created_at desc);

create table payouts (
  id                  uuid primary key default gen_random_uuid(),
  coach_id            uuid not null references coach_profiles(user_id),
  amount_cents        integer not null check (amount_cents >= 0),
  currency            char(3) not null,
  status              payout_status not null default 'pending',
  provider            text,
  provider_payout_id  text,
  period_start        date,
  period_end          date,
  created_at          timestamptz not null default now()
);
alter table earnings add constraint earnings_payout_fk
  foreign key (payout_id) references payouts(id) on delete set null;

-- ---------------------------------------------------------------- support, conformité, audit
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  kind        text not null,
  payload     jsonb not null default '{}',
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user on notifications (user_id, created_at desc);

create table incidents (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid references bookings(id) on delete set null,
  reporter_id  uuid not null references users(id),
  category     text not null check (category in ('safety', 'no_show', 'behaviour', 'injury',
                                                 'payment', 'other')),
  description  text not null check (char_length(description) between 1 and 4000),
  status       ticket_status not null default 'open',
  handled_by   uuid references users(id),
  resolution   text,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

-- Réclamations et recours (y compris contre une suspension ou un refus de compte) :
-- toujours examinés par un humain.
create table complaints (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid not null references users(id),
  kind         text not null check (kind in ('complaint', 'refund_request',
                                             'appeal_account_decision', 'data_request')),
  booking_id   uuid references bookings(id) on delete set null,
  description  text not null check (char_length(description) between 1 and 4000),
  status       ticket_status not null default 'open',
  handled_by   uuid references users(id),
  resolution   text,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

create or replace function guard_ticket() returns trigger
language plpgsql set search_path = public as $$
begin
  if is_staff() or is_trusted_context() then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'open'; new.handled_by := null; new.resolution := null; new.resolved_at := null;
    return new;
  end if;
  raise exception 'tickets can only be updated by KFIT staff';
end $$;
create trigger incidents_guard before insert or update on incidents
  for each row execute function guard_ticket();
create trigger complaints_guard before insert or update on complaints
  for each row execute function guard_ticket();

create table worker_classifications (
  id                   uuid primary key default gen_random_uuid(),
  coach_id             uuid not null references coach_profiles(user_id) on delete cascade,
  market_code          text not null references markets(code),
  configuration        legal_config not null,
  basis                text not null,      -- éléments de fait justifiant la qualification
  legal_validation_ref text not null,      -- jamais de classification sans avis écrit
  effective_from       date not null,
  effective_to         date,
  decided_by           uuid references users(id),
  created_at           timestamptz not null default now()
);
create index worker_classifications_coach on worker_classifications (coach_id, effective_from desc);

-- Critères d'attribution des missions : versionnés et publiés (transparence).
create table algorithm_policies (
  version       integer primary key,
  market_code   text references markets(code),
  criteria      jsonb not null,            -- critères réellement utilisés par le code
  description   jsonb not null,            -- explication lisible, multilingue
  published_at  timestamptz,
  created_by    uuid references users(id),
  created_at    timestamptz not null default now()
);

create table audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  action      text not null,
  table_name  text,
  row_id      text,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz not null default now()
);
create index audit_logs_table on audit_logs (table_name, row_id, created_at desc);

create or replace function audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
        v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
begin
  insert into audit_logs (actor_id, action, table_name, row_id, old_data, new_data)
  values (auth.uid(), tg_op, tg_table_name,
          coalesce(v_new ->> tg_argv[0], v_old ->> tg_argv[0]), v_old, v_new);
  return coalesce(new, old);
end $$;

create trigger audit_markets after insert or update or delete on markets
  for each row execute function audit_row('code');
create trigger audit_feature_flags after insert or update or delete on feature_flags
  for each row execute function audit_row('key');
create trigger audit_platform_fees after insert or update or delete on platform_fees
  for each row execute function audit_row('id');
create trigger audit_subscription_plans after insert or update or delete on subscription_plans
  for each row execute function audit_row('id');
create trigger audit_worker_classifications after insert or update or delete on worker_classifications
  for each row execute function audit_row('id');
create trigger audit_coach_documents after update or delete on coach_documents
  for each row execute function audit_row('id');
create trigger audit_payouts after insert or update on payouts
  for each row execute function audit_row('id');

create or replace function audit_sensitive_changes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'users' then
    if new.role is distinct from old.role then
      insert into audit_logs (actor_id, action, table_name, row_id, old_data, new_data)
      values (auth.uid(), 'ROLE_CHANGE', 'users', new.id::text,
              jsonb_build_object('role', old.role), jsonb_build_object('role', new.role));
    end if;
  elsif new.status is distinct from old.status then
    insert into audit_logs (actor_id, action, table_name, row_id, old_data, new_data)
    values (auth.uid(), 'COACH_STATUS_CHANGE', 'coach_profiles', new.user_id::text,
            jsonb_build_object('status', old.status),
            jsonb_build_object('status', new.status, 'reason', new.status_reason));
  end if;
  return null;
end $$;
create trigger audit_users_role after update on users
  for each row execute function audit_sensitive_changes();
create trigger audit_coach_status after update on coach_profiles
  for each row execute function audit_sensitive_changes();

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_auth_user();

-- =====================================================================
-- RLS — sécurité par rôle
-- Pas de politique = accès refusé. Les tables financières n'ont aucune politique
-- d'écriture : seul le serveur (service role) peut y écrire.
-- =====================================================================
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- configuration
create policy markets_read on markets for select to authenticated using (is_active or is_staff());
create policy markets_admin on markets for all to authenticated using (is_admin()) with check (is_admin());
create policy flags_read on feature_flags for select to authenticated using (true);
create policy flags_admin on feature_flags for all to authenticated using (is_admin()) with check (is_admin());
create policy algo_read on algorithm_policies for select to authenticated
  using (published_at is not null or is_staff());
create policy algo_admin on algorithm_policies for all to authenticated using (is_admin()) with check (is_admin());

-- utilisateurs
create policy users_read on users for select to authenticated
  using (id = auth.uid() or is_staff() or shares_booking_with(id));
create policy users_update_self on users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy users_admin on users for update to authenticated using (is_admin()) with check (is_admin());

create policy client_profiles_own on client_profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy client_profiles_staff on client_profiles for select to authenticated using (is_staff());

create policy consents_read on consents for select to authenticated using (user_id = auth.uid() or is_admin());
create policy consents_insert on consents for insert to authenticated with check (user_id = auth.uid());

-- données de santé : le titulaire uniquement (ni coach, ni support)
create policy health_own on client_health_data for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy progress_own on progress_entries for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy nutrition_read on nutrition_plans for select to authenticated using (user_id = auth.uid());
create policy nutrition_delete on nutrition_plans for delete to authenticated using (user_id = auth.uid());
create policy ai_messages_read on ai_messages for select to authenticated using (user_id = auth.uid());
create policy ai_messages_delete on ai_messages for delete to authenticated using (user_id = auth.uid());

-- coachs
create policy coach_public_read on coach_profiles for select to authenticated
  using (status = 'approved' or user_id = auth.uid() or is_staff());
create policy coach_update_own on coach_profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy coach_staff_update on coach_profiles for update to authenticated
  using (is_staff()) with check (is_staff());

create policy coach_docs_own on coach_documents for select to authenticated
  using (coach_id = auth.uid() or is_staff());
create policy coach_docs_insert on coach_documents for insert to authenticated
  with check (coach_id = auth.uid());
create policy coach_docs_delete on coach_documents for delete to authenticated
  using (coach_id = auth.uid() and state = 'pending');
create policy coach_docs_staff on coach_documents for update to authenticated
  using (is_staff()) with check (is_staff());

create policy coach_quals_read on coach_qualifications for select to authenticated
  using (coach_id = auth.uid() or is_staff()
         or (state = 'approved' and exists (select 1 from coach_profiles c
                                             where c.user_id = coach_id and c.status = 'approved')));
create policy coach_quals_write on coach_qualifications for insert to authenticated
  with check (coach_id = auth.uid());
create policy coach_quals_update on coach_qualifications for update to authenticated
  using (coach_id = auth.uid() or is_staff()) with check (coach_id = auth.uid() or is_staff());
create policy coach_quals_delete on coach_qualifications for delete to authenticated
  using (coach_id = auth.uid());

create policy availability_read on coach_availability for select to authenticated using (true);
create policy availability_write on coach_availability for all to authenticated
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());
create policy areas_read on coach_service_areas for select to authenticated
  using (coach_id = auth.uid() or is_staff());
create policy areas_write on coach_service_areas for all to authenticated
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());

-- contenus KFIT HOME : lecture des contenus publiés, écriture par l'administration
create policy categories_read on program_categories for select to authenticated using (true);
create policy categories_admin on program_categories for all to authenticated using (is_admin()) with check (is_admin());
create policy programs_read on programs for select to authenticated using (is_published or is_staff());
create policy programs_admin on programs for all to authenticated using (is_admin()) with check (is_admin());
create policy exercises_read on exercises for select to authenticated using (is_published or is_staff());
create policy exercises_admin on exercises for all to authenticated using (is_admin()) with check (is_admin());
create policy videos_read on videos for select to authenticated using (is_published or is_staff());
create policy videos_admin on videos for all to authenticated using (is_admin()) with check (is_admin());
create policy video_exercises_read on video_exercises for select to authenticated using (true);
create policy video_exercises_admin on video_exercises for all to authenticated using (is_admin()) with check (is_admin());
create policy recipes_read on recipes for select to authenticated using (is_published or is_staff());
create policy recipes_admin on recipes for all to authenticated using (is_admin()) with check (is_admin());

create policy enrollments_own on program_enrollments for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy history_own on workout_history for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy favorites_own on favorites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- marketplace
create policy requests_read on service_requests for select to authenticated
  using (client_id = auth.uid() or has_offer_for(id) or is_staff());
create policy requests_insert on service_requests for insert to authenticated
  with check (client_id = auth.uid() and status = 'open');
create policy requests_cancel on service_requests for update to authenticated
  using (client_id = auth.uid() and status = 'open')
  with check (client_id = auth.uid() and status in ('open', 'cancelled'));

create policy offers_read on mission_offers for select to authenticated
  using (coach_id = auth.uid() or owns_request(request_id) or is_staff());

create policy bookings_read on bookings for select to authenticated
  using (auth.uid() in (client_id, coach_id) or is_staff());
create policy bookings_staff on bookings for update to authenticated using (is_staff()) with check (is_staff());

create policy tracking_read on session_tracking for select to authenticated
  using (is_booking_party(booking_id) or is_staff());
create policy work_time_read on work_time_records for select to authenticated
  using (coach_id = auth.uid() or is_staff());

create policy messages_read on booking_messages for select to authenticated
  using (is_booking_party(booking_id) or is_staff());
create policy messages_insert on booking_messages for insert to authenticated
  with check (sender_id = auth.uid() and is_booking_party(booking_id));

create policy reviews_read on reviews for select to authenticated
  using (not is_hidden or client_id = auth.uid() or is_staff());
create policy reviews_insert on reviews for insert to authenticated with check (client_id = auth.uid());
create policy reviews_moderate on reviews for update to authenticated using (is_staff()) with check (is_staff());

-- finances : lecture seule côté application
create policy plans_read on subscription_plans for select to authenticated using (is_active or is_staff());
create policy plans_admin on subscription_plans for all to authenticated using (is_admin()) with check (is_admin());
create policy subscriptions_read on subscriptions for select to authenticated using (user_id = auth.uid() or is_staff());
create policy fees_read on platform_fees for select to authenticated using (is_active or is_staff());
create policy fees_admin on platform_fees for all to authenticated using (is_admin()) with check (is_admin());
create policy payments_read on payments for select to authenticated using (user_id = auth.uid() or is_staff());
create policy earnings_read on earnings for select to authenticated using (coach_id = auth.uid() or is_staff());
create policy payouts_read on payouts for select to authenticated using (coach_id = auth.uid() or is_staff());

-- support et conformité
create policy notifications_read on notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_mark on notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy incidents_read on incidents for select to authenticated using (reporter_id = auth.uid() or is_staff());
create policy incidents_insert on incidents for insert to authenticated
  with check (reporter_id = auth.uid() and (booking_id is null or is_booking_party(booking_id)));
create policy incidents_staff on incidents for update to authenticated using (is_staff()) with check (is_staff());
create policy complaints_read on complaints for select to authenticated using (author_id = auth.uid() or is_staff());
create policy complaints_insert on complaints for insert to authenticated with check (author_id = auth.uid());
create policy complaints_staff on complaints for update to authenticated using (is_staff()) with check (is_staff());
create policy classifications_read on worker_classifications for select to authenticated
  using (coach_id = auth.uid() or is_admin());
create policy classifications_admin on worker_classifications for all to authenticated
  using (is_admin()) with check (is_admin());
create policy audit_read on audit_logs for select to authenticated using (is_admin());

-- Les fonctions métier ne sont appelables que par un utilisateur connecté.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

-- =====================================================================
-- Données de départ : marché pilote de Tulum (valeurs du cahier des charges,
-- modifiables depuis l'administration).
-- =====================================================================
insert into markets (code, name, country_code, currency, display_currencies, timezone,
                     search_radius_km, max_hourly_rate_cents, min_hourly_rate_cents, is_active)
values ('mx-tulum', 'Tulum', 'MX', 'USD', '{USD,MXN}', 'America/Cancun', 10, 2000, null, true);

insert into feature_flags (key, market_code, enabled, description) values
  ('kfit_club',           null, false, 'Univers KFIT CLUB : invisible jusqu''à l''ouverture d''un club T7 CORP'),
  ('coach_subscription',  null, false, 'Abonnement coach : désactivé jusqu''à validation juridique écrite (art. 291-S LFT)'),
  ('booking_commission',  null, false, 'Commission KFIT sur réservation : désactivée jusqu''à validation par un avocat mexicain'),
  ('online_payments',     null, false, 'Paiement en ligne : désactivé tant qu''aucun prestataire n''est intégré');

insert into subscription_plans (market_code, audience, name, price_cents, currency, is_active) values
  ('mx-tulum', 'client', 'KFIT Client', 1299, 'USD', true),
  ('mx-tulum', 'coach',  'KFIT Coach',  1299, 'USD', false);

insert into platform_fees (market_code, kind, rate_bps, applies_to_config, is_active) values
  ('mx-tulum', 'booking_commission', 1000, 'A_independent_contractor', false);
