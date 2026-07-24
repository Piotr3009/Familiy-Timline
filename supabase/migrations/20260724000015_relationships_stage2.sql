-- ============================================================
-- Stage 2 relationships: divorces, remarriage, date coherence.
--
--  * The Stage 1 one-partner-record-per-pair index is dropped as
--    planned (see 20260724000005): a pair may now accumulate several
--    partner records over time (married → divorced → remarried).
--    Only ONE non-ended record per pair may exist at a time.
--  * Date coherence is enforced as a CHECK backstop (the app validates
--    first for friendly errors). All dates stay optional.
--  * Profile editors (managers/guardians) of either endpoint may now
--    edit or delete the relationship — needed to record a divorce on
--    profiles they manage. A trigger still blocks the one escalation
--    path: re-activating an ended relationship between two CLAIMED
--    accounts (that would grant immediate-family visibility without
--    consent; consent-based linking is a Stage 3 feature).
-- ============================================================

-- Remarriage of the same pair.
drop index if exists public.relationships_partner_unique;

-- 'divorced' and 'former_partner' are terminal states; everything else
-- ('partners', 'married', 'separated', 'widowed') describes the pair's
-- single ongoing record.
create unique index relationships_partner_active_unique
  on public.relationships (least(person_a_id, person_b_id), greatest(person_a_id, person_b_id))
  where type = 'partner' and status not in ('divorced', 'former_partner');

-- Backstop for date order: wedding ≥ start, separation ≥ wedding/start,
-- divorce ≥ separation/wedding/start. Stage 1 never wrote these dates,
-- so existing rows (all nulls) pass.
alter table public.relationships add constraint partner_dates_coherent check (
  (wedding_date is null or start_date is null or wedding_date >= start_date)
  and (separation_date is null or wedding_date is null or separation_date >= wedding_date)
  and (separation_date is null or start_date is null or separation_date >= start_date)
  and (divorce_date is null or separation_date is null or divorce_date >= separation_date)
  and (divorce_date is null or wedding_date is null or divorce_date >= wedding_date)
  and (divorce_date is null or start_date is null or divorce_date >= start_date)
);

-- Editors of either endpoint's profile may maintain the relationship.
drop policy "creator, involved person or admin can update relationships"
  on public.relationships;
create policy "creator, involved person, editor or admin can update relationships"
  on public.relationships for update to authenticated
  using (
    created_by = auth.uid()
    or public.is_family_admin(family_id)
    or public.relationship_involves_me(person_a_id, person_b_id)
    or public.can_edit_person(person_a_id)
    or public.can_edit_person(person_b_id)
  )
  with check (public.is_family_member(family_id));

drop policy "creator, involved person or admin can delete relationships"
  on public.relationships;
create policy "creator, involved person, editor or admin can delete relationships"
  on public.relationships for delete to authenticated
  using (
    created_by = auth.uid()
    or public.is_family_admin(family_id)
    or public.relationship_involves_me(person_a_id, person_b_id)
    or public.can_edit_person(person_a_id)
    or public.can_edit_person(person_b_id)
  );

-- [security] Structural columns are locked at the column level: without
-- this, anyone passing the UPDATE policy could REPOINT person_a_id /
-- person_b_id at two claimed accounts and bypass the INSERT hardening
-- of 20260724000013 (same class of escalation, via update). Clients may
-- only maintain the role/status/date fields.
revoke update on public.relationships from authenticated;
grant update (parent_role, status, start_date, wedding_date, separation_date, divorce_date)
  on public.relationships to authenticated;

-- Block re-activating an ended partner record between two claimed
-- accounts (mirror of the INSERT hardening in 20260724000013).
-- Statuses that grant immediate-family visibility: partners, married,
-- widowed (see is_immediate_family).
create or replace function public.check_partner_status_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type = 'partner'
     and old.status is not null
     and old.status not in ('partners', 'married', 'widowed')
     and new.status in ('partners', 'married', 'widowed')
     and not public.relationship_has_unclaimed_endpoint(new.person_a_id, new.person_b_id)
     and not public.is_family_admin(new.family_id) then
    raise exception 'relationship_escalation_blocked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger relationships_escalation_check
  before update of status on public.relationships
  for each row execute function public.check_partner_status_escalation();

-- [review fix] photos.event_id had no family-match enforcement, unlike
-- every other cross-table link (event_persons, photo_persons, reports).
create or replace function public.check_photo_event_family()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_family uuid;
begin
  if new.event_id is null then
    return new;
  end if;
  select family_id into v_event_family from public.events where id = new.event_id;
  if v_event_family is null or v_event_family <> new.family_id then
    raise exception 'linked event must belong to the photo family';
  end if;
  return new;
end;
$$;

create trigger photos_event_family_check
  before insert or update of event_id, family_id on public.photos
  for each row execute function public.check_photo_event_family();

-- [review fix] pgcrypto portability: the invitation functions call
-- digest() unqualified with search_path pinned to public. That works
-- when pgcrypto lives in public (how migration 1 installs it on a fresh
-- database) but breaks on a project where pgcrypto was pre-enabled in
-- the `extensions` schema. Including `extensions` in the search_path is
-- harmless in the first layout and fixes the second. (The schema exists
-- on Supabase; on plain-Postgres test databases the shim creates it.)
create schema if not exists extensions;
alter function public.create_invitation(uuid, text, text)
  set search_path = public, extensions;
alter function public.get_invitation_by_token(text, text)
  set search_path = public, extensions;
alter function public.claim_invitation(text)
  set search_path = public, extensions;
