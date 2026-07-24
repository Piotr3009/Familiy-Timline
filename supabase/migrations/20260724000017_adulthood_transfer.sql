-- ============================================================
-- Stage 2 adulthood transfer.
--
-- DETECTION CHOICE (documented per spec): adult-crossing is detected at
-- READ TIME on the relevant pages (guardian views the profile or the
-- dashboard), NOT via pg_cron. Trade-offs: no scheduled-job
-- infrastructure and nothing to break silently; the check is a pure
-- function of birth date + config so it costs one comparison at
-- render; the downside is that nobody is nudged while nobody visits —
-- acceptable for a family app where guardians see the dashboard
-- regularly. pg_cron can be added in a later stage without schema
-- changes if proactive nudges become necessary.
--
--  * approve_claim now CLOSES all guardianships of the claimed profile
--    (ended_at, kept as history) after ownership transfers. The
--    last-guardian trigger allows this because the profile is claimed
--    by the time the update runs.
--  * persons.takeover_reviewed_at marks that the new owner has walked
--    through the post-takeover review screen.
--  * Tagged persons may remove THEIR OWN photo tags / event
--    participation (needed by the review screen, and a sensible privacy
--    right on its own).
-- ============================================================

-- ---------- takeover review marker ----------

alter table public.persons add column takeover_reviewed_at timestamptz;

-- The hardening migration switched persons to column-level grants; the
-- new column needs explicit ones. Reading is family-safe (it is a UX
-- flag); writing goes through the persons update policy (owner/editor).
grant select (takeover_reviewed_at) on public.persons to authenticated, anon;
grant update (takeover_reviewed_at) on public.persons to authenticated;

-- visible_persons: new column appended at the END (CREATE OR REPLACE
-- VIEW requirement). Still SECURITY DEFINER with the explicit
-- family-row filter, exactly as in 20260724000013.
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
  d.ok as details_visible,
  p.takeover_reviewed_at
from public.persons p
cross join lateral (select public.can_view_person_details(p.id) as ok) d
where public.is_family_member(p.family_id);

grant select on public.visible_persons to authenticated;

-- ---------- approve_claim closes guardianships ----------

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

  -- The person now owns their profile: close every guardianship (rows
  -- stay for history). Runs after user_id is set, so the last-guardian
  -- protection does not apply.
  update public.guardianships
  set ended_at = now()
  where person_id = v.person_id and ended_at is null;

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

-- ---------- own-tag removal ----------

create or replace function public.is_my_person(p_person uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.persons where id = p_person and user_id = auth.uid()
  );
$$;

revoke all on function public.is_my_person(uuid) from public, anon;
grant execute on function public.is_my_person(uuid) to authenticated;

create policy "tagged person can remove their own photo tag"
  on public.photo_persons for delete to authenticated
  using (public.is_my_person(person_id));

create policy "participant can remove their own event participation"
  on public.event_persons for delete to authenticated
  using (public.is_my_person(person_id));
