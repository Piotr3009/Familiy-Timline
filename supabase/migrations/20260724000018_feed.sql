-- ============================================================
-- Stage 2 family feed.
--
-- feed_items rows are written ONLY by database triggers, so the feed
-- stays consistent no matter which code path wrote the data. Privacy is
-- enforced by RLS re-checking the TARGET object's visibility on every
-- read — a private photo never produces a visible feed item for anyone
-- but its owner, and items disappear when their target is deleted.
--
-- birthday_today / anniversary_today exist in the enum for payload
-- stability but are generated at READ time from the celebrations logic
-- (no nightly writer); they are never stored.
--
-- The feed starts empty on existing databases (no backfill) and grows
-- with activity from the moment this migration is applied.
-- ============================================================

create type public.feed_item_type as enum (
  'person_added',
  'person_claimed',
  'photo_added',
  'event_added',
  'relationship_added',
  'relationship_ended',
  'comment_added',
  'birthday_today',
  'anniversary_today'
);

insert into public.config (key, value, description) values
  ('feed_photo_batch_window_min', '15',
   'Minutes within which photos by the same uploader group into one feed item')
on conflict (key) do nothing;

create table public.feed_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  type public.feed_item_type not null,
  actor_user_id uuid,
  target_table text,
  target_id uuid,
  -- Small render payload; photo_added keeps {photo_ids: [uuid, ...]}.
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index feed_items_family_idx on public.feed_items (family_id, created_at desc);
create index feed_items_target_idx on public.feed_items (target_table, target_id);

create trigger feed_items_updated_at
  before update on public.feed_items
  for each row execute function public.set_updated_at();

-- ---------- visibility ----------
-- One definer function so the comments migration can extend the
-- comment_added branch without touching the policy.

create or replace function public.can_view_feed_item(
  p_type public.feed_item_type,
  p_target_table text,
  p_target_id uuid,
  p_payload jsonb,
  p_family uuid
)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_family_member(p_family) then
    return false;
  end if;
  case p_type
    when 'photo_added' then
      -- Visible when at least ONE photo of the batch is visible; the
      -- renderer shows only the visible subset.
      return exists (
        select 1
        from jsonb_array_elements_text(p_payload -> 'photo_ids') as ids(pid)
        where public.can_view_photo(public.try_uuid(ids.pid))
      );
    when 'event_added' then
      return public.can_view_event(p_target_id);
    when 'person_added', 'person_claimed' then
      -- Person rows are family-visible basic info; hide when deleted.
      return exists (select 1 from public.persons where id = p_target_id);
    when 'relationship_added', 'relationship_ended' then
      return exists (select 1 from public.relationships where id = p_target_id);
    else
      -- comment_added gets its branch in the comments migration;
      -- birthday/anniversary items are never stored.
      return false;
  end case;
end;
$$;

revoke all on function public.can_view_feed_item(public.feed_item_type, text, uuid, jsonb, uuid) from public, anon;
grant execute on function public.can_view_feed_item(public.feed_item_type, text, uuid, jsonb, uuid) to authenticated;

alter table public.feed_items enable row level security;

create policy "feed items follow target visibility"
  on public.feed_items for select to authenticated
  using (public.can_view_feed_item(type, target_table, target_id, payload, family_id));
-- Writes: triggers only.

revoke insert, update, delete on public.feed_items from authenticated, anon;

-- ---------- triggers ----------

create or replace function public.feed_person_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.feed_items (family_id, type, actor_user_id, target_table, target_id)
    values (new.family_id, 'person_added', coalesce(auth.uid(), new.created_by),
            'persons', new.id);
    return new;
  elsif tg_op = 'UPDATE' then
    if old.user_id is null and new.user_id is not null then
      insert into public.feed_items (family_id, type, actor_user_id, target_table, target_id)
      values (new.family_id, 'person_claimed', new.user_id, 'persons', new.id);
    end if;
    return new;
  else
    delete from public.feed_items where target_table = 'persons' and target_id = old.id;
    return old;
  end if;
end;
$$;

create trigger persons_feed
  after insert or update of user_id or delete on public.persons
  for each row execute function public.feed_person_change();

create or replace function public.feed_event_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.feed_items (family_id, type, actor_user_id, target_table, target_id)
    values (new.family_id, 'event_added', coalesce(auth.uid(), new.created_by),
            'events', new.id);
    return new;
  else
    delete from public.feed_items where target_table = 'events' and target_id = old.id;
    return old;
  end if;
end;
$$;

create trigger events_feed
  after insert or delete on public.events
  for each row execute function public.feed_event_change();

-- Photos batch: uploads by the same user within the config window merge
-- into one item; the item keeps its original timestamp.
create or replace function public.feed_photo_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_window int := coalesce(public.config_int('feed_photo_batch_window_min'), 15);
  v_item public.feed_items%rowtype;
begin
  if tg_op = 'INSERT' then
    select * into v_item
    from public.feed_items
    where family_id = new.family_id
      and type = 'photo_added'
      and actor_user_id = new.uploaded_by
      and created_at > now() - make_interval(mins => v_window)
    order by created_at desc
    limit 1
    for update;
    if found then
      update public.feed_items
      set payload = jsonb_set(
            v_item.payload, '{photo_ids}',
            (v_item.payload -> 'photo_ids') || to_jsonb(new.id::text)
          )
      where id = v_item.id;
    else
      insert into public.feed_items (family_id, type, actor_user_id, target_table, target_id, payload)
      values (new.family_id, 'photo_added', new.uploaded_by, 'photos', new.id,
              jsonb_build_object('photo_ids', jsonb_build_array(new.id::text)));
    end if;
    return new;
  else
    -- Remove the id from any batch; drop items whose batch became empty.
    update public.feed_items
    set payload = jsonb_set(
          payload, '{photo_ids}',
          coalesce(
            (select jsonb_agg(value)
             from jsonb_array_elements_text(payload -> 'photo_ids') as ids(value)
             where value <> old.id::text),
            '[]'::jsonb
          )
        )
    where type = 'photo_added'
      and family_id = old.family_id
      and payload -> 'photo_ids' ? old.id::text;
    delete from public.feed_items
    where type = 'photo_added'
      and family_id = old.family_id
      and payload -> 'photo_ids' = '[]'::jsonb;
    return old;
  end if;
end;
$$;

create trigger photos_feed
  after insert or delete on public.photos
  for each row execute function public.feed_photo_change();

create or replace function public.feed_relationship_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.type = 'partner' then
      insert into public.feed_items (family_id, type, actor_user_id, target_table, target_id, payload)
      values (new.family_id, 'relationship_added', coalesce(auth.uid(), new.created_by),
              'relationships', new.id, jsonb_build_object('status', new.status));
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if new.type = 'partner'
       and old.status in ('partners', 'married', 'widowed')
       and new.status in ('separated', 'divorced', 'former_partner') then
      insert into public.feed_items (family_id, type, actor_user_id, target_table, target_id, payload)
      values (new.family_id, 'relationship_ended', auth.uid(),
              'relationships', new.id, jsonb_build_object('status', new.status));
    end if;
    return new;
  else
    delete from public.feed_items
    where target_table = 'relationships' and target_id = old.id;
    return old;
  end if;
end;
$$;

create trigger relationships_feed
  after insert or update of status or delete on public.relationships
  for each row execute function public.feed_relationship_change();
