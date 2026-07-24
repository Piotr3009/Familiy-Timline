-- ============================================================
-- Stage 2 notifications.
--
--  * Trigger-generated alongside feed items wherever a specific person
--    is the natural recipient (claims, tags, comments).
--  * birthday_reminder and adult_takeover_available are DERIVED at
--    read time by refresh_derived_notifications() (called when the
--    notification list opens) — same no-cron choice as the adulthood
--    detection, deduplicated via dedupe_key.
--  * Clients may only SELECT their own rows and UPDATE read_at.
--  * EMAIL DELIVERY (immediate for invitation_claimed, claim_approved,
--    removal_requested only) happens in the server actions that cause
--    the event — never from these triggers. Choice documented there:
--    all three trigger points already run inside a server action, so
--    inline sending with failure logging gives the same reliability an
--    outbox processed "by the action that caused it" would, with less
--    machinery; the in-app notification row is the durable record.
-- ============================================================

create type public.notification_type as enum (
  'invitation_claimed',
  'claim_approved',
  'tagged_in_photo',
  'comment_on_your_item',
  'comment_after_you',
  'birthday_reminder',
  'adult_takeover_available',
  'removal_requested'
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  family_id uuid references public.families (id) on delete cascade,
  type public.notification_type not null,
  payload jsonb not null default '{}'::jsonb,
  -- Idempotency for derived notifications (e.g. one birthday reminder
  -- per person per day); null for trigger-generated rows.
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_recipient_idx
  on public.notifications (recipient_user_id, created_at desc);
create index notifications_unread_idx
  on public.notifications (recipient_user_id)
  where read_at is null;
create unique index notifications_dedupe_unique
  on public.notifications (recipient_user_id, type, dedupe_key)
  where dedupe_key is not null;

alter table public.notifications enable row level security;

create policy "recipient reads own notifications"
  on public.notifications for select to authenticated
  using (recipient_user_id = auth.uid());

create policy "recipient marks own notifications read"
  on public.notifications for update to authenticated
  using (recipient_user_id = auth.uid())
  with check (recipient_user_id = auth.uid());

revoke insert, delete on public.notifications from authenticated, anon;
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ---------- claim notifications (invitations trigger) ----------

create or replace function public.notify_invitation_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_person persons%rowtype;
  v_payload jsonb;
begin
  select * into v_person from public.persons where id = new.person_id;
  if not found then
    return new;
  end if;
  v_payload := jsonb_build_object(
    'invitation_id', new.id,
    'person_id', v_person.id,
    'person_name', v_person.first_name || ' ' || v_person.last_name
  );

  if new.claim_status = 'pending_approval'
     and old.claim_status is distinct from 'pending_approval' then
    -- Approvers: the inviter and (if different) the profile manager.
    insert into public.notifications (recipient_user_id, family_id, type, payload)
    select distinct u, new.family_id, 'invitation_claimed'::public.notification_type, v_payload
    from unnest(array[new.invited_by, v_person.managed_by]) as approvers(u)
    where u is not null and u <> coalesce(new.claimed_by, u);
  elsif new.claim_status = 'approved'
        and old.claim_status is distinct from 'approved'
        and new.claimed_by is not null then
    insert into public.notifications (recipient_user_id, family_id, type, payload)
    values (new.claimed_by, new.family_id, 'claim_approved', v_payload);
  end if;
  return new;
end;
$$;

create trigger invitations_notify
  after update of claim_status on public.invitations
  for each row execute function public.notify_invitation_change();

-- ---------- photo tag notifications ----------

create or replace function public.notify_photo_tag()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_person persons%rowtype;
  v_photo photos%rowtype;
begin
  select * into v_person from public.persons where id = new.person_id;
  select * into v_photo from public.photos where id = new.photo_id;
  if not found or v_person.user_id is null
     or v_person.user_id = coalesce(auth.uid(), v_photo.uploaded_by) then
    return new;
  end if;
  insert into public.notifications (recipient_user_id, family_id, type, payload)
  values (
    v_person.user_id, v_photo.family_id, 'tagged_in_photo',
    jsonb_build_object('photo_id', new.photo_id, 'person_id', new.person_id)
  );
  return new;
end;
$$;

create trigger photo_persons_notify
  after insert on public.photo_persons
  for each row execute function public.notify_photo_tag();

-- ---------- comment notifications ----------

create or replace function public.notify_comment()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_payload jsonb;
begin
  if new.target_type = 'event' then
    select created_by into v_owner from public.events where id = new.target_id;
  else
    select uploaded_by into v_owner from public.photos where id = new.target_id;
  end if;
  v_payload := jsonb_build_object(
    'comment_id', new.id,
    'target_type', new.target_type,
    'target_id', new.target_id
  );

  if v_owner is not null and v_owner <> new.author_user_id then
    insert into public.notifications (recipient_user_id, family_id, type, payload)
    values (v_owner, new.family_id, 'comment_on_your_item', v_payload);
  end if;

  -- Prior commenters on the same object (not the author, not the owner).
  insert into public.notifications (recipient_user_id, family_id, type, payload)
  select distinct c.author_user_id, new.family_id, 'comment_after_you'::public.notification_type, v_payload
  from public.comments c
  where c.target_type = new.target_type
    and c.target_id = new.target_id
    and c.id <> new.id
    and c.deleted_at is null
    and c.author_user_id <> new.author_user_id
    and c.author_user_id is distinct from v_owner;
  return new;
end;
$$;

create trigger comments_notify
  after insert on public.comments
  for each row execute function public.notify_comment();

-- ---------- derived notifications (read-time) ----------

create or replace function public.refresh_derived_notifications()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  fm record;
  v_person uuid;
begin
  if auth.uid() is null then
    return;
  end if;
  for fm in
    select family_id from public.family_members where user_id = auth.uid()
  loop
    v_person := public.my_person_id(fm.family_id);

    -- Birthdays today among the caller's immediate family.
    if v_person is not null then
      insert into public.notifications
        (recipient_user_id, family_id, type, payload, dedupe_key)
      select auth.uid(), fm.family_id, 'birthday_reminder'::public.notification_type,
             jsonb_build_object(
               'person_id', p.id,
               'person_name', p.first_name || ' ' || p.last_name
             ),
             p.id::text || ':' || current_date::text
      from public.persons p
      where p.family_id = fm.family_id
        and not p.is_deceased
        and p.id <> v_person
        and p.birth_month = extract(month from current_date)::int
        and p.birth_day = extract(day from current_date)::int
        and public.is_immediate_family(v_person, p.id)
      on conflict do nothing;
    end if;

    -- Unclaimed adults the caller actively guards (once per person).
    insert into public.notifications
      (recipient_user_id, family_id, type, payload, dedupe_key)
    select auth.uid(), fm.family_id, 'adult_takeover_available'::public.notification_type,
           jsonb_build_object(
             'person_id', p.id,
             'person_name', p.first_name || ' ' || p.last_name
           ),
           p.id::text
    from public.guardianships g
    join public.persons p on p.id = g.person_id
    join public.persons gp on gp.id = g.guardian_person_id
    where g.family_id = fm.family_id
      and g.ended_at is null
      and gp.user_id = auth.uid()
      and p.user_id is null
      and not p.is_deceased
      and p.birth_year is not null
      and not public.is_minor(p.id)
    on conflict do nothing;
  end loop;
end;
$$;

revoke all on function public.refresh_derived_notifications() from public, anon;
grant execute on function public.refresh_derived_notifications() to authenticated;

-- ---------- removal requests (takeover review) ----------

-- The requester must be able to SEE the content; the owner gets an
-- in-app notification here and an immediate email from the action.
create or replace function public.request_content_removal(
  p_target_type public.comment_target,
  p_target_id uuid
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_family uuid;
  v_requester_name text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if not public.can_view_comment_target(p_target_type, p_target_id) then
    raise exception 'target_not_found' using errcode = 'P0001';
  end if;
  if p_target_type = 'event' then
    select created_by, family_id into v_owner, v_family
    from public.events where id = p_target_id;
  else
    select uploaded_by, family_id into v_owner, v_family
    from public.photos where id = p_target_id;
  end if;
  if v_owner is null then
    raise exception 'target_not_found' using errcode = 'P0001';
  end if;

  select first_name || ' ' || last_name into v_requester_name
  from public.persons
  where family_id = v_family and user_id = auth.uid();

  if v_owner <> auth.uid() then
    insert into public.notifications (recipient_user_id, family_id, type, payload, dedupe_key)
    values (
      v_owner, v_family, 'removal_requested',
      jsonb_build_object(
        'target_type', p_target_type,
        'target_id', p_target_id,
        'requester_name', coalesce(v_requester_name, '')
      ),
      -- One open request per requester+target.
      p_target_type::text || ':' || p_target_id::text || ':' || auth.uid()::text
    )
    on conflict do nothing;
  end if;

  return jsonb_build_object('owner_user_id', v_owner);
end;
$$;

revoke all on function public.request_content_removal(public.comment_target, uuid) from public, anon;
grant execute on function public.request_content_removal(public.comment_target, uuid) to authenticated;
