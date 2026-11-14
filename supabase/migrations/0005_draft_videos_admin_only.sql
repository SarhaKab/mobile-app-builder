-- KFIT — les vidéos en brouillon (dossier « drafts/ » du stockage privé « videos ») ne sont lisibles
-- que par les administrateurs. Les autres utilisateurs connectés lisent uniquement les vidéos validées.
-- Remplace la règle « videos_read » de la migration 0004, qui ouvrait tout le bucket.

drop policy if exists videos_read on storage.objects;
create policy videos_read on storage.objects for select to authenticated
  using (bucket_id = 'videos' and (public.is_admin() or name not like 'drafts/%'));
