-- ============================================================
-- Storage — private buckets only, media served via signed URLs.
--
-- Bucket layout:
--   avatars: <family_id>/<person_id>.<ext>
--   media:   <family_id>/<photo_id>/{original|preview|thumb}.<ext>
--
-- Upload order for media: the photos ROW is inserted first (client
-- generates the photo id, quota trigger runs), then files are uploaded.
-- Reads therefore always have a photos row to check privacy against.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false), ('media', 'media', false)
on conflict (id) do nothing;

-- Exception-safe uuid parsing for path segments.
create or replace function public.try_uuid(p text)
returns uuid
language plpgsql immutable
as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

grant execute on function public.try_uuid(text) to authenticated;

-- The person id encoded in an avatar object path.
create or replace function public.avatar_person_id(p_name text)
returns uuid
language sql immutable
as $$
  select public.try_uuid(split_part(split_part(p_name, '/', 2), '.', 1));
$$;

grant execute on function public.avatar_person_id(text) to authenticated;

-- avatars: visible to the whole family (avatar is basic info);
-- writable only by whoever may edit that person's profile.
create policy "family members can view avatars"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and public.is_family_member(public.try_uuid((storage.foldername(name))[1]))
  );

create policy "profile editors can upload avatars"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and public.is_family_member(public.try_uuid((storage.foldername(name))[1]))
    and public.can_edit_person(public.avatar_person_id(name))
  );

create policy "profile editors can replace avatars"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and public.can_edit_person(public.avatar_person_id(name))
  )
  with check (
    bucket_id = 'avatars'
    and public.can_edit_person(public.avatar_person_id(name))
  );

create policy "profile editors can delete avatars"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and public.can_edit_person(public.avatar_person_id(name))
  );

-- media: per-photo privacy — the object is visible only when the photos
-- row is (can_view_photo re-checks family, privacy, tags).
create policy "photo privacy governs media objects"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'media'
    and public.can_view_photo(public.try_uuid((storage.foldername(name))[2]))
  );

create policy "family members can upload media files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and public.is_family_member(public.try_uuid((storage.foldername(name))[1]))
    and public.can_edit_photo(public.try_uuid((storage.foldername(name))[2]))
  );

create policy "photo editors can delete media files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'media'
    and public.can_edit_photo(public.try_uuid((storage.foldername(name))[2]))
  );
