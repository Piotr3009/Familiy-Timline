-- ============================================================
-- Stage 2 tests: guardianships, audit log (this file grows with each
-- Stage 2 migration; sections are ordered like the migrations).
-- Depends on the state left by 01–04:
--   u1 = Piotr (admin), u2 = Anna, u3 = Marek (claimed profiles),
--   u9 = stranger with own family.
-- ============================================================

-- Test fixtures ------------------------------------------------------
-- u4: a fresh account that will claim the guardian profile later.
reset role;
insert into auth.users (id, email) values
  ('d0000000-0000-4000-8000-000000000004', 'guardian2@test.local');

-- Piotr (u1) creates a child profile (Julia already exists in seed as
-- a0..07, born 2005 — adult by 2026) and a NEW minor child born 2015.
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', false);
set role authenticated;

insert into public.persons (id, family_id, managed_by, created_by,
                            first_name, last_name, gender, birth_year)
values ('a0000000-0000-4000-8000-000000000020',
        'f0000000-0000-4000-8000-000000000001',
        'd0000000-0000-4000-8000-000000000001',
        'd0000000-0000-4000-8000-000000000001',
        'Zosia', 'Kowalska', 'female', 2015);

-- ============================================================
-- guardianships (migration 14)
-- ============================================================

-- Bootstrap: the profile manager may add the first guardian (himself).
insert into public.guardianships (family_id, person_id, guardian_person_id, type, created_by)
values ('f0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000020',
        'a0000000-0000-4000-8000-000000000001', -- Piotr's person
        'parent',
        'd0000000-0000-4000-8000-000000000001');

-- An existing guardian may add a second guardian (Anna's person).
insert into public.guardianships (family_id, person_id, guardian_person_id, type, created_by)
values ('f0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000020',
        'a0000000-0000-4000-8000-000000000002', -- Anna's person (claimed by u2)
        'parent',
        'd0000000-0000-4000-8000-000000000001');

-- Marek (u3, unrelated member, no guardianship) cannot add himself.
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000003', false);
set role authenticated;

do $$
begin
  begin
    insert into public.guardianships (family_id, person_id, guardian_person_id, type, created_by)
    values ('f0000000-0000-4000-8000-000000000001',
            'a0000000-0000-4000-8000-000000000020',
            'a0000000-0000-4000-8000-00000000000a', -- Marek's person
            'legal_guardian',
            'd0000000-0000-4000-8000-000000000003');
    raise exception 'TEST: non-guardian must not add guardians';
  exception when sqlstate '42501' then null;
  end;
end $$;

-- Guardian powers: Anna (u2, guardian via her claimed person) can edit
-- the child profile even though she is not its manager.
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000002', false);
set role authenticated;

do $$
declare n int;
begin
  update public.persons set birth_place = 'Warsaw'
  where id = 'a0000000-0000-4000-8000-000000000020';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TEST: guardian must be able to edit the child profile'; end if;
end $$;

-- Guardian sees details even when the child profile is private.
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', false);
set role authenticated;
update public.persons set life_details_privacy = 'private'
where id = 'a0000000-0000-4000-8000-000000000020';

reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000002', false);
set role authenticated;

do $$
declare y int;
begin
  select birth_year into y from public.visible_persons
  where id = 'a0000000-0000-4000-8000-000000000020';
  if y is distinct from 2015 then
    raise exception 'TEST: guardian should see private child details';
  end if;
end $$;

-- Non-guardian member must NOT see the private child details.
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000003', false);
set role authenticated;

do $$
declare y int;
begin
  select birth_year into y from public.visible_persons
  where id = 'a0000000-0000-4000-8000-000000000020';
  if y is not null then
    raise exception 'TEST: private child details leaked to a non-guardian';
  end if;
end $$;

-- Ending guardianships: Anna removes herself (one guardian remains)…
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000002', false);
set role authenticated;

update public.guardianships set ended_at = now()
where person_id = 'a0000000-0000-4000-8000-000000000020'
  and guardian_person_id = 'a0000000-0000-4000-8000-000000000002';

-- …but the LAST guardian cannot be removed.
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', false);
set role authenticated;

do $$
begin
  begin
    update public.guardianships set ended_at = now()
    where person_id = 'a0000000-0000-4000-8000-000000000020'
      and guardian_person_id = 'a0000000-0000-4000-8000-000000000001';
    raise exception 'TEST: removing the last guardian must fail';
  exception when others then
    if sqlerrm <> 'last_guardian' then raise; end if;
  end;
end $$;

-- Re-adding Anna works (history row stays ended, new active row).
insert into public.guardianships (family_id, person_id, guardian_person_id, type, created_by)
values ('f0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000020',
        'a0000000-0000-4000-8000-000000000002',
        'parent',
        'd0000000-0000-4000-8000-000000000001');

do $$
declare n bigint;
begin
  select count(*) into n from public.guardianships
  where person_id = 'a0000000-0000-4000-8000-000000000020';
  if n <> 3 then raise exception 'TEST: guardianship history rows = %, want 3', n; end if;
  select count(*) into n from public.guardianships
  where person_id = 'a0000000-0000-4000-8000-000000000020' and ended_at is null;
  if n <> 2 then raise exception 'TEST: active guardianships = %, want 2', n; end if;
end $$;

-- Clients cannot delete guardianship history.
do $$
declare n int;
begin
  delete from public.guardianships
  where person_id = 'a0000000-0000-4000-8000-000000000020';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'TEST: guardianship rows must not be deletable'; end if;
end $$;

-- Guardianship across families is rejected.
do $$
begin
  begin
    insert into public.guardianships (family_id, person_id, guardian_person_id, type, created_by)
    values ('f0000000-0000-4000-8000-000000000001',
            'a0000000-0000-4000-8000-000000000020',
            (select id from public.persons
             where family_id <> 'f0000000-0000-4000-8000-000000000001' limit 1),
            'parent',
            'd0000000-0000-4000-8000-000000000001');
    raise exception 'TEST: cross-family guardianship must fail';
  exception when others then
    if sqlerrm not like '%same family%' and sqlerrm not like '%not found%'
       and sqlstate <> '42501' then raise; end if;
  end;
end $$;

-- ============================================================
-- audit_log (migration 14)
-- ============================================================

-- Piotr edits his own bio -> an update entry with old/new appears.
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', false);
set role authenticated;

update public.persons set bio = 'Audit trail test bio.'
where id = 'a0000000-0000-4000-8000-000000000001';

do $$
declare e record;
begin
  select * into e from public.audit_log
  where table_name = 'persons'
    and row_id = 'a0000000-0000-4000-8000-000000000001'
    and action = 'update'
  order by created_at desc limit 1;
  if not found then
    raise exception 'TEST: person update should produce an audit entry';
  end if;
  if e.changed -> 'bio' ->> 'new' <> 'Audit trail test bio.' then
    raise exception 'TEST: audit entry should record the new bio, got %', e.changed;
  end if;
  if e.actor_user_id <> 'd0000000-0000-4000-8000-000000000001' then
    raise exception 'TEST: audit entry should record the actor';
  end if;
end $$;

-- Audit entries cannot be written or altered by clients.
do $$
begin
  begin
    insert into public.audit_log (table_name, row_id, action)
    values ('persons', 'a0000000-0000-4000-8000-000000000001', 'update');
    raise exception 'TEST: direct audit insert must be denied';
  exception when sqlstate '42501' then null;
  end;
  begin
    delete from public.audit_log where table_name = 'persons';
    raise exception 'TEST: audit delete must be denied';
  exception when sqlstate '42501' then null;
  end;
end $$;

-- Privacy: Piotr makes his life details private, edits his birth place;
-- the audit entry is invisible to other members but visible to him.
update public.persons set life_details_privacy = 'private'
where id = 'a0000000-0000-4000-8000-000000000001';
update public.persons set birth_place = 'Gdańsk, Poland'
where id = 'a0000000-0000-4000-8000-000000000001';

reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000003', false);
set role authenticated;

do $$
declare n bigint;
begin
  select count(*) into n from public.audit_log
  where table_name = 'persons'
    and row_id = 'a0000000-0000-4000-8000-000000000001';
  if n <> 0 then
    raise exception 'TEST: private person audit entries leaked to another member';
  end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', false);
set role authenticated;

do $$
declare n bigint;
begin
  select count(*) into n from public.audit_log
  where table_name = 'persons'
    and row_id = 'a0000000-0000-4000-8000-000000000001'
    and action = 'update';
  if n < 2 then
    raise exception 'TEST: owner should see own audit entries, got %', n;
  end if;
end $$;

-- Restore for later sections.
update public.persons set life_details_privacy = 'family'
where id = 'a0000000-0000-4000-8000-000000000001';

-- A private EVENT's audit history is invisible to other members.
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', false);
set role authenticated;

update public.events set description = 'edited secret'
where id = 'e0000000-0000-4000-8000-000000000010'; -- private event from 02

reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000002', false);
set role authenticated;

do $$
declare n bigint;
begin
  select count(*) into n from public.audit_log
  where table_name = 'events'
    and row_id = 'e0000000-0000-4000-8000-000000000010';
  if n <> 0 then
    raise exception 'TEST: private event audit entries leaked';
  end if;
end $$;

-- The stranger (u9, other family) sees no audit entries at all.
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000009', false);
set role authenticated;

do $$
declare n bigint;
begin
  select count(*) into n from public.audit_log
  where family_id = 'f0000000-0000-4000-8000-000000000001';
  if n <> 0 then
    raise exception 'TEST: stranger sees % audit rows of a foreign family', n;
  end if;
end $$;

-- Anon sees nothing.
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;

do $$
declare n bigint;
begin
  select count(*) into n from public.audit_log;
  if n <> 0 then raise exception 'TEST: anon audit rows = %, want 0', n; end if;
  select count(*) into n from public.guardianships;
  if n <> 0 then raise exception 'TEST: anon guardianships = %, want 0', n; end if;
end $$;

-- ============================================================
-- relationships stage 2 (migration 15)
-- ============================================================

-- Fixtures: two unclaimed persons managed by Piotr (u1).
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', false);
set role authenticated;

insert into public.persons (id, family_id, managed_by, created_by, first_name, last_name)
values
  ('a0000000-0000-4000-8000-000000000030', 'f0000000-0000-4000-8000-000000000001',
   'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'Adam', 'Testowy'),
  ('a0000000-0000-4000-8000-000000000031', 'f0000000-0000-4000-8000-000000000001',
   'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'Ewa', 'Testowa');

-- Marriage with coherent dates.
insert into public.relationships (id, family_id, person_a_id, person_b_id, type, status,
                                  start_date, wedding_date, created_by)
values ('c0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000030', 'a0000000-0000-4000-8000-000000000031',
        'partner', 'married', '1990-05-01', '1992-06-15',
        'd0000000-0000-4000-8000-000000000001');

-- Incoherent dates are rejected (check constraint).
do $$
begin
  begin
    update public.relationships
    set divorce_date = '1991-01-01'
    where id = 'c0000000-0000-4000-8000-000000000001';
    raise exception 'TEST: divorce before wedding must be rejected';
  exception when check_violation then null;
  end;
end $$;

-- A second ACTIVE record for the same pair is rejected…
do $$
begin
  begin
    insert into public.relationships (family_id, person_a_id, person_b_id, type, status, created_by)
    values ('f0000000-0000-4000-8000-000000000001',
            'a0000000-0000-4000-8000-000000000031', 'a0000000-0000-4000-8000-000000000030',
            'partner', 'partners', 'd0000000-0000-4000-8000-000000000001');
    raise exception 'TEST: duplicate active partner record must be rejected';
  exception when unique_violation then null;
  end;
end $$;

-- …but after a divorce the pair can remarry (new record).
update public.relationships
set status = 'divorced', separation_date = '2000-01-01', divorce_date = '2001-02-03'
where id = 'c0000000-0000-4000-8000-000000000001';

insert into public.relationships (id, family_id, person_a_id, person_b_id, type, status,
                                  wedding_date, created_by)
values ('c0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000030', 'a0000000-0000-4000-8000-000000000031',
        'partner', 'married', '2005-08-20',
        'd0000000-0000-4000-8000-000000000001');

-- Endpoint columns are locked for clients (column-level revoke):
-- repointing a relationship at claimed accounts must be denied.
do $$
begin
  begin
    update public.relationships
    set person_b_id = 'a0000000-0000-4000-8000-000000000001'
    where id = 'c0000000-0000-4000-8000-000000000002';
    raise exception 'TEST: endpoint repointing must be denied';
  exception when sqlstate '42501' then null;
  end;
end $$;

-- Escalation guard: Piotr (u1) & Anna (u2) are both CLAIMED. Ending
-- their marriage works; re-activating it as a NON-admin is blocked.
update public.relationships
set status = 'separated'
where person_a_id = 'a0000000-0000-4000-8000-000000000001'
  and person_b_id = 'a0000000-0000-4000-8000-000000000002'
  and type = 'partner';

reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000002', false);
set role authenticated;

do $$
begin
  begin
    update public.relationships
    set status = 'married'
    where person_a_id = 'a0000000-0000-4000-8000-000000000001'
      and person_b_id = 'a0000000-0000-4000-8000-000000000002'
      and type = 'partner';
    raise exception 'TEST: non-admin re-activation between claimed accounts must fail';
  exception when others then
    if sqlerrm <> 'relationship_escalation_blocked' then raise; end if;
  end;
end $$;

-- A family admin may restore it (explicit human override).
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', false);
set role authenticated;

update public.relationships
set status = 'married'
where person_a_id = 'a0000000-0000-4000-8000-000000000001'
  and person_b_id = 'a0000000-0000-4000-8000-000000000002'
  and type = 'partner';

-- Profile editors of an endpoint may maintain the relationship even if
-- they did not create it: Anna (u2) manages two unclaimed persons whose
-- relationship Piotr created.
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000002', false);
set role authenticated;

insert into public.persons (id, family_id, managed_by, created_by, first_name, last_name)
values
  ('a0000000-0000-4000-8000-000000000032', 'f0000000-0000-4000-8000-000000000001',
   'd0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000002',
   'Jan', 'Testowy'),
  ('a0000000-0000-4000-8000-000000000033', 'f0000000-0000-4000-8000-000000000001',
   'd0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000002',
   'Zofia', 'Testowa');

reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', false);
set role authenticated;

insert into public.relationships (id, family_id, person_a_id, person_b_id, type, status, created_by)
values ('c0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000032', 'a0000000-0000-4000-8000-000000000033',
        'partner', 'married', 'd0000000-0000-4000-8000-000000000001');

reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000002', false);
set role authenticated;

do $$
declare n int;
begin
  update public.relationships set status = 'divorced', divorce_date = '2020-05-05'
  where id = 'c0000000-0000-4000-8000-000000000003';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'TEST: endpoint manager must be able to record a divorce';
  end if;
end $$;

-- Relationship changes land in the audit log with old/new status.
do $$
declare e record;
begin
  select * into e from public.audit_log
  where table_name = 'relationships'
    and row_id = 'c0000000-0000-4000-8000-000000000003'
    and action = 'update'
  order by created_at desc limit 1;
  if not found then
    raise exception 'TEST: relationship update should produce an audit entry';
  end if;
  if e.changed -> 'status' ->> 'old' <> 'married'
     or e.changed -> 'status' ->> 'new' <> 'divorced' then
    raise exception 'TEST: audit entry should record the status change, got %', e.changed;
  end if;
end $$;

-- photos.event_id family check: linking a photo to another family's
-- event must fail. (u9's family has its own event.)
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000009', false);
set role authenticated;

insert into public.events (id, family_id, type, title, event_year, created_by)
select 'e0000000-0000-4000-8000-000000000099', f.id, 'other', 'Foreign event', 2020,
       'd0000000-0000-4000-8000-000000000009'
from public.families f
where f.created_by = 'd0000000-0000-4000-8000-000000000009';

reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', false);
set role authenticated;

do $$
begin
  begin
    update public.photos
    set event_id = 'e0000000-0000-4000-8000-000000000099'
    where id = 'b0000000-0000-4000-8000-000000000001';
    raise exception 'TEST: cross-family photo->event link must fail';
  exception when others then
    if sqlerrm not like '%must belong to the photo family%' then raise; end if;
  end;
end $$;

-- ============================================================
-- minors (migration 16)
-- ============================================================

reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', false);
set role authenticated;

-- Zosia (born 2015) is a minor; Julia (born 2005) is an adult.
do $$
begin
  if not public.is_minor('a0000000-0000-4000-8000-000000000020') then
    raise exception 'TEST: a child born 2015 must be a minor';
  end if;
  if public.is_minor('a0000000-0000-4000-8000-000000000007') then
    raise exception 'TEST: a person born 2005 must not be a minor';
  end if;
  -- Deceased and birth-date-less profiles are not minors.
  if public.is_minor('a0000000-0000-4000-8000-000000000006') then
    raise exception 'TEST: a deceased person must not be a minor';
  end if;
end $$;

-- HARD RULE: inviting a minor fails.
do $$
begin
  begin
    perform public.create_invitation('a0000000-0000-4000-8000-000000000020', 'tok_zosia');
    raise exception 'TEST: inviting a minor must fail';
  exception when others then
    if sqlerrm <> 'person_is_minor' then raise; end if;
  end;
end $$;

-- Inviting the adult (Julia, unclaimed) still works.
do $$
declare v jsonb;
begin
  v := public.create_invitation('a0000000-0000-4000-8000-000000000007', 'tok_julia');
  if v->>'invitation_id' is null then
    raise exception 'TEST: inviting an adult should work';
  end if;
end $$;

-- All current privacy levels remain settable on a minor (family is the
-- widest level today; the cap only bites for future wider levels).
update public.persons set life_details_privacy = 'immediate_family'
where id = 'a0000000-0000-4000-8000-000000000020';
update public.persons set life_details_privacy = 'private'
where id = 'a0000000-0000-4000-8000-000000000020';

-- ============================================================
-- adulthood transfer (migration 17)
-- ============================================================

-- u5 will claim Julia (born 2005, adult, unclaimed, guardian-managed).
reset role;
insert into auth.users (id, email) values
  ('d0000000-0000-4000-8000-000000000005', 'julia@test.local');

-- Piotr becomes Julia's guardian and tags her in a family-visible photo
-- and event, so the review flow has content to hide. (Tags on PRIVATE
-- items are invisible to the tagged person — nothing to hide there.)
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', false);
set role authenticated;

insert into public.guardianships (family_id, person_id, guardian_person_id, type, created_by)
values ('f0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000007',
        'a0000000-0000-4000-8000-000000000001',
        'parent',
        'd0000000-0000-4000-8000-000000000001');

insert into public.photos (
  id, family_id, uploaded_by, kind, storage_path_original, file_size_bytes, privacy
) values (
  'b0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000001', 'photo',
  'f0000000-0000-4000-8000-000000000001/b0000000-0000-4000-8000-000000000002/original.jpg',
  1000, 'family'
);
insert into public.events (id, family_id, type, title, event_year, privacy, created_by)
values ('e0000000-0000-4000-8000-000000000020', 'f0000000-0000-4000-8000-000000000001',
        'family_gathering', null, 2015, 'family',
        'd0000000-0000-4000-8000-000000000001');

insert into public.photo_persons (photo_id, person_id)
values ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000007');
insert into public.event_persons (event_id, person_id)
values ('e0000000-0000-4000-8000-000000000020', 'a0000000-0000-4000-8000-000000000007');

-- u5 claims Julia's invitation (tok_julia from the minors section).
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000005', false);
set role authenticated;

do $$
declare v jsonb;
begin
  v := public.claim_invitation('tok_julia');
  if v->>'person_id' <> 'a0000000-0000-4000-8000-000000000007' then
    raise exception 'TEST: claim returned wrong person';
  end if;
end $$;

-- Piotr (guardian + inviter) approves; ownership transfers and ALL
-- guardianships close (kept as history).
reset role;
select set_config('test.inv_julia',
  (select id::text from public.invitations
   where person_id = 'a0000000-0000-4000-8000-000000000007'
     and claim_status = 'pending_approval'), false);
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', false);
set role authenticated;

do $$
declare v jsonb;
begin
  v := public.approve_claim(current_setting('test.inv_julia')::uuid);
  if v->>'claimed_by' <> 'd0000000-0000-4000-8000-000000000005' then
    raise exception 'TEST: approve returned wrong claimer';
  end if;
end $$;

do $$
declare n bigint;
begin
  select count(*) into n from public.persons
  where id = 'a0000000-0000-4000-8000-000000000007'
    and user_id = 'd0000000-0000-4000-8000-000000000005';
  if n <> 1 then raise exception 'TEST: ownership must transfer on approval'; end if;
  select count(*) into n from public.guardianships
  where person_id = 'a0000000-0000-4000-8000-000000000007' and ended_at is null;
  if n <> 0 then raise exception 'TEST: guardianships must close on takeover'; end if;
  select count(*) into n from public.guardianships
  where person_id = 'a0000000-0000-4000-8000-000000000007';
  if n < 1 then raise exception 'TEST: guardianship history must be kept'; end if;
end $$;

-- The new owner hides herself: removes her own tag and participation
-- (even on items she cannot edit — they belong to Piotr).
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000005', false);
set role authenticated;

do $$
declare n int;
begin
  delete from public.photo_persons
  where photo_id = 'b0000000-0000-4000-8000-000000000002'
    and person_id = 'a0000000-0000-4000-8000-000000000007';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TEST: owner must be able to remove own photo tag'; end if;

  delete from public.event_persons
  where event_id = 'e0000000-0000-4000-8000-000000000020'
    and person_id = 'a0000000-0000-4000-8000-000000000007';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TEST: owner must be able to remove own participation'; end if;
end $$;

-- …but NOT someone else's tag (Piotr's own tag on his photo).
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', false);
set role authenticated;
insert into public.photo_persons (photo_id, person_id)
values ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001');

reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000005', false);
set role authenticated;

do $$
declare n int;
begin
  delete from public.photo_persons
  where photo_id = 'b0000000-0000-4000-8000-000000000002'
    and person_id = 'a0000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'TEST: removing another person''s tag must be filtered'; end if;
end $$;

-- Review completion marker is writable by the owner and visible in the
-- view.
update public.persons set takeover_reviewed_at = now()
where id = 'a0000000-0000-4000-8000-000000000007';

do $$
declare ts timestamptz;
begin
  select takeover_reviewed_at into ts from public.visible_persons
  where id = 'a0000000-0000-4000-8000-000000000007';
  if ts is null then
    raise exception 'TEST: takeover_reviewed_at must round-trip through the view';
  end if;
end $$;

reset role;
select 'stage 2 guardianship + audit + relationship + minor + takeover tests passed' as ok;
