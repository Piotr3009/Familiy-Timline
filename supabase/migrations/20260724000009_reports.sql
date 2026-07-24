-- ============================================================
-- Reports — "report profile/account", reviewed by family admins.
-- ============================================================

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  reported_person_id uuid not null references public.persons (id) on delete cascade,
  reported_by uuid not null references auth.users (id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 2000),
  status public.report_status not null default 'open',
  resolved_by uuid references auth.users (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reports_family_idx on public.reports (family_id, status);

create trigger reports_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();
