-- ============================================================
-- Post-review security hardening proofs. Depends on 01/02 having run:
--   u1 (d…001) = Piotr (a…001, claimed), family admin
--   u2 (d…002) = Anna  (a…002, claimed)
--   u3 (d…003) = Marek (a…00a, claimed)
--   u9 (d…009) = stranger (own separate family)
-- ============================================================

-- 1. Life-detail columns are NOT selectable from the base table --------
-- (Privacy is enforced by RLS/grants, not only by the view.)
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', false);
set role authenticated;
update public.persons set life_details_privacy = 'private'
where id = 'a0000000-0000-4000-8000-000000000001';

reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000003', false);
set role authenticated;

do $$
begin
  -- Marek is a family member but NOT immediate family of Piotr.
  -- Reading the raw sensitive columns must be denied at the grant level…
  begin
    perform bio from public.persons where id = 'a0000000-0000-4000-8000-000000000001';
    raise exception 'TEST: base-table bio must not be selectable by clients';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform birth_year from public.persons where id = 'a0000000-0000-4000-8000-000000000001';
    raise exception 'TEST: base-table birth_year must not be selectable by clients';
  exception when sqlstate '42501' then null;
  end;
end $$;

-- …while basic columns still are, and the view masks per privacy.
do $$
declare r record;
begin
  select first_name, last_name into r
  from public.persons where id = 'a0000000-0000-4000-8000-000000000001';
  if r.first_name <> 'Piotr' then
    raise exception 'TEST: basic columns must remain selectable';
  end if;

  select birth_year, bio, details_visible into r
  from public.visible_persons where id = 'a0000000-0000-4000-8000-000000000001';
  if r.birth_year is not null or r.bio is not null or r.details_visible then
    raise exception 'TEST: private life details must be masked by the view';
  end if;
end $$;

-- The owner still sees their own details through the view.
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', false);
set role authenticated;
do $$
declare y int;
begin
  select birth_year into y from public.visible_persons
  where id = 'a0000000-0000-4000-8000-000000000001';
  if y is distinct from 1975 then
    raise exception 'TEST: owner must see their own life details';
  end if;
end $$;
update public.persons set life_details_privacy = 'family'
where id = 'a0000000-0000-4000-8000-000000000001';

-- Stranger still sees nothing through the (now definer) view.
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000009', false);
set role authenticated;
do $$
declare n bigint;
begin
  select count(*) into n from public.visible_persons
  where family_id = 'f0000000-0000-4000-8000-000000000001';
  if n <> 0 then raise exception 'TEST: stranger must see 0 rows via the definer view'; end if;
end $$;

-- 2. Relationship escalation is blocked --------------------------------
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000003', false);
set role authenticated;

do $$
begin
  -- Marek (claimed) cannot link his own claimed person to Piotr's claimed
  -- person to gain immediate_family visibility.
  begin
    insert into public.relationships
      (family_id, person_a_id, person_b_id, type, status, created_by)
    values ('f0000000-0000-4000-8000-000000000001',
            'a0000000-0000-4000-8000-00000000000a',
            'a0000000-0000-4000-8000-000000000001',
            'partner', 'married', 'd0000000-0000-4000-8000-000000000003');
    raise exception 'TEST: linking two claimed accounts must be denied';
  exception when sqlstate '42501' then null;
  end;
end $$;

-- Legitimate tree-building (an unclaimed new relative) still works.
do $$
declare v_new uuid;
begin
  insert into public.persons (family_id, managed_by, created_by, first_name, last_name)
  values ('f0000000-0000-4000-8000-000000000001',
          'd0000000-0000-4000-8000-000000000003',
          'd0000000-0000-4000-8000-000000000003', 'Baby', 'Nowak')
  returning id into v_new;
  insert into public.relationships
    (family_id, person_a_id, person_b_id, type, parent_role, created_by)
  values ('f0000000-0000-4000-8000-000000000001',
          'a0000000-0000-4000-8000-00000000000a', v_new,
          'parent_child', 'biological', 'd0000000-0000-4000-8000-000000000003');
end $$;

-- 3. Sensitive definer helpers are not callable by anon ----------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;

do $$
begin
  begin
    perform public.is_immediate_family(
      'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002');
    raise exception 'TEST: anon must not execute is_immediate_family';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.config_int('invite_validity_days');
    raise exception 'TEST: anon must not execute config_int';
  exception when sqlstate '42501' then null;
  end;
end $$;

-- 4. Server-side token hashing: the stored hash is not the raw token ----
reset role;
do $$
declare v_hash text;
begin
  select token_hash into v_hash from public.invitations
  where token_hash = encode(digest('hash_marek_3', 'sha256'), 'hex');
  if v_hash = 'hash_marek_3' then
    raise exception 'TEST: token_hash must be the digest, not the raw token';
  end if;
  if v_hash is null then
    raise exception 'TEST: expected a stored hash for the claimed invitation';
  end if;
end $$;

reset role;
select 'hardening tests passed' as ok;
