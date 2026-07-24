-- ============================================================
-- Helper predicates (used by RLS policies) and business logic
-- functions. Business logic lives here — not in React components —
-- so the future mobile app calls the exact same rpc() endpoints.
-- All functions are SECURITY DEFINER with a pinned search_path;
-- execute grants at the bottom of this file are the access control.
-- ============================================================

-- ---------- membership predicates ----------

create or replace function public.is_family_member(p_family uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.family_members
    where family_id = p_family and user_id = auth.uid()
  );
$$;

create or replace function public.is_family_admin(p_family uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.family_members
    where family_id = p_family and user_id = auth.uid() and role = 'admin'
  );
$$;

-- The caller's claimed person profile within a family (null if none).
create or replace function public.my_person_id(p_family uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from public.persons
  where family_id = p_family and user_id = auth.uid();
$$;

-- ---------- immediate family resolution ----------
-- "Immediate family" of person A = parents, children, current partner
-- (partners/married/widowed), and siblings (explicit records OR shared
-- parent). Symmetric by construction.

create or replace function public.is_immediate_family(p_a uuid, p_b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    exists (
      select 1 from public.relationships r
      where ((r.person_a_id = p_a and r.person_b_id = p_b)
          or (r.person_a_id = p_b and r.person_b_id = p_a))
        and (
          r.type in ('parent_child', 'sibling')
          or (r.type = 'partner' and r.status in ('partners', 'married', 'widowed'))
        )
    )
    or exists (
      select 1
      from public.relationships p1
      join public.relationships p2 on p1.person_a_id = p2.person_a_id
      where p1.type = 'parent_child' and p2.type = 'parent_child'
        and p1.person_b_id = p_a and p2.person_b_id = p_b
    );
$$;

-- ---------- privacy checks ----------

-- Generic visibility check for creator-owned content (events, photos).
create or replace function public.can_view_item(
  p_family uuid,
  p_owner uuid,
  p_privacy public.privacy_level
)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  v_my_person uuid;
  v_owner_person uuid;
begin
  if auth.uid() is null then
    return false;
  end if;
  if p_owner = auth.uid() then
    return true;
  end if;
  if not public.is_family_member(p_family) then
    return false;
  end if;
  if p_privacy = 'family' then
    return true;
  end if;
  if p_privacy = 'private' then
    return false;
  end if;
  -- immediate_family: resolved around the content owner's person.
  v_my_person := public.my_person_id(p_family);
  select id into v_owner_person
  from public.persons where family_id = p_family and user_id = p_owner;
  if v_my_person is null or v_owner_person is null then
    return false;
  end if;
  return public.is_immediate_family(v_my_person, v_owner_person);
end;
$$;

create or replace function public.can_view_event(p_event uuid)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  v events%rowtype;
begin
  select * into v from public.events where id = p_event;
  if not found then
    return false;
  end if;
  if public.can_view_item(v.family_id, v.created_by, v.privacy) then
    return true;
  end if;
  -- A claimed participant always sees the event, unless it is private.
  if v.privacy <> 'private' and public.is_family_member(v.family_id) then
    return exists (
      select 1 from public.event_persons ep
      join public.persons pe on pe.id = ep.person_id
      where ep.event_id = p_event and pe.user_id = auth.uid()
    );
  end if;
  return false;
end;
$$;

create or replace function public.can_view_photo(p_photo uuid)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  v photos%rowtype;
begin
  select * into v from public.photos where id = p_photo;
  if not found then
    return false;
  end if;
  if public.can_view_item(v.family_id, v.uploaded_by, v.privacy) then
    return true;
  end if;
  -- A claimed tagged person always sees the photo, unless it is private.
  if v.privacy <> 'private' and public.is_family_member(v.family_id) then
    return exists (
      select 1 from public.photo_persons pp
      join public.persons pe on pe.id = pp.person_id
      where pp.photo_id = p_photo and pe.user_id = auth.uid()
    );
  end if;
  return false;
end;
$$;

-- Life-details visibility for a person profile (see visible_persons view).
create or replace function public.can_view_person_details(p_person uuid)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  v persons%rowtype;
  v_my_person uuid;
begin
  select * into v from public.persons where id = p_person;
  if not found or auth.uid() is null then
    return false;
  end if;
  if v.user_id = auth.uid() then
    return true;
  end if;
  if v.user_id is null and v.managed_by = auth.uid() then
    return true;
  end if;
  if not public.is_family_member(v.family_id) then
    return false;
  end if;
  if v.user_id is null and v.managed_by is null and public.is_family_admin(v.family_id) then
    return true;
  end if;
  if v.life_details_privacy = 'family' then
    return true;
  end if;
  if v.life_details_privacy = 'private' then
    return false;
  end if;
  v_my_person := public.my_person_id(v.family_id);
  if v_my_person is null then
    return false;
  end if;
  return public.is_immediate_family(v_my_person, v.id);
end;
$$;

-- Person rows with life-detail columns nulled out for viewers who may
-- not see them. The app reads THIS view for display; the base table is
-- only used for editing (RLS update policies still apply there).
create or replace view public.visible_persons
with (security_invoker = on)
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
cross join lateral (select public.can_view_person_details(p.id) as ok) d;

-- ---------- onboarding ----------

create or replace function public.create_family_with_profile(
  p_family_name text,
  p_first_name text,
  p_last_name text,
  p_maiden_name text default null,
  p_gender public.gender default null,
  p_birth_year int default null,
  p_birth_month int default null,
  p_birth_day int default null,
  p_birth_place text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_family_id uuid;
  v_person_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  insert into public.families (name, created_by)
  values (p_family_name, auth.uid())
  returning id into v_family_id;

  insert into public.family_members (family_id, user_id, role)
  values (v_family_id, auth.uid(), 'admin');

  insert into public.persons (
    family_id, user_id, created_by, first_name, last_name, maiden_name,
    gender, birth_year, birth_month, birth_day, birth_place
  )
  values (
    v_family_id, auth.uid(), auth.uid(), p_first_name, p_last_name,
    p_maiden_name, p_gender, p_birth_year, p_birth_month, p_birth_day,
    p_birth_place
  )
  returning id into v_person_id;

  return jsonb_build_object('family_id', v_family_id, 'person_id', v_person_id);
end;
$$;

-- ---------- invitations ----------

create or replace function public.create_invitation(
  p_person_id uuid,
  p_token_hash text,
  p_email text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_person persons%rowtype;
  v_id uuid := gen_random_uuid();
  v_expires timestamptz;
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
    p_token_hash, v_expires
  );

  -- Re-send semantics: a new invitation invalidates all previous live
  -- links for the same profile.
  update public.invitations
  set status = 'revoked', superseded_by = v_id
  where person_id = p_person_id
    and id <> v_id
    and status in ('pending', 'opened');

  return jsonb_build_object('invitation_id', v_id, 'expires_at', v_expires);
end;
$$;

-- Public (anon-callable) lookup for the /invite/[token] page.
-- Marks the invitation as opened on first view; rate limited per caller key.
create or replace function public.get_invitation_by_token(
  p_token_hash text,
  p_rate_key text default 'anon'
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v invitations%rowtype;
  v_person persons%rowtype;
  v_family_name text;
begin
  perform public.consume_rate_limit(
    'invite_lookup', coalesce(p_rate_key, 'anon'),
    public.config_int('invite_lookup_per_hour'), interval '1 hour'
  );

  select * into v from public.invitations where token_hash = p_token_hash;
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

create or replace function public.claim_invitation(p_token_hash text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v invitations%rowtype;
  v_person persons%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select * into v from public.invitations
  where token_hash = p_token_hash
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

-- Approval must come from the inviter, the profile manager, or a family
-- admin ("Yes, this is them") before ownership transfers.
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

create or replace function public.reject_claim(p_invitation_id uuid)
returns void
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
  if v.claim_status is distinct from 'pending_approval' then
    raise exception 'no_pending_claim' using errcode = 'P0001';
  end if;

  select * into v_person from public.persons where id = v.person_id;
  if v.invited_by <> auth.uid()
     and (v_person.managed_by is distinct from auth.uid())
     and not public.is_family_admin(v.family_id) then
    raise exception 'not_allowed_to_approve' using errcode = 'P0001';
  end if;

  update public.invitations
  set claim_status = 'rejected'
  where id = v.id;
end;
$$;

-- ---------- grants ----------
-- Policy helper predicates: evaluated as the querying role.
grant execute on function public.is_family_member(uuid) to authenticated;
grant execute on function public.is_family_admin(uuid) to authenticated;
grant execute on function public.my_person_id(uuid) to authenticated;
grant execute on function public.is_immediate_family(uuid, uuid) to authenticated;
grant execute on function public.can_view_item(uuid, uuid, public.privacy_level) to authenticated;
grant execute on function public.can_view_event(uuid) to authenticated;
grant execute on function public.can_view_photo(uuid) to authenticated;
grant execute on function public.can_view_person_details(uuid) to authenticated;

-- Business functions.
revoke all on function public.create_family_with_profile(text, text, text, text, public.gender, int, int, int, text) from public, anon;
grant execute on function public.create_family_with_profile(text, text, text, text, public.gender, int, int, int, text) to authenticated;

revoke all on function public.create_invitation(uuid, text, text) from public, anon;
grant execute on function public.create_invitation(uuid, text, text) to authenticated;

grant execute on function public.get_invitation_by_token(text, text) to anon, authenticated;

revoke all on function public.claim_invitation(text) from public, anon;
grant execute on function public.claim_invitation(text) to authenticated;

revoke all on function public.approve_claim(uuid) from public, anon;
grant execute on function public.approve_claim(uuid) to authenticated;

revoke all on function public.reject_claim(uuid) from public, anon;
grant execute on function public.reject_claim(uuid) to authenticated;

grant select on public.visible_persons to authenticated;
