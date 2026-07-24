-- ============================================================
-- Security hardening (post-review).
--
-- Fixes:
--  1. [CRITICAL] Life-detail privacy is now enforced by RLS, not only by
--     the visible_persons view. The base table's sensitive columns are
--     revoked from clients; reads go through a SECURITY DEFINER view that
--     masks them per can_view_person_details AND restricts rows to the
--     caller's families.
--  2. [HIGH] A member can no longer fabricate a relationship between two
--     claimed accounts to escalate into someone's immediate_family.
--  3. [MEDIUM] Definer helpers that leak structure/config are no longer
--     callable by anon.
--  4. [MEDIUM] Invitation tokens are hashed SERVER-side: the stored
--     token_hash is no longer a usable bearer credential.
--  5. [LOW] A superseded/expired invitation can no longer be approved.
-- ============================================================

-- ---------- 1. Life-detail privacy at the RLS layer ----------

-- The view becomes SECURITY DEFINER so it can read the (now client-
-- inaccessible) sensitive columns and mask them. Because a definer view
-- bypasses the base table's row policies, it re-applies the family-row
-- filter explicitly.
create or replace view public.visible_persons
with (security_invoker = off)
as
select
  p.id,
  p.family_id,
  p.user_id,
  p.managed_by,
  p.created_by,
  p.first_name,
  p.last_name,
  p.maiden_name,
  p.gender,
  p.is_deceased,
  p.avatar_url,
  p.life_details_privacy,
  p.created_at,
  p.updated_at,
  case when d.ok then p.birth_year end as birth_year,
  case when d.ok then p.birth_month end as birth_month,
  case when d.ok then p.birth_day end as birth_day,
  case when d.ok then p.birth_place end as birth_place,
  case when d.ok then p.death_year end as death_year,
  case when d.ok then p.death_month end as death_month,
  case when d.ok then p.death_day end as death_day,
  case when d.ok then p.death_place end as death_place,
  case when d.ok then p.bio end as bio,
  d.ok as details_visible
from public.persons p
cross join lateral (select public.can_view_person_details(p.id) as ok) d
where public.is_family_member(p.family_id);

grant select on public.visible_persons to authenticated;

-- Lock the sensitive (life-detail) columns on the base table. Basic info
-- (names, maiden name, gender, avatar, is_deceased, ownership columns)
-- stays selectable so the tree and lists render. The sensitive columns
-- are simply not granted to any client role, so they cannot be selected
-- directly regardless of RLS. Row-level access is still governed by the
-- persons SELECT policy (family members only; anon has no policy).
revoke select on public.persons from authenticated, anon;
grant select (
  id, family_id, user_id, managed_by, created_by,
  first_name, last_name, maiden_name, gender, is_deceased,
  avatar_url, life_details_privacy, created_at, updated_at
) on public.persons to authenticated, anon;

-- ---------- 2. Relationship escalation ----------

-- A relationship may only be created when at least one endpoint is an
-- UNCLAIMED profile. Every Stage 1 tree-building flow adds a newly
-- created unclaimed relative, so this is transparent to legitimate use;
-- it blocks a member from unilaterally linking their own claimed account
-- to another claimed account to gain immediate_family visibility.
-- (Full consent-based relationship management between claimed accounts is
-- a Stage 2 concern.)
create or replace function public.relationship_has_unclaimed_endpoint(p_a uuid, p_b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.persons
    where id in (p_a, p_b) and user_id is null
  );
$$;

revoke all on function public.relationship_has_unclaimed_endpoint(uuid, uuid) from public, anon;
grant execute on function public.relationship_has_unclaimed_endpoint(uuid, uuid) to authenticated;

drop policy "family members can create relationships" on public.relationships;
create policy "family members can create relationships"
  on public.relationships for insert to authenticated
  with check (
    public.is_family_member(family_id)
    and created_by = auth.uid()
    and public.relationship_has_unclaimed_endpoint(person_a_id, person_b_id)
  );

-- ---------- 3. Tighten definer-function exposure to anon ----------

revoke all on function public.is_immediate_family(uuid, uuid) from public, anon;
grant execute on function public.is_immediate_family(uuid, uuid) to authenticated;

revoke all on function public.config_int(text) from public, anon;
grant execute on function public.config_int(text) to authenticated;

-- ---------- 4. Server-side invitation token hashing ----------
-- The RPCs now accept the RAW token and hash it internally. The raw token
-- lives only in the invite link (and on the Next.js server that already
-- holds it); the database stores and compares only the SHA-256 hash, so a
-- leaked token_hash is not a usable credential.

drop function if exists public.create_invitation(uuid, text, text);
create function public.create_invitation(
  p_person_id uuid,
  p_token text,
  p_email text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_person persons%rowtype;
  v_id uuid := gen_random_uuid();
  v_expires timestamptz;
  v_token_hash text := encode(digest(p_token, 'sha256'), 'hex');
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select * into v_person from public.persons where id = p_person_id;
  if not found then
    raise exception 'person_not_found' using errcode = 'P0001';
  end if;
  if not public.is_family_member(v_person.family_id) then
    raise exception 'not_a_family_member' using errcode = 'P0001';
  end if;
  if v_person.user_id is not null then
    raise exception 'person_already_claimed' using errcode = 'P0001';
  end if;
  if v_person.is_deceased then
    raise exception 'person_deceased' using errcode = 'P0001';
  end if;

  perform public.consume_rate_limit(
    'invite_create', auth.uid()::text,
    public.config_int('max_invites_per_user_day'), interval '1 day'
  );

  v_expires := now() + make_interval(days => public.config_int('invite_validity_days'));

  insert into public.invitations (
    id, family_id, person_id, invited_by, email, token_hash, expires_at
  )
  values (
    v_id, v_person.family_id, p_person_id, auth.uid(), p_email,
    v_token_hash, v_expires
  );

  update public.invitations
  set status = 'revoked', superseded_by = v_id
  where person_id = p_person_id
    and id <> v_id
    and status in ('pending', 'opened');

  return jsonb_build_object('invitation_id', v_id, 'expires_at', v_expires);
end;
$$;

drop function if exists public.get_invitation_by_token(text, text);
create function public.get_invitation_by_token(
  p_token text,
  p_rate_key text default 'anon'
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v invitations%rowtype;
  v_person persons%rowtype;
  v_family_name text;
  v_token_hash text := encode(digest(p_token, 'sha256'), 'hex');
begin
  perform public.consume_rate_limit(
    'invite_lookup', coalesce(p_rate_key, 'anon'),
    public.config_int('invite_lookup_per_hour'), interval '1 hour'
  );

  select * into v from public.invitations where token_hash = v_token_hash;
  if not found then
    return null;
  end if;

  if v.status in ('pending', 'opened') and v.expires_at < now() then
    update public.invitations set status = 'expired' where id = v.id;
    v.status := 'expired';
  end if;

  if v.status = 'pending' then
    update public.invitations
    set status = 'opened', opened_at = now()
    where id = v.id;
    v.status := 'opened';
  end if;

  select * into v_person from public.persons where id = v.person_id;
  select name into v_family_name from public.families where id = v.family_id;

  return jsonb_build_object(
    'invitation_id', v.id,
    'status', v.status,
    'claim_status', v.claim_status,
    'expires_at', v.expires_at,
    'person_first_name', v_person.first_name,
    'person_last_name', v_person.last_name,
    'person_already_claimed', v_person.user_id is not null,
    'family_name', v_family_name,
    'claimed_by_me', auth.uid() is not null and v.claimed_by = auth.uid()
  );
end;
$$;

drop function if exists public.claim_invitation(text);
create function public.claim_invitation(p_token text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v invitations%rowtype;
  v_person persons%rowtype;
  v_token_hash text := encode(digest(p_token, 'sha256'), 'hex');
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select * into v from public.invitations
  where token_hash = v_token_hash
  for update;
  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0001';
  end if;

  if v.status = 'expired'
     or (v.status in ('pending', 'opened') and v.expires_at < now()) then
    update public.invitations set status = 'expired'
    where id = v.id and status in ('pending', 'opened');
    raise exception 'invitation_expired' using errcode = 'P0001';
  end if;
  if v.status not in ('pending', 'opened') then
    raise exception 'invitation_not_active' using errcode = 'P0001';
  end if;
  if v.claim_status = 'pending_approval' then
    raise exception 'invitation_already_claimed' using errcode = 'P0001';
  end if;

  select * into v_person from public.persons where id = v.person_id;
  if v_person.user_id is not null then
    raise exception 'person_already_claimed' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.persons
    where family_id = v.family_id and user_id = auth.uid()
  ) then
    raise exception 'already_has_profile_in_family' using errcode = 'P0001';
  end if;

  update public.invitations
  set claimed_by = auth.uid(),
      claim_status = 'pending_approval',
      claimed_at = now()
  where id = v.id;

  return jsonb_build_object(
    'invitation_id', v.id,
    'person_id', v.person_id,
    'family_id', v.family_id
  );
end;
$$;

revoke all on function public.create_invitation(uuid, text, text) from public, anon;
grant execute on function public.create_invitation(uuid, text, text) to authenticated;
grant execute on function public.get_invitation_by_token(text, text) to anon, authenticated;
revoke all on function public.claim_invitation(text) from public, anon;
grant execute on function public.claim_invitation(text) to authenticated;

-- ---------- 5. Do not approve superseded / expired claims ----------

create or replace function public.approve_claim(p_invitation_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v invitations%rowtype;
  v_person persons%rowtype;
begin
  select * into v from public.invitations where id = p_invitation_id for update;
  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0001';
  end if;
  if v.claim_status is distinct from 'pending_approval' or v.claimed_by is null then
    raise exception 'no_pending_claim' using errcode = 'P0001';
  end if;
  -- A re-send revokes the old link; a lapsed link expires. Neither may be
  -- approved — the claimer must claim the current link.
  if v.status in ('revoked', 'expired')
     or (v.status in ('pending', 'opened') and v.expires_at < now()) then
    raise exception 'invitation_not_active' using errcode = 'P0001';
  end if;

  select * into v_person from public.persons where id = v.person_id;
  if v.invited_by <> auth.uid()
     and (v_person.managed_by is distinct from auth.uid())
     and not public.is_family_admin(v.family_id) then
    raise exception 'not_allowed_to_approve' using errcode = 'P0001';
  end if;
  if v_person.user_id is not null then
    raise exception 'person_already_claimed' using errcode = 'P0001';
  end if;

  update public.persons
  set user_id = v.claimed_by, managed_by = null
  where id = v.person_id;

  insert into public.family_members (family_id, user_id, role)
  values (v.family_id, v.claimed_by, 'member')
  on conflict (family_id, user_id) do nothing;

  update public.invitations
  set status = 'claimed',
      claim_status = 'approved',
      approved_by = auth.uid(),
      approved_at = now()
  where id = v.id;

  return jsonb_build_object('person_id', v.person_id, 'claimed_by', v.claimed_by);
end;
$$;

revoke all on function public.approve_claim(uuid) from public, anon;
grant execute on function public.approve_claim(uuid) to authenticated;
