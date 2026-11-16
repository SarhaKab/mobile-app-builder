-- =====================================================================
-- KFIT ON DEMAND — inscription et vérification des coachs (phase 3, étape 1)
--
--  * Un dossier ne peut être soumis que complet (pièces obligatoires + profil).
--  * La validation est humaine : seule l'équipe KFIT approuve, et uniquement
--    si chaque pièce obligatoire a été approuvée individuellement.
--  * Tout refus, demande de pièces ou suspension est motivé par écrit ; le coach
--    est notifié et peut déposer un recours (table complaints).
-- =====================================================================

-- Pièces obligatoires pour tous. Les autres (statut d'indépendant, RFC, premiers
-- secours, qualifications par activité) dépendent du régime et des activités :
-- l'équipe les réclame au cas par cas via « documents_missing ».
create or replace function coach_required_documents() returns document_type[]
language sql immutable set search_path = public as $$
  select array['identity', 'professional_photo', 'cv', 'diploma', 'liability_insurance']::document_type[];
$$;

-- Liste de ce qui manque à un dossier. Réservé au coach concerné et à l'équipe.
create or replace function coach_missing_requirements(p_coach uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select case when auth.uid() = p_coach or is_staff() then (
    select coalesce(array_agg(x order by x), '{}') from (
      select 'doc_' || t::text as x from unnest(coach_required_documents()) t
       where not exists (select 1 from coach_documents d
                          where d.coach_id = p_coach and d.type = t and d.state <> 'rejected')
      union all select 'display_name' from coach_profiles where user_id = p_coach and btrim(display_name) = ''
      union all select 'bio' from coach_profiles where user_id = p_coach and char_length(btrim(coalesce(bio, ''))) < 40
      union all select 'specialties' from coach_profiles where user_id = p_coach and cardinality(specialties) = 0
      union all select 'hourly_rate' from coach_profiles where user_id = p_coach and hourly_rate_cents is null
      union all select 'service_area' where not exists (select 1 from coach_service_areas where coach_id = p_coach and center is not null)
      union all select 'availability' where not exists (select 1 from coach_availability where coach_id = p_coach)
    ) m)
  end;
$$;

create or replace function guard_coach_profile() returns trigger
language plpgsql set search_path = public as $$
declare m record; missing text[];
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
    if new.status is distinct from old.status then
      if not (old.status in ('registration_in_progress', 'documents_missing') and new.status = 'under_review') then
        raise exception 'status can only be changed by KFIT staff';
      end if;
      missing := coach_missing_requirements(new.user_id);
      if cardinality(missing) > 0 then
        raise exception 'incomplete coach file: %', array_to_string(missing, ', ');
      end if;
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

-- Décision sur une pièce ou une qualification : horodatée et signée automatiquement.
create or replace function guard_review_fields() returns trigger
language plpgsql set search_path = public as $$
begin
  if is_trusted_context() then return new; end if;
  if is_staff() then
    if tg_op = 'UPDATE' and new.state is distinct from old.state then
      new.reviewed_by := auth.uid(); new.reviewed_at := now();
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.state := 'pending'; new.reviewed_by := null; new.reviewed_at := null;
  elsif (new.state, new.reviewed_by, new.reviewed_at) is distinct from
        (old.state, old.reviewed_by, old.reviewed_at) then
    raise exception 'review fields can only be changed by KFIT staff';
  end if;
  return new;
end $$;

-- Décision de l'équipe sur un dossier coach.
create or replace function review_coach(p_coach uuid, p_status coach_status, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not is_staff() then raise exception 'KFIT staff only'; end if;
  if p_status not in ('approved', 'rejected', 'documents_missing', 'suspended') then
    raise exception 'unsupported decision';
  end if;
  if not exists (select 1 from coach_profiles where user_id = p_coach) then
    raise exception 'coach not found';
  end if;
  if p_status <> 'approved' and v_reason is null then
    raise exception 'a written reason is required';
  end if;
  if p_status = 'approved' then
    if cardinality(coach_missing_requirements(p_coach)) > 0 then
      raise exception 'coach file is incomplete';
    end if;
    if exists (select 1 from unnest(coach_required_documents()) t
                where not exists (select 1 from coach_documents d
                                   where d.coach_id = p_coach and d.type = t and d.state = 'approved')) then
      raise exception 'every required document must be approved first';
    end if;
  end if;
  update coach_profiles
     set status = p_status,
         status_reason = case when p_status = 'approved' then null else left(v_reason, 1000) end,
         verified_at = case when p_status = 'approved' then now() else verified_at end,
         verified_by = case when p_status = 'approved' then auth.uid() else verified_by end
   where user_id = p_coach;
  insert into notifications (user_id, kind, payload)
  values (p_coach, 'coach_status', jsonb_build_object('status', p_status, 'reason', v_reason));
end $$;

revoke execute on function coach_missing_requirements(uuid), review_coach(uuid, coach_status, text),
  coach_required_documents() from public, anon;
grant execute on function coach_missing_requirements(uuid), review_coach(uuid, coach_status, text),
  coach_required_documents() to authenticated, service_role;
revoke execute on function guard_coach_profile(), guard_review_fields() from authenticated, anon, public;

-- Justificatifs : 10 Mo maximum, images ou PDF uniquement ; le coach peut retirer ses fichiers.
update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
 where id = 'coach-documents';

create policy coach_docs_remove on storage.objects for delete to authenticated
  using (bucket_id = 'coach-documents' and (storage.foldername(name))[1] = auth.uid()::text);
