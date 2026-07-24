-- ============================================================
-- Persons — profiles in the family tree.
--
-- PROFILE vs ACCOUNT:
--   * user_id null  -> unclaimed profile, controlled by managed_by
--   * user_id set   -> claimed: the account owns the profile
--   * is_deceased   -> never claimable, stays managed by family
--
-- Ownership columns (user_id, managed_by, family_id) can only change
-- through security definer functions — column-level UPDATE grants below
-- keep regular users away from them.
--
-- Field-group privacy:
--   * basic info (names, gender, avatar, is_deceased) is always visible
--     to family members — the minimum needed to render the tree;
--   * life details (birth/death dates & places, bio) follow
--     life_details_privacy, enforced by the visible_persons view
--     (see 20260724000010_functions.sql).
-- Unclaimed profiles of living people default to (and in Stage 1 cannot
-- exceed) 'family' visibility — there is no public level at all.
-- ============================================================

create table public.persons (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  managed_by uuid references auth.users (id) on delete set null,
  created_by uuid not null references auth.users (id),

  first_name text not null check (char_length(first_name) between 1 and 100),
  last_name text not null check (char_length(last_name) between 1 and 100),
  maiden_name text check (maiden_name is null or char_length(maiden_name) <= 100),
  gender public.gender,

  -- Partial dates: see convention in 20260724000001_types.sql
  birth_year int check (birth_year between 1 and 2200),
  birth_month int check (birth_month between 1 and 12),
  birth_day int check (birth_day between 1 and 31),
  birth_place text,
  death_year int check (death_year between 1 and 2200),
  death_month int check (death_month between 1 and 12),
  death_day int check (death_day between 1 and 31),
  death_place text,
  is_deceased boolean not null default false,

  avatar_url text,
  bio text,

  life_details_privacy public.privacy_level not null default 'family',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint birth_day_requires_month check (birth_day is null or birth_month is not null),
  constraint birth_month_requires_year check (birth_month is null or birth_year is not null),
  constraint death_day_requires_month check (death_day is null or death_month is not null),
  constraint death_month_requires_year check (death_month is null or death_year is not null),
  constraint death_requires_deceased
    check (is_deceased or (death_year is null and death_place is null)),
  -- NOTE: a profile with user_id AND managed_by both null is "orphaned"
  -- (e.g. its account or manager was deleted); family admins can edit it.
  constraint deceased_never_claimed check (not (is_deceased and user_id is not null)),
  -- One claimed profile per user per family (a user may belong to more
  -- than one family in later stages).
  constraint one_profile_per_user_per_family unique (family_id, user_id)
);

create index persons_family_idx on public.persons (family_id);
create index persons_user_idx on public.persons (user_id);
create index persons_managed_by_idx on public.persons (managed_by);
-- Future person matching (Stage 3) will search on these:
create index persons_match_idx on public.persons (last_name, first_name, birth_year);

create trigger persons_updated_at
  before update on public.persons
  for each row execute function public.set_updated_at();
