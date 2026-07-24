-- ============================================================
-- RLS proofs required by the spec:
--   * a stranger sees nothing
--   * anonymous sees nothing
--   * 'private' items are invisible to other family members
--   * 'immediate_family' resolves through the relationships table
--   * ownership columns cannot be modified by users
--   * visible_persons hides life details per privacy level
--   * storage objects follow photo privacy
-- Depends on 01_invitations.test.sql (u2 = Anna, u3 = Marek claimed).
-- ============================================================

-- Anonymous sees nothing --------------------------------------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;

do $$
declare n bigint;
begin
  select count(*) into n from public.persons;
  if n <> 0 then raise exception 'TEST: anon persons = %, want 0', n; end if;
  select count(*) into n from public.families;
  if n <> 0 then raise exception 'TEST: anon families = %, want 0', n; end if;
  select count(*) into n from public.events;
  if n <> 0 then raise exception 'TEST: anon events = %, want 0', n; end if;
  select count(*) into n from public.photos;
  if n <> 0 then raise exception 'TEST: anon photos = %, want 0', n; end if;
  select count(*) into n from public.invitations;
  if n <> 0 then raise exception 'TEST: anon invitations = %, want 0', n; end if;
  select count(*) into n from public.config;
  if n <> 0 then raise exception 'TEST: anon config = %, want 0', n; end if;
end $$;

-- A stranger (authenticated, not a member) sees nothing --------------
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000009', false);
set role authenticated;

do $$
declare n bigint;
begin
  select count(*) into n from public.persons;
  if n <> 0 then raise exception 'TEST: stranger persons = %, want 0', n; end if;
  select count(*) into n from public.visible_persons;
  if n <> 0 then raise exception 'TEST: stranger visible_persons = %, want 0', n; end if;
  select count(*) into n from public.families;
  if n <> 0 then raise exception 'TEST: stranger families = %, want 0', n; end if;
  select count(*) into n from public.events;
  if n <> 0 then raise exception 'TEST: stranger events = %, want 0', n; end if;
  select count(*) into n from public.relationships;
  if n <> 0 then raise exception 'TEST: stranger relationships = %, want 0', n; end if;
  select count(*) into n from public.invitations;
  if n <> 0 then raise exception 'TEST: stranger invitations = %, want 0', n; end if;
end $$;

-- Stranger cannot insert a person into someone else's family.
do $$
begin
  begin
    insert into public.persons (family_id, managed_by, created_by, first_name, last_name)
    values ('f0000000-0000-4000-8000-000000000001',
            'd0000000-0000-4000-8000-000000000009',
            'd0000000-0000-4000-8000-000000000009', 'Evil', 'Intruder');
    raise exception 'TEST: stranger insert into persons must be denied';
  exception when sqlstate '42501' then
    null; -- expected: RLS violation
  end;
end $$;

-- Even after founding their own family, the stranger sees only it ----
do $$
declare v jsonb; n bigint;
begin
  v := public.create_family_with_profile('Stranger Family', 'Sam', 'Stranger');
  select count(*) into n from public.persons;
  if n <> 1 then raise exception 'TEST: own-family persons = %, want 1', n; end if;
  select count(*) into n from public.persons
  where family_id = 'f0000000-0000-4000-8000-000000000001';
  if n <> 0 then raise exception 'TEST: foreign family persons = %, want 0', n; end if;
end $$;

-- Member visibility --------------------------------------------------
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000002', false);
set role authenticated;

do $$
declare n bigint;
begin
  select count(*) into n from public.persons;
  if n <> 10 then raise exception 'TEST: member persons = %, want 10', n; end if;
  select count(*) into n from public.events;
  if n <> 7 then raise exception 'TEST: member events = %, want 7', n; end if;
  select count(*) into n from public.relationships;
  if n <> 13 then raise exception 'TEST: member relationships = %, want 13', n; end if;
end $$;

-- Private items are invisible to other members -----------------------
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', false);
set role authenticated;

insert into public.events (id, family_id, type, title, event_year, privacy, created_by)
values ('e0000000-0000-4000-8000-000000000010', 'f0000000-0000-4000-8000-000000000001',
        'other', 'My secret note', 2025, 'private',
        'd0000000-0000-4000-8000-000000000001');

insert into public.events (id, family_id, type, title, event_year, privacy, created_by)
values ('e0000000-0000-4000-8000-000000000011', 'f0000000-0000-4000-8000-000000000001',
        'other', 'Close family news', 2025, 'immediate_family',
        'd0000000-0000-4000-8000-000000000001');

do $$
declare n bigint;
begin
  -- The creator sees both.
  select count(*) into n from public.events
  where id in ('e0000000-0000-4000-8000-000000000010', 'e0000000-0000-4000-8000-000000000011');
  if n <> 2 then raise exception 'TEST: creator sees own private/immediate events, got %', n; end if;
end $$;

-- Anna (u2) is Piotr's wife -> immediate family: sees the
-- immediate_family event but NOT the private one.
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000002', false);
set role authenticated;

do $$
declare n bigint;
begin
  select count(*) into n from public.events
  where id = 'e0000000-0000-4000-8000-000000000010';
  if n <> 0 then raise exception 'TEST: private event leaked to another member'; end if;
  select count(*) into n from public.events
  where id = 'e0000000-0000-4000-8000-000000000011';
  if n <> 1 then raise exception 'TEST: immediate_family event should be visible to the partner'; end if;
end $$;

-- Marek (u3) has no relationship to Piotr -> immediate_family hidden.
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000003', false);
set role authenticated;

do $$
declare n bigint;
begin
  select count(*) into n from public.events
  where id = 'e0000000-0000-4000-8000-000000000011';
  if n <> 0 then
    raise exception 'TEST: immediate_family event leaked to a non-immediate member';
  end if;
end $$;

-- Immediate-family resolution through relationships ------------------
reset role;
do $$
begin
  -- Partner (married)
  if not public.is_immediate_family(
    'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002') then
    raise exception 'TEST: spouse should be immediate family';
  end if;
  -- Parent / child
  if not public.is_immediate_family(
    'a0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001') then
    raise exception 'TEST: parent should be immediate family';
  end if;
  -- Siblings via shared parents (no explicit sibling record seeded)
  if not public.is_immediate_family(
    'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003') then
    raise exception 'TEST: sibling via shared parent should be immediate family';
  end if;
  -- Grandparent is NOT immediate family
  if public.is_immediate_family(
    'a0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000008') then
    raise exception 'TEST: grandparent must not be immediate family';
  end if;
  -- Unrelated person is not immediate family
  if public.is_immediate_family(
    'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a') then
    raise exception 'TEST: unrelated person must not be immediate family';
  end if;
end $$;

-- Ownership columns are locked for users -----------------------------
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000002', false);
set role authenticated;

-- Editing own profile data works…
update public.persons set bio = 'I love gardening.'
where id = 'a0000000-0000-4000-8000-000000000002';

do $$
begin
  -- …but touching user_id is denied at the column level.
  begin
    update public.persons set user_id = null
    where id = 'a0000000-0000-4000-8000-000000000002';
    raise exception 'TEST: user_id update must be denied';
  exception when sqlstate '42501' then null;
  end;
  begin
    update public.persons set managed_by = 'd0000000-0000-4000-8000-000000000002'
    where id = 'a0000000-0000-4000-8000-000000000001';
    raise exception 'TEST: managed_by update must be denied';
  exception when sqlstate '42501' then null;
  end;
end $$;

-- A member cannot edit someone else's claimed profile.
do $$
declare n int;
begin
  update public.persons set bio = 'hacked'
  where id = 'a0000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'TEST: member must not edit another claimed profile'; end if;
end $$;

-- visible_persons hides life details per privacy ---------------------
-- Piotr sets his life details to immediate_family.
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', false);
set role authenticated;
update public.persons set life_details_privacy = 'immediate_family'
where id = 'a0000000-0000-4000-8000-000000000001';

-- Anna (wife) still sees his birth year…
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000002', false);
set role authenticated;
do $$
declare y int;
begin
  select birth_year into y from public.visible_persons
  where id = 'a0000000-0000-4000-8000-000000000001';
  if y is distinct from 1975 then
    raise exception 'TEST: partner should see immediate_family life details';
  end if;
end $$;

-- …Marek (unrelated member) sees the name but not the details.
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000003', false);
set role authenticated;
do $$
declare r record;
begin
  select first_name, birth_year, bio, details_visible into r
  from public.visible_persons
  where id = 'a0000000-0000-4000-8000-000000000001';
  if r.first_name <> 'Piotr' then
    raise exception 'TEST: basic info must stay visible to family';
  end if;
  if r.birth_year is not null or r.bio is not null or r.details_visible then
    raise exception 'TEST: life details must be hidden from non-immediate members';
  end if;
end $$;

reset role;
update public.persons set life_details_privacy = 'family'
where id = 'a0000000-0000-4000-8000-000000000001';

-- Storage objects follow photo privacy -------------------------------
-- Piotr uploads a private photo (row + storage objects).
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', false);
set role authenticated;

insert into public.photos (
  id, family_id, uploaded_by, kind, storage_path_original, file_size_bytes, privacy
) values (
  'b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000001', 'photo',
  'f0000000-0000-4000-8000-000000000001/b0000000-0000-4000-8000-000000000001/original.jpg',
  1000, 'private'
);

insert into storage.objects (bucket_id, name, owner) values
  ('media',
   'f0000000-0000-4000-8000-000000000001/b0000000-0000-4000-8000-000000000001/original.jpg',
   'd0000000-0000-4000-8000-000000000001');

do $$
declare n bigint;
begin
  select count(*) into n from storage.objects where bucket_id = 'media';
  if n <> 1 then raise exception 'TEST: uploader must see own media object'; end if;
end $$;

-- Anna cannot see the private photo row nor its storage object.
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000002', false);
set role authenticated;

do $$
declare n bigint;
begin
  select count(*) into n from public.photos
  where id = 'b0000000-0000-4000-8000-000000000001';
  if n <> 0 then raise exception 'TEST: private photo row leaked'; end if;
  select count(*) into n from storage.objects where bucket_id = 'media';
  if n <> 0 then raise exception 'TEST: private photo storage object leaked'; end if;
end $$;

-- Avatar objects are family-visible, writable only by profile editors.
reset role;
insert into storage.objects (bucket_id, name, owner) values
  ('avatars', 'f0000000-0000-4000-8000-000000000001/a0000000-0000-4000-8000-000000000001.jpg',
   'd0000000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000002', false);
set role authenticated;

do $$
declare n bigint;
begin
  select count(*) into n from storage.objects where bucket_id = 'avatars';
  if n <> 1 then raise exception 'TEST: family member should see avatars'; end if;
  -- Anna may upload her own avatar…
  insert into storage.objects (bucket_id, name, owner) values
    ('avatars', 'f0000000-0000-4000-8000-000000000001/a0000000-0000-4000-8000-000000000002.jpg',
     'd0000000-0000-4000-8000-000000000002');
  -- …but not Piotr's.
  begin
    insert into storage.objects (bucket_id, name, owner) values
      ('avatars', 'f0000000-0000-4000-8000-000000000001/a0000000-0000-4000-8000-000000000001.png',
       'd0000000-0000-4000-8000-000000000002');
    raise exception 'TEST: uploading an avatar for another claimed profile must be denied';
  exception when sqlstate '42501' then null;
  end;
end $$;

-- The stranger sees no storage objects at all.
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000009', false);
set role authenticated;

do $$
declare n bigint;
begin
  select count(*) into n from storage.objects;
  if n <> 0 then raise exception 'TEST: stranger sees % storage objects, want 0', n; end if;
end $$;

reset role;
select 'rls policy tests passed' as ok;
