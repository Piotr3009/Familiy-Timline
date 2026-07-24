-- ============================================================
-- Events — typed life events feeding the family timeline.
-- Types are stable English keys (public.event_type); the UI translates
-- them and maps each to an icon + accent color (lib/event-types.ts).
-- Dates use the partial-date convention; the year is always required so
-- the timeline can order and group entries.
-- ============================================================

create table public.events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  type public.event_type not null,

  -- Auto-generated from type + person for standard events; required for 'other'.
  title text check (title is null or char_length(title) between 1 and 200),
  description text,
  location text,

  event_year int not null check (event_year between 1 and 2200),
  event_month int check (event_month between 1 and 12),
  event_day int check (event_day between 1 and 31),

  privacy public.privacy_level not null default 'family',

  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_day_requires_month check (event_day is null or event_month is not null),
  constraint custom_event_needs_title check (type <> 'other' or title is not null)
);

create index events_family_idx on public.events (family_id);
create index events_timeline_idx
  on public.events (family_id, event_year desc, event_month desc nulls last, event_day desc nulls last);
create index events_created_by_idx on public.events (created_by);

create trigger events_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

create table public.event_persons (
  event_id uuid not null references public.events (id) on delete cascade,
  person_id uuid not null references public.persons (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, person_id)
);

create index event_persons_person_idx on public.event_persons (person_id);

-- Participants must belong to the event's family.
create or replace function public.check_event_person_family()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_family uuid;
  v_person_family uuid;
begin
  select family_id into v_event_family from public.events where id = new.event_id;
  select family_id into v_person_family from public.persons where id = new.person_id;
  if v_event_family is null or v_person_family is null
     or v_event_family <> v_person_family then
    raise exception 'event participant must belong to the event family';
  end if;
  return new;
end;
$$;

create trigger event_persons_family_check
  before insert or update on public.event_persons
  for each row execute function public.check_event_person_family();
