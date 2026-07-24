-- ============================================================
-- Row Level Security — the source of truth for privacy.
-- App-level checks are convenience only; every access rule is
-- enforced here. Tables with no policy for a verb deny that verb.
-- All policies are scoped `to authenticated`: anonymous users see
-- NOTHING (invite lookup goes through its dedicated function).
-- ============================================================

-- Small helper predicates used only by policies -------------------

-- May the caller edit this person profile? (claimed owner, manager of an
-- unclaimed profile, or family admin for orphaned profiles)
create or replace function public.can_edit_person(p_person uuid)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  v persons%rowtype;
begin
  select * into v from public.persons where id = p_person;
  if not found or auth.uid() is null then
    return false;
  end if;
  return v.user_id = auth.uid()
    or (v.user_id is null and v.managed_by = auth.uid())
    or (v.user_id is null and v.managed_by is null and public.is_family_admin(v.family_id));
end;
$$;

create or replace function public.relationship_involves_me(p_a uuid, p_b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.persons
    where id in (p_a, p_b) and user_id = auth.uid()
  );
$$;

create or replace function public.can_edit_event(p_event uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event
      and (e.created_by = auth.uid() or public.is_family_admin(e.family_id))
  );
$$;

create or replace function public.can_edit_photo(p_photo uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.photos p
    where p.id = p_photo
      and (p.uploaded_by = auth.uid() or public.is_family_admin(p.family_id))
  );
$$;

create or replace function public.manages_person(p_person uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.persons
    where id = p_person and managed_by = auth.uid()
  );
$$;

grant execute on function public.can_edit_person(uuid) to authenticated;
grant execute on function public.relationship_involves_me(uuid, uuid) to authenticated;
grant execute on function public.can_edit_event(uuid) to authenticated;
grant execute on function public.can_edit_photo(uuid) to authenticated;
grant execute on function public.manages_person(uuid) to authenticated;

-- families ---------------------------------------------------------

alter table public.families enable row level security;

create policy "members can view their family"
  on public.families for select to authenticated
  using (public.is_family_member(id));

create policy "admins can rename the family"
  on public.families for update to authenticated
  using (public.is_family_admin(id))
  with check (public.is_family_admin(id));
-- insert/delete: only via security definer functions / service role.

-- family_members ---------------------------------------------------

alter table public.family_members enable row level security;

create policy "members can view the member list"
  on public.family_members for select to authenticated
  using (public.is_family_member(family_id));
-- insert/update/delete: only via security definer functions.

-- persons ----------------------------------------------------------

alter table public.persons enable row level security;

create policy "family members can view persons"
  on public.persons for select to authenticated
  using (public.is_family_member(family_id));

create policy "members create unclaimed profiles they manage"
  on public.persons for insert to authenticated
  with check (
    public.is_family_member(family_id)
    and created_by = auth.uid()
    and managed_by = auth.uid()
    and user_id is null
  );

create policy "owner or manager can update a person"
  on public.persons for update to authenticated
  using (public.can_edit_person(id))
  with check (public.can_edit_person(id));

create policy "manager can delete an unclaimed profile"
  on public.persons for delete to authenticated
  using (user_id is null and managed_by = auth.uid());

-- Ownership columns (user_id, managed_by, family_id, created_by) may
-- only change through security definer functions: column-level grants.
revoke update on public.persons from authenticated;
grant update (
  first_name, last_name, maiden_name, gender,
  birth_year, birth_month, birth_day, birth_place,
  death_year, death_month, death_day, death_place,
  is_deceased, avatar_url, bio, life_details_privacy
) on public.persons to authenticated;

-- relationships ----------------------------------------------------

alter table public.relationships enable row level security;

create policy "family members can view relationships"
  on public.relationships for select to authenticated
  using (public.is_family_member(family_id));

create policy "family members can create relationships"
  on public.relationships for insert to authenticated
  with check (public.is_family_member(family_id) and created_by = auth.uid());

create policy "creator, involved person or admin can update relationships"
  on public.relationships for update to authenticated
  using (
    created_by = auth.uid()
    or public.is_family_admin(family_id)
    or public.relationship_involves_me(person_a_id, person_b_id)
  )
  with check (public.is_family_member(family_id));

create policy "creator, involved person or admin can delete relationships"
  on public.relationships for delete to authenticated
  using (
    created_by = auth.uid()
    or public.is_family_admin(family_id)
    or public.relationship_involves_me(person_a_id, person_b_id)
  );

-- invitations ------------------------------------------------------

alter table public.invitations enable row level security;

create policy "inviter, claimer, manager or admin can view invitations"
  on public.invitations for select to authenticated
  using (
    invited_by = auth.uid()
    or claimed_by = auth.uid()
    or public.manages_person(person_id)
    or public.is_family_admin(family_id)
  );
-- All writes go through security definer functions.

-- events -----------------------------------------------------------

alter table public.events enable row level security;

create policy "privacy-aware event visibility"
  on public.events for select to authenticated
  using (public.can_view_event(id));

create policy "family members can create events"
  on public.events for insert to authenticated
  with check (public.is_family_member(family_id) and created_by = auth.uid());

create policy "creator or admin can update events"
  on public.events for update to authenticated
  using (created_by = auth.uid() or public.is_family_admin(family_id))
  with check (public.is_family_member(family_id));

create policy "creator or admin can delete events"
  on public.events for delete to authenticated
  using (created_by = auth.uid() or public.is_family_admin(family_id));

-- event_persons ----------------------------------------------------

alter table public.event_persons enable row level security;

create policy "participants visible with the event"
  on public.event_persons for select to authenticated
  using (public.can_view_event(event_id));

create policy "event editors can add participants"
  on public.event_persons for insert to authenticated
  with check (public.can_edit_event(event_id));

create policy "event editors can remove participants"
  on public.event_persons for delete to authenticated
  using (public.can_edit_event(event_id));

-- photos -----------------------------------------------------------

alter table public.photos enable row level security;

create policy "privacy-aware photo visibility"
  on public.photos for select to authenticated
  using (public.can_view_photo(id));

create policy "family members can upload media"
  on public.photos for insert to authenticated
  with check (public.is_family_member(family_id) and uploaded_by = auth.uid());

create policy "uploader or admin can update photos"
  on public.photos for update to authenticated
  using (uploaded_by = auth.uid() or public.is_family_admin(family_id))
  with check (public.is_family_member(family_id));

create policy "uploader or admin can delete photos"
  on public.photos for delete to authenticated
  using (uploaded_by = auth.uid() or public.is_family_admin(family_id));

-- photo_persons ----------------------------------------------------

alter table public.photo_persons enable row level security;

create policy "tags visible with the photo"
  on public.photo_persons for select to authenticated
  using (public.can_view_photo(photo_id));

create policy "photo editors can tag persons"
  on public.photo_persons for insert to authenticated
  with check (public.can_edit_photo(photo_id));

create policy "photo editors can remove tags"
  on public.photo_persons for delete to authenticated
  using (public.can_edit_photo(photo_id));

-- reports ----------------------------------------------------------

alter table public.reports enable row level security;

create policy "reporter and admins can view reports"
  on public.reports for select to authenticated
  using (reported_by = auth.uid() or public.is_family_admin(family_id));

create policy "family members can file reports"
  on public.reports for insert to authenticated
  with check (public.is_family_member(family_id) and reported_by = auth.uid());

create policy "admins can resolve reports"
  on public.reports for update to authenticated
  using (public.is_family_admin(family_id))
  with check (public.is_family_admin(family_id));

-- Reported person must belong to the report's family.
create or replace function public.check_report_family()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_person_family uuid;
begin
  select family_id into v_person_family
  from public.persons where id = new.reported_person_id;
  if v_person_family is null or v_person_family <> new.family_id then
    raise exception 'reported person must belong to the report family';
  end if;
  return new;
end;
$$;

create trigger reports_family_check
  before insert or update on public.reports
  for each row execute function public.check_report_family();

-- rate_limits ------------------------------------------------------

alter table public.rate_limits enable row level security;
-- No policies at all: only security definer functions touch this table.
