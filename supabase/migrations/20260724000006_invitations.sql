-- ============================================================
-- Invitations & profile claiming.
--
-- Security model:
--   * The raw token (256-bit, base64url) exists only in the invite link;
--     the DB stores its SHA-256 hash. A leaked database never leaks
--     usable invite links.
--   * All writes go through security definer functions
--     (20260724000010_functions.sql) — there are no direct insert/update
--     policies. Joining a family is impossible without a valid token
--     plus a two-sided approval.
--   * Expiry only kills the link: the profile stays and can be
--     re-invited any number of times (resend_invitation).
-- ============================================================

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  person_id uuid not null references public.persons (id) on delete cascade,
  invited_by uuid not null references auth.users (id) on delete cascade,
  email text check (email is null or char_length(email) <= 320),

  token_hash text not null unique,
  status public.invitation_status not null default 'pending',
  expires_at timestamptz not null,
  opened_at timestamptz,

  claimed_by uuid references auth.users (id) on delete set null,
  claim_status public.claim_status,
  claimed_at timestamptz,
  approved_by uuid references auth.users (id),
  approved_at timestamptz,

  superseded_by uuid references public.invitations (id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invitations_person_idx on public.invitations (person_id);
create index invitations_family_idx on public.invitations (family_id);
create index invitations_invited_by_idx on public.invitations (invited_by);
create index invitations_claimed_by_idx on public.invitations (claimed_by);

create trigger invitations_updated_at
  before update on public.invitations
  for each row execute function public.set_updated_at();

-- ============================================================
-- Generic fixed-window rate limiting, used for invitation creation and
-- invite-token lookups. Only touched by security definer functions.
-- ============================================================

create table public.rate_limits (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  actor_key text not null,
  window_start timestamptz not null default now(),
  hits int not null default 1,
  unique (action, actor_key, window_start)
);

create index rate_limits_lookup_idx
  on public.rate_limits (action, actor_key, window_start);

-- Counts a hit and raises when the limit for the window is exceeded.
create or replace function public.consume_rate_limit(
  p_action text,
  p_actor_key text,
  p_max_hits int,
  p_window interval
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_hits int;
begin
  -- Fixed windows aligned to the interval length.
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / extract(epoch from p_window))
    * extract(epoch from p_window)
  );

  insert into public.rate_limits as rl (action, actor_key, window_start, hits)
  values (p_action, p_actor_key, v_window_start, 1)
  on conflict (action, actor_key, window_start)
  do update set hits = rl.hits + 1
  returning hits into v_hits;

  if v_hits > p_max_hits then
    raise exception 'rate_limit_exceeded' using errcode = 'P0001';
  end if;

  -- Opportunistic cleanup of old windows (cheap, occasional).
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '2 days';
  end if;
end;
$$;

revoke all on function public.consume_rate_limit(text, text, int, interval) from public, anon, authenticated;
