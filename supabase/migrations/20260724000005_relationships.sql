-- ============================================================
-- Relationships — always separate records, never columns on persons.
--
--   * partner:      person_a <-> person_b, symmetric; status + dates
--   * parent_child: person_a = parent, person_b = child; parent_role
--   * sibling:      explicit record for half/step siblings; full siblings
--                   are ALSO derivable from shared parents (the tree view
--                   merges both sources)
--
-- Stage 1 UI creates only simple links, but the schema already covers
-- divorces, separations and former partners for Stage 2.
-- ============================================================

create table public.relationships (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  person_a_id uuid not null references public.persons (id) on delete cascade,
  person_b_id uuid not null references public.persons (id) on delete cascade,
  type public.relationship_type not null,

  -- parent_child only
  parent_role public.parent_role,

  -- partner only
  status public.partner_status,
  start_date date,
  wedding_date date,
  separation_date date,
  divorce_date date,

  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint no_self_relationship check (person_a_id <> person_b_id),
  constraint parent_role_only_for_parent_child
    check (parent_role is null or type = 'parent_child'),
  constraint parent_child_has_role
    check (type <> 'parent_child' or parent_role is not null),
  constraint partner_fields_only_for_partner check (
    type = 'partner'
    or (status is null and start_date is null and wedding_date is null
        and separation_date is null and divorce_date is null)
  ),
  constraint partner_has_status check (type <> 'partner' or status is not null)
);

-- One parent link per (parent, child) pair.
create unique index relationships_parent_child_unique
  on public.relationships (person_a_id, person_b_id)
  where type = 'parent_child';

-- One explicit sibling link per unordered pair.
create unique index relationships_sibling_unique
  on public.relationships (least(person_a_id, person_b_id), greatest(person_a_id, person_b_id))
  where type = 'sibling';

-- Stage 1: one partner link per unordered pair (remarriage of the same
-- pair is a Stage 2 concern; this index is dropped in that migration).
create unique index relationships_partner_unique
  on public.relationships (least(person_a_id, person_b_id), greatest(person_a_id, person_b_id))
  where type = 'partner';

create index relationships_family_idx on public.relationships (family_id);
create index relationships_person_a_idx on public.relationships (person_a_id);
create index relationships_person_b_idx on public.relationships (person_b_id);

create trigger relationships_updated_at
  before update on public.relationships
  for each row execute function public.set_updated_at();

-- Both persons must belong to the same family as the relationship.
create or replace function public.check_relationship_family()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fam_a uuid;
  fam_b uuid;
begin
  select family_id into fam_a from public.persons where id = new.person_a_id;
  select family_id into fam_b from public.persons where id = new.person_b_id;
  if fam_a is null or fam_b is null then
    raise exception 'relationship persons not found';
  end if;
  if fam_a <> fam_b then
    raise exception 'relationship persons must belong to the same family';
  end if;
  new.family_id := fam_a;
  return new;
end;
$$;

create trigger relationships_family_check
  before insert or update of person_a_id, person_b_id, family_id
  on public.relationships
  for each row execute function public.check_relationship_family();
