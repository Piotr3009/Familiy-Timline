-- ============================================================
-- Invitation token flow: create / open / claim / approve /
-- double-claim / expire / re-send / rate limiting.
-- Runs via supabase/tests/run.sh after migrations + seed.
-- Leaves behind: u2 has claimed Anna, u3 has claimed Marek
-- (used by 02_rls_policies.test.sql).
-- ============================================================

-- Test principals ----------------------------------------------------
reset role;
insert into auth.users (id, email) values
  ('d0000000-0000-4000-8000-000000000002', 'anna@test.local'),
  ('d0000000-0000-4000-8000-000000000003', 'marek@test.local'),
  ('d0000000-0000-4000-8000-000000000009', 'stranger@test.local');

-- Demo user (family admin) creates one more unclaimed, unrelated person.
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', false);
set role authenticated;

insert into public.persons (id, family_id, managed_by, created_by, first_name, last_name)
values ('a0000000-0000-4000-8000-00000000000a', 'f0000000-0000-4000-8000-000000000001',
        'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
        'Marek', 'Nowak');

-- Create an invitation for Anna --------------------------------------
do $$
declare v jsonb;
begin
  v := public.create_invitation(
    'a0000000-0000-4000-8000-000000000002', 'hash_anna', 'anna@test.local');
  if v->>'invitation_id' is null then
    raise exception 'TEST: create_invitation returned no id';
  end if;
  if (v->>'expires_at')::timestamptz < now() + interval '29 days'
     or (v->>'expires_at')::timestamptz > now() + interval '31 days' then
    raise exception 'TEST: expiry should be ~30 days from config, got %', v->>'expires_at';
  end if;
end $$;

-- Inviting a deceased person must fail.
do $$
begin
  begin
    perform public.create_invitation('a0000000-0000-4000-8000-000000000006', 'hash_henryk');
    raise exception 'TEST: inviting a deceased person should fail';
  exception when others then
    if sqlerrm <> 'person_deceased' then raise; end if;
  end;
end $$;

-- Unknown token lookups return null (no information leak).
do $$
begin
  if public.get_invitation_by_token('no_such_hash', 'ip1') is not null then
    raise exception 'TEST: unknown token must return null';
  end if;
end $$;

-- Anonymous visitor opens the invite link ----------------------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;

do $$
declare v jsonb;
begin
  v := public.get_invitation_by_token('hash_anna', 'ip1');
  if v->>'status' <> 'opened' then
    raise exception 'TEST: first lookup should mark invitation opened, got %', v->>'status';
  end if;
  if v->>'person_first_name' <> 'Anna' or v->>'family_name' <> 'Kowalski Family' then
    raise exception 'TEST: lookup should expose person and family name';
  end if;
end $$;

-- u2 claims Anna's profile -------------------------------------------
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000002', false);
set role authenticated;

do $$
declare v jsonb;
begin
  v := public.claim_invitation('hash_anna');
  if v->>'person_id' <> 'a0000000-0000-4000-8000-000000000002' then
    raise exception 'TEST: claim returned wrong person';
  end if;
end $$;

-- A second user cannot claim an invitation under approval.
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000003', false);
set role authenticated;

do $$
begin
  begin
    perform public.claim_invitation('hash_anna');
    raise exception 'TEST: double claim should fail';
  exception when others then
    if sqlerrm <> 'invitation_already_claimed' then raise; end if;
  end;
end $$;

-- An unrelated user cannot even see the invitation row (RLS)…
do $$
declare n bigint;
begin
  select count(*) into n from public.invitations where token_hash = encode(digest('hash_anna', 'sha256'), 'hex');
  if n <> 0 then
    raise exception 'TEST: unrelated user must not see the invitation';
  end if;
end $$;

-- …and cannot approve it even if they somehow obtained the id.
reset role;
select set_config('test.inv_anna',
  (select id::text from public.invitations where token_hash = encode(digest('hash_anna', 'sha256'), 'hex')), false);
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000003', false);
set role authenticated;

do $$
begin
  begin
    perform public.approve_claim(current_setting('test.inv_anna')::uuid);
    raise exception 'TEST: unrelated user must not approve claims';
  exception when others then
    if sqlerrm <> 'not_allowed_to_approve' then raise; end if;
  end;
end $$;

-- The inviter approves: ownership transfers --------------------------
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', false);
set role authenticated;

select public.approve_claim((select id from public.invitations where token_hash = encode(digest('hash_anna', 'sha256'), 'hex')));

do $$
declare v_user uuid; v_managed uuid; v_status public.invitation_status;
begin
  select user_id, managed_by into v_user, v_managed
  from public.persons where id = 'a0000000-0000-4000-8000-000000000002';
  if v_user <> 'd0000000-0000-4000-8000-000000000002' or v_managed is not null then
    raise exception 'TEST: approval must set user_id and clear managed_by';
  end if;
  select status into v_status from public.invitations where token_hash = encode(digest('hash_anna', 'sha256'), 'hex');
  if v_status <> 'claimed' then
    raise exception 'TEST: approved invitation must be claimed, got %', v_status;
  end if;
  if not exists (
    select 1 from public.family_members
    where family_id = 'f0000000-0000-4000-8000-000000000001'
      and user_id = 'd0000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'TEST: approval must add the claimer to family_members';
  end if;
end $$;

-- A consumed invitation cannot be claimed again.
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000003', false);
set role authenticated;

do $$
begin
  begin
    perform public.claim_invitation('hash_anna');
    raise exception 'TEST: consumed invitation must not be claimable';
  exception when others then
    if sqlerrm <> 'invitation_not_active' then raise; end if;
  end;
end $$;

-- Inviting an already-claimed person must fail.
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', false);
set role authenticated;

do $$
begin
  begin
    perform public.create_invitation('a0000000-0000-4000-8000-000000000002', 'hash_anna2');
    raise exception 'TEST: inviting a claimed person should fail';
  exception when others then
    if sqlerrm <> 'person_already_claimed' then raise; end if;
  end;
end $$;

-- Expiry -------------------------------------------------------------
select public.create_invitation('a0000000-0000-4000-8000-00000000000a', 'hash_marek_1');

reset role;
update public.invitations set expires_at = now() - interval '1 day'
where token_hash = encode(digest('hash_marek_1', 'sha256'), 'hex');

select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000003', false);
set role authenticated;

do $$
declare v jsonb;
begin
  v := public.get_invitation_by_token('hash_marek_1', 'ip2');
  if v->>'status' <> 'expired' then
    raise exception 'TEST: stale invitation should read as expired, got %', v->>'status';
  end if;
  begin
    perform public.claim_invitation('hash_marek_1');
    raise exception 'TEST: expired invitation must not be claimable';
  exception when others then
    if sqlerrm <> 'invitation_expired' then raise; end if;
  end;
end $$;

-- Re-send: a fresh invitation supersedes previous live links ---------
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', false);
set role authenticated;

select public.create_invitation('a0000000-0000-4000-8000-00000000000a', 'hash_marek_2');
select public.create_invitation('a0000000-0000-4000-8000-00000000000a', 'hash_marek_3');

do $$
declare v_status public.invitation_status; v_super uuid;
begin
  select status, superseded_by into v_status, v_super
  from public.invitations where token_hash = encode(digest('hash_marek_2', 'sha256'), 'hex');
  if v_status <> 'revoked' or v_super is null then
    raise exception 'TEST: re-send must revoke and supersede the old link (got %)', v_status;
  end if;
end $$;

-- Old link no longer claimable, new one works.
reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000003', false);
set role authenticated;

do $$
begin
  begin
    perform public.claim_invitation('hash_marek_2');
    raise exception 'TEST: revoked invitation must not be claimable';
  exception when others then
    if sqlerrm <> 'invitation_not_active' then raise; end if;
  end;
  perform public.claim_invitation('hash_marek_3');
end $$;

reset role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', false);
set role authenticated;
select public.approve_claim((select id from public.invitations where token_hash = encode(digest('hash_marek_3', 'sha256'), 'hex')));

-- Rate limiting ------------------------------------------------------
reset role;
do $$
begin
  perform public.consume_rate_limit('test_action', 'k1', 2, interval '1 hour');
  perform public.consume_rate_limit('test_action', 'k1', 2, interval '1 hour');
  begin
    perform public.consume_rate_limit('test_action', 'k1', 2, interval '1 hour');
    raise exception 'TEST: third hit should exceed the limit of 2';
  exception when others then
    if sqlerrm <> 'rate_limit_exceeded' then raise; end if;
  end;
  -- Different key is unaffected.
  perform public.consume_rate_limit('test_action', 'k2', 2, interval '1 hour');
end $$;

reset role;
select 'invitations tests passed' as ok;
