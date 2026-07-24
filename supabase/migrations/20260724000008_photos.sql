-- ============================================================
-- Photos & videos (one table, kind discriminator).
-- Files live in the private 'media' storage bucket under
--   <family_id>/<photo_id>/{original|preview|thumb}.<ext>
-- and are served exclusively through short-lived signed URLs.
-- Per-user quotas come from public.config and are enforced BOTH in the
-- upload path and by the trigger below (DB is the source of truth).
-- ============================================================

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  uploaded_by uuid not null references auth.users (id),
  kind public.media_kind not null default 'photo',

  storage_path_original text not null,
  storage_path_preview text,
  storage_path_thumb text,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  duration_seconds numeric check (duration_seconds is null or duration_seconds > 0),
  width int,
  height int,

  taken_year int check (taken_year between 1 and 2200),
  taken_month int check (taken_month between 1 and 12),
  taken_day int check (taken_day between 1 and 31),
  location text,
  description text,
  event_id uuid references public.events (id) on delete set null,

  privacy public.privacy_level not null default 'family',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint taken_day_requires_month check (taken_day is null or taken_month is not null),
  constraint taken_month_requires_year check (taken_month is null or taken_year is not null),
  constraint video_has_duration check (kind <> 'video' or duration_seconds is not null)
);

create index photos_family_idx on public.photos (family_id);
create index photos_uploader_idx on public.photos (uploaded_by);
create index photos_event_idx on public.photos (event_id);
create index photos_recent_idx on public.photos (family_id, created_at desc);

create trigger photos_updated_at
  before update on public.photos
  for each row execute function public.set_updated_at();

-- Quota + size enforcement from public.config. RLS checks who may
-- insert; this trigger checks how much.
create or replace function public.check_media_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max_files int;
  v_max_size_mb int;
  v_max_duration int;
  v_count int;
begin
  if new.kind = 'photo' then
    v_max_files := public.config_int('max_photos_per_user');
    v_max_size_mb := public.config_int('max_photo_file_size_mb');
  else
    v_max_files := public.config_int('max_videos_per_user');
    v_max_size_mb := public.config_int('max_video_file_size_mb');
    v_max_duration := public.config_int('max_video_duration_sec');
    if new.duration_seconds > v_max_duration then
      raise exception 'video_duration_exceeded' using errcode = 'P0001';
    end if;
  end if;

  if new.file_size_bytes > v_max_size_mb::bigint * 1024 * 1024 then
    raise exception 'file_size_exceeded' using errcode = 'P0001';
  end if;

  select count(*) into v_count
  from public.photos
  where uploaded_by = new.uploaded_by and kind = new.kind;

  if v_count >= v_max_files then
    raise exception 'media_quota_exceeded' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger photos_quota_check
  before insert on public.photos
  for each row execute function public.check_media_quota();

create table public.photo_persons (
  photo_id uuid not null references public.photos (id) on delete cascade,
  person_id uuid not null references public.persons (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (photo_id, person_id)
);

create index photo_persons_person_idx on public.photo_persons (person_id);

-- Tagged persons must belong to the photo's family.
create or replace function public.check_photo_person_family()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photo_family uuid;
  v_person_family uuid;
begin
  select family_id into v_photo_family from public.photos where id = new.photo_id;
  select family_id into v_person_family from public.persons where id = new.person_id;
  if v_photo_family is null or v_person_family is null
     or v_photo_family <> v_person_family then
    raise exception 'tagged person must belong to the photo family';
  end if;
  return new;
end;
$$;

create trigger photo_persons_family_check
  before insert or update on public.photo_persons
  for each row execute function public.check_photo_person_family();
