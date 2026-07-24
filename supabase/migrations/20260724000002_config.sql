-- ============================================================
-- Global configuration — all product limits live here, never in code.
-- Values are JSONB so numbers and future structured settings both fit.
-- Editable only by the service role (Supabase dashboard / SQL editor);
-- readable by any signed-in user so clients can apply limits in the UI.
-- ============================================================

create table public.config (
  key text primary key,
  value jsonb not null,
  description text not null,
  updated_at timestamptz not null default now()
);

create trigger config_updated_at
  before update on public.config
  for each row execute function public.set_updated_at();

insert into public.config (key, value, description) values
  ('max_photo_file_size_mb',   '10',  'Maximum photo file size in megabytes'),
  ('max_photos_per_user',      '500', 'Maximum number of photos a user may upload'),
  ('max_video_file_size_mb',   '200', 'Maximum video file size in megabytes'),
  ('max_video_duration_sec',   '180', 'Maximum video duration in seconds'),
  ('max_videos_per_user',      '10',  'Maximum number of videos a user may upload'),
  ('invite_validity_days',     '30',  'Days an invitation link stays valid'),
  ('max_invites_per_user_day', '20',  'Maximum invitations a user may create per day'),
  ('invite_lookup_per_hour',   '120', 'Maximum invite-link lookups per hour per IP');

-- Typed accessor used by triggers and functions.
create or replace function public.config_int(p_key text)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select (value #>> '{}')::int from public.config where key = p_key;
$$;

alter table public.config enable row level security;

create policy "config is readable by signed-in users"
  on public.config for select
  to authenticated
  using (true);
-- No insert/update/delete policies: only the service role may write.
