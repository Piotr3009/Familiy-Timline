-- ============================================================
-- Families and memberships.
--
-- Membership model: a user is a member of a family when they have a
-- row in family_members. Rows are created ONLY by security definer
-- functions (create_family_with_profile, approve_claim) — there is no
-- other way to join a family (invite-only, enforced at the DB level).
-- persons.user_id links the member to their profile in the tree.
-- ============================================================

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger families_updated_at
  before update on public.families
  for each row execute function public.set_updated_at();

create table public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.family_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (family_id, user_id)
);

create index family_members_user_idx on public.family_members (user_id);
create index family_members_family_idx on public.family_members (family_id);
