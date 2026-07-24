-- ============================================================
-- Stage 2 foundation: guardianships + audit log + config keys.
--
--  * guardianships — who MANAGES a child's (or other dependent's)
--    profile. Ancestry stays in relationships (parent_child with
--    parent_role); a guardianship row grants profile-management
--    rights to the user who has claimed the guardian's person.
--    Rows are never deleted: ending a guardianship sets ended_at.
--  * audit_log — append-only edit history for persons,
--    relationships, events, photos (metadata) and guardianships,
--    populated by a generic trigger. Clients can only SELECT
--    (RLS re-checks the underlying object's visibility);
--    reverts are ordinary UPDATEs that produce NEW entries.
--  * config keys — adulthood_age, max_comment_length,
--    comment_edit_window_min (used by later Stage 2 migrations).
-- ============================================================

-- ---------- config ----------

insert into public.config (key, value, description) values
  ('adulthood_age',           '18',   'Age (in years) at which a profile stops being a minor'),
  ('max_comment_length',      '2000', 'Maximum comment length in characters'),
  ('comment_edit_window_min', '15',   'Minutes during which the author may edit a comment')
on conflict (key) do nothing;

-- ---------- guardianships ----------

create type public.guardianship_type as enum ('parent', 'legal_guardian');

create table public.guardianships (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  -- The managed (child) profile.
  person_id uuid not null references public.persons (id) on delete cascade,
  -- The guardian's person profile; management rights apply to the user
  -- who has claimed it. Unclaimed guardians are recorded but inert.
  guardian_person_id uuid not null references public.persons (id) on delete cascade,
  type public.guardianship_type not null default 'parent',
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Set when the guardianship closes (adult takeover / removal);
  -- the row is kept for history.
  ended_at timestamptz,
  constraint guardian_not_self check (person_id <> guardian_person_id)
);

create unique index guardianships_active_unique
  on public.guardianships (person_id, guardian_person_id)
  where ended_at is null;
create index guardianships_person_idx on public.guardianships (person_id);
create index guardianships_guardian_idx on public.guardianships (guardian_person_id);
create index guardianships_family_idx on public.guardianships (family_id);

create trigger guardianships_updated_at
  before update on public.guardianships
  for each row execute function public.set_updated_at();

-- Both persons must belong to the same family; family_id is derived.
create or replace function public.check_guardianship_family()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fam_child uuid;
  fam_guardian uuid;
begin
  select family_id into fam_child from public.persons where id = new.person_id;
  select family_id into fam_guardian from public.persons where id = new.guardian_person_id;
  if fam_child is null or fam_guardian is null then
    raise exception 'guardianship persons not found';
  end if;
  if fam_child <> fam_guardian then
    raise exception 'guardianship persons must belong to the same family';
  end if;
  new.family_id := fam_child;
  return new;
end;
$$;

create trigger guardianships_family_check
  before insert or update of person_id, guardian_person_id, family_id
  on public.guardianships
  for each row execute function public.check_guardianship_family();

-- The last active guardian cannot be removed while the profile is still
-- unclaimed (claimed profiles manage themselves; approve_claim closes
-- all guardianships after ownership transfers).
create or replace function public.check_guardianship_end()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ended_at is not null and old.ended_at is null then
    if exists (
         select 1 from public.persons
         where id = new.person_id and user_id is null
       )
       and not exists (
         select 1 from public.guardianships g
         where g.person_id = new.person_id
           and g.id <> new.id
           and g.ended_at is null
       ) then
      raise exception 'last_guardian' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger guardianships_end_check
  before update of ended_at on public.guardianships
  for each row execute function public.check_guardianship_end();

-- ---------- guardian predicates ----------

-- Is the caller (via their claimed profile) an active guardian of p_person?
create or replace function public.is_guardian_of(p_person uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.guardianships g
    join public.persons gp on gp.id = g.guardian_person_id
    where g.person_id = p_person
      and g.ended_at is null
      and gp.user_id = auth.uid()
  );
$$;

-- Who may manage the guardian list of a profile: existing active
-- guardians; when there are none yet (bootstrap), whoever may edit the
-- profile (manager, or family admin for orphaned profiles).
create or replace function public.can_manage_guardians(p_person uuid)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
begin
  if public.is_guardian_of(p_person) then
    return true;
  end if;
  if exists (
    select 1 from public.guardianships
    where person_id = p_person and ended_at is null
  ) then
    return false;
  end if;
  return public.can_edit_person(p_person);
end;
$$;

create or replace function public.person_is_unclaimed(p_person uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.persons where id = p_person and user_id is null
  );
$$;

revoke all on function public.is_guardian_of(uuid) from public, anon;
grant execute on function public.is_guardian_of(uuid) to authenticated;
revoke all on function public.can_manage_guardians(uuid) from public, anon;
grant execute on function public.can_manage_guardians(uuid) to authenticated;
revoke all on function public.person_is_unclaimed(uuid) from public, anon;
grant execute on function public.person_is_unclaimed(uuid) to authenticated;

-- ---------- guardian powers ----------
-- Guardians of an UNCLAIMED profile get the same powers as its manager:
-- edit, avatar upload (both flow through can_edit_person, which the
-- persons update policy and the avatars storage policies already use)
-- and full detail visibility (can_view_person_details).

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
    or (v.user_id is null and public.is_guardian_of(p_person))
    or (v.user_id is null and v.managed_by is null and public.is_family_admin(v.family_id));
end;
$$;

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
  if v.user_id is null and public.is_guardian_of(p_person) then
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

-- ---------- guardianships RLS ----------

alter table public.guardianships enable row level security;

create policy "family members can view guardianships"
  on public.guardianships for select to authenticated
  using (public.is_family_member(family_id));

create policy "guardians can add guardians"
  on public.guardianships for insert to authenticated
  with check (
    public.is_family_member(family_id)
    and created_by = auth.uid()
    and public.person_is_unclaimed(person_id)
    and public.can_manage_guardians(person_id)
  );

-- Removal = setting ended_at (column grant below); the end-check trigger
-- keeps at least one active guardian on unclaimed profiles.
create policy "guardians can end guardianships"
  on public.guardianships for update to authenticated
  using (public.is_guardian_of(person_id))
  with check (public.is_guardian_of(person_id));
-- No delete policy: guardianship history is never erased.

revoke update on public.guardianships from authenticated;
grant update (ended_at) on public.guardianships to authenticated;

-- ---------- audit log ----------

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  row_id uuid not null,
  -- Denormalized for RLS scoping; audited tables all carry family_id.
  family_id uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  -- update: {column: {"old": ..., "new": ...}, ...}
  -- insert: {}   delete: {"snapshot": {<full row>}}
  changed jsonb not null default '{}'::jsonb,
  actor_user_id uuid,
  created_at timestamptz not null default now()
);

create index audit_log_row_idx
  on public.audit_log (table_name, row_id, created_at desc);
create index audit_log_family_idx
  on public.audit_log (family_id, created_at desc);

-- Generic row-change recorder. updated_at noise is excluded from diffs;
-- an update that changes nothing else records nothing.
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_changed jsonb := '{}'::jsonb;
  v_key text;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    insert into public.audit_log (table_name, row_id, family_id, action, changed, actor_user_id)
    values (tg_table_name, new.id, (v_new ->> 'family_id')::uuid, 'insert', '{}'::jsonb, auth.uid());
    return new;
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key = 'updated_at' then
        continue;
      end if;
      if v_old -> v_key is distinct from v_new -> v_key then
        v_changed := v_changed || jsonb_build_object(
          v_key, jsonb_build_object('old', v_old -> v_key, 'new', v_new -> v_key)
        );
      end if;
    end loop;
    if v_changed = '{}'::jsonb then
      return new;
    end if;
    insert into public.audit_log (table_name, row_id, family_id, action, changed, actor_user_id)
    values (tg_table_name, new.id, (v_new ->> 'family_id')::uuid, 'update', v_changed, auth.uid());
    return new;
  else
    v_old := to_jsonb(old);
    insert into public.audit_log (table_name, row_id, family_id, action, changed, actor_user_id)
    values (tg_table_name, old.id, (v_old ->> 'family_id')::uuid, 'delete',
            jsonb_build_object('snapshot', v_old), auth.uid());
    return old;
  end if;
end;
$$;

create trigger persons_audit
  after insert or update or delete on public.persons
  for each row execute function public.audit_row_change();
create trigger relationships_audit
  after insert or update or delete on public.relationships
  for each row execute function public.audit_row_change();
create trigger events_audit
  after insert or update or delete on public.events
  for each row execute function public.audit_row_change();
create trigger photos_audit
  after insert or update or delete on public.photos
  for each row execute function public.audit_row_change();
create trigger guardianships_audit
  after insert or update or delete on public.guardianships
  for each row execute function public.audit_row_change();

-- ---------- audit RLS ----------
-- History follows the visibility of the object it describes: private
-- objects' history is only visible to whoever may see the object.
-- Entries for deleted rows become invisible with the row (the
-- can_view_* checks fail once the object is gone) — history is kept
-- for future needs but not exposed.

alter table public.audit_log enable row level security;

create policy "object visibility governs audit entries"
  on public.audit_log for select to authenticated
  using (
    case table_name
      when 'persons' then
        public.can_view_person_details(row_id) or public.can_edit_person(row_id)
      when 'events' then public.can_view_event(row_id)
      when 'photos' then public.can_view_photo(row_id)
      when 'relationships' then
        family_id is not null and public.is_family_member(family_id)
      when 'guardianships' then
        family_id is not null and public.is_family_member(family_id)
      else false
    end
  );
-- No insert/update/delete policies or grants: the trigger (security
-- definer) is the only writer; the log is append-only for clients.

revoke insert, update, delete on public.audit_log from authenticated, anon;
