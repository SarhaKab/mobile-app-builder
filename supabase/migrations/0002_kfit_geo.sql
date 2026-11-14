-- =====================================================================
-- KFIT — Géolocalisation (PostGIS) et attribution des missions
-- À appliquer après 0001. Nécessite l'extension PostGIS (disponible sur Supabase).
--
-- Proportionnalité : on stocke le centre de la zone d'intervention du coach et
-- le lieu de la séance demandé par le client. Aucune position en continu.
-- =====================================================================
create extension if not exists postgis with schema extensions;

alter table coach_service_areas
  add column center extensions.geography(Point, 4326);
create index coach_service_areas_center on coach_service_areas using gist (center);

alter table service_requests
  add column location extensions.geography(Point, 4326);

-- Pointage ponctuel facultatif au début et à la fin de la séance uniquement.
alter table session_tracking
  add column start_point extensions.geography(Point, 4326),
  add column end_point   extensions.geography(Point, 4326);

create or replace function set_service_area(p_lat double precision, p_lng double precision,
                                            p_radius_km numeric, p_label text default null)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  if not exists (select 1 from coach_profiles where user_id = auth.uid()) then
    raise exception 'coach profile required';
  end if;
  delete from coach_service_areas where coach_id = auth.uid();
  insert into coach_service_areas (coach_id, label, radius_km, center)
  values (auth.uid(), p_label, p_radius_km,
          st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography)
  returning id into v_id;
  return v_id;
end $$;

-- Recherche de coachs autour d'un point, dans le rayon défini par le marché
-- (10 km à Tulum). Ne renvoie jamais la position exacte du coach : seulement
-- la distance arrondie.
create or replace function search_coaches(p_lat double precision, p_lng double precision,
                                          p_market text, p_specialty text default null)
returns table (coach_id uuid, display_name text, headline text, photo_path text,
               specialties text[], hourly_rate_cents integer, currency char(3),
               rating_avg numeric, rating_count integer, sessions_completed integer,
               distance_km numeric)
language sql stable security definer set search_path = public, extensions as $$
  with origin as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as g),
       m as (select search_radius_km from markets where code = p_market and is_active)
  select c.user_id, c.display_name, c.headline, c.photo_path, c.specialties,
         c.hourly_rate_cents, c.currency, c.rating_avg, c.rating_count, c.sessions_completed,
         round((min(st_distance(a.center, origin.g)) / 1000)::numeric, 1) as distance_km
    from coach_profiles c
    join coach_service_areas a on a.coach_id = c.user_id
    cross join origin cross join m
   where c.market_code = p_market
     and c.status = 'approved'
     and not c.is_paused
     and c.hourly_rate_cents is not null
     and st_dwithin(a.center, origin.g, m.search_radius_km * 1000)
     and st_dwithin(a.center, origin.g, a.radius_km * 1000)
     and (p_specialty is null or p_specialty = any (c.specialties))
   group by c.user_id
   -- Classement par distance uniquement : ni les refus de mission ni le volume
   -- d'activité n'influencent l'ordre d'affichage.
   order by 11, c.user_id;
$$;

-- Propose une demande aux coachs éligibles. Critères (version publiée dans
-- algorithm_policies) : statut validé, activité non suspendue, distance,
-- spécialité, disponibilité déclarée, absence de séance déjà confirmée.
create or replace function create_mission_offers(p_request uuid, p_lat double precision,
                                                 p_lng double precision)
returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare r service_requests; m markets; v_policy integer; v_count integer;
        v_origin extensions.geography; v_local timestamp; v_end timestamp;
begin
  select * into r from service_requests where id = p_request for update;
  if r.id is null or r.client_id <> auth.uid() then raise exception 'request not found'; end if;
  if r.status <> 'open' then raise exception 'request is not open'; end if;
  select * into m from markets where code = r.market_code;
  v_origin := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
  update service_requests set location = v_origin where id = r.id;
  select max(version) into v_policy from algorithm_policies
   where published_at is not null and (market_code is null or market_code = r.market_code);
  v_local := r.starts_at at time zone m.timezone;
  v_end   := v_local + make_interval(mins => r.duration_minutes);

  insert into mission_offers (request_id, coach_id, policy_version, distance_km, expires_at)
  select r.id, c.user_id, v_policy,
         round((min(st_distance(a.center, v_origin)) / 1000)::numeric, 2),
         least(r.starts_at, now() + interval '24 hours')
    from coach_profiles c
    join coach_service_areas a on a.coach_id = c.user_id
   where c.market_code = r.market_code
     and c.status = 'approved' and not c.is_paused and c.hourly_rate_cents is not null
     and c.user_id <> r.client_id
     and (r.preferred_coach_id is null or c.user_id = r.preferred_coach_id)
     and (r.specialty is null or r.specialty = any (c.specialties))
     and st_dwithin(a.center, v_origin, m.search_radius_km * 1000)
     and st_dwithin(a.center, v_origin, a.radius_km * 1000)
     and v_end::date = v_local::date
     and exists (select 1 from coach_availability av
                  where av.coach_id = c.user_id
                    and av.weekday = extract(dow from v_local)
                    and av.start_time <= v_local::time and av.end_time >= v_end::time)
     and not exists (select 1 from bookings b
                      where b.coach_id = c.user_id and b.status in ('confirmed', 'in_progress')
                        and tstzrange(b.starts_at, b.ends_at) &&
                            tstzrange(r.starts_at, r.starts_at + make_interval(mins => r.duration_minutes)))
   group by c.user_id
  on conflict (request_id, coach_id) do nothing;
  get diagnostics v_count = row_count;

  insert into notifications (user_id, kind, payload)
  select mo.coach_id, 'mission_offer', jsonb_build_object('request_id', r.id)
    from mission_offers mo where mo.request_id = r.id and mo.status = 'offered';
  return v_count;
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

insert into algorithm_policies (version, market_code, criteria, description, published_at) values
  (1, null,
   '{"filters": ["coach_approved", "not_paused", "within_market_radius", "within_coach_radius", "specialty_match", "declared_availability", "no_conflicting_booking"], "ranking": ["distance"], "never_used": ["declined_offers", "acceptance_rate", "hours_worked"]}',
   '{"fr": "Une mission est proposée aux coachs validés, actifs, situés dans le périmètre, disponibles sur le créneau et dont la spécialité correspond. Les résultats sont classés par distance. Refuser une mission n''a aucun effet sur les propositions suivantes.", "en": "A mission is offered to verified, active coaches within range, available for the slot and matching the requested specialty. Results are ordered by distance. Declining a mission never affects future offers.", "es": "Una misión se ofrece a los coaches verificados y activos dentro del perímetro, disponibles en el horario y con la especialidad solicitada. Los resultados se ordenan por distancia. Rechazar una misión no afecta a las ofertas futuras."}',
   now());

-- ---------------------------------------------------------------- stockage privé
insert into storage.buckets (id, name, public) values
  ('coach-documents', 'coach-documents', false),
  ('videos', 'videos', false),
  ('public-media', 'public-media', true)
on conflict (id) do nothing;

-- Pièces justificatives : dossier = identifiant du coach. Lisibles par le coach
-- concerné et le staff uniquement.
create policy coach_docs_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'coach-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy coach_docs_read on storage.objects for select to authenticated
  using (bucket_id = 'coach-documents'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()));
create policy media_admin_write on storage.objects for all to authenticated
  using (bucket_id in ('videos', 'public-media') and public.is_admin())
  with check (bucket_id in ('videos', 'public-media') and public.is_admin());
create policy avatar_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'public-media' and (storage.foldername(name))[1] = 'avatars'
              and (storage.foldername(name))[2] = auth.uid()::text);
