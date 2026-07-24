-- ============================================================
-- Stage 2 comments — one polymorphic table for events and photos.
--
--  * Visibility follows the TARGET object (same principle as the feed):
--    you may read/write comments only where you may see the object.
--  * Author may edit within comment_edit_window_min (config) minutes;
--    after that comments are immutable (history integrity).
--  * Deletion is SOFT (deleted_at) via the delete_comment function:
--    the author anytime for their own, family admins for any.
--  * parent_id exists for future threading; Stage 2 UI ignores it.
-- ============================================================

create type public.comment_target as enum ('event', 'photo');

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  target_type public.comment_target not null,
  target_id uuid not null,
  author_user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  parent_id uuid references public.comments (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index comments_target_idx
  on public.comments (target_type, target_id, created_at);
create index comments_family_idx on public.comments (family_id);

create trigger comments_updated_at
  before update on public.comments
  for each row execute function public.set_updated_at();

-- Body length from config; family + target coherence.
create or replace function public.check_comment()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_target_family uuid;
begin
  if char_length(new.body) < 1
     or char_length(new.body) > public.config_int('max_comment_length') then
    raise exception 'comment_too_long' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    if new.target_type = 'event' then
      select family_id into v_target_family from public.events where id = new.target_id;
    else
      select family_id into v_target_family from public.photos where id = new.target_id;
    end if;
    if v_target_family is null then
      raise exception 'comment_target_not_found' using errcode = 'P0001';
    end if;
    new.family_id := v_target_family;
  end if;
  return new;
end;
$$;

create trigger comments_check
  before insert or update of body on public.comments
  for each row execute function public.check_comment();

create or replace function public.can_view_comment_target(
  p_type public.comment_target,
  p_id uuid
)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case p_type
    when 'event' then public.can_view_event(p_id)
    else public.can_view_photo(p_id)
  end;
$$;

revoke all on function public.can_view_comment_target(public.comment_target, uuid) from public, anon;
grant execute on function public.can_view_comment_target(public.comment_target, uuid) to authenticated;

-- ---------- RLS ----------

alter table public.comments enable row level security;

create policy "comments follow target visibility"
  on public.comments for select to authenticated
  using (
    public.is_family_member(family_id)
    and public.can_view_comment_target(target_type, target_id)
  );

create policy "members comment where they can see"
  on public.comments for insert to authenticated
  with check (
    author_user_id = auth.uid()
    and public.is_family_member(family_id)
    and public.can_view_comment_target(target_type, target_id)
  );

-- Author edit inside the window; immutable afterwards. Only the body is
-- writable (column grant) — soft delete goes through delete_comment.
create policy "author edits own comment within the window"
  on public.comments for update to authenticated
  using (
    author_user_id = auth.uid()
    and deleted_at is null
    and created_at > now() - make_interval(
      mins => public.config_int('comment_edit_window_min'))
  )
  with check (author_user_id = auth.uid());
-- No delete policy: rows are never hard-deleted by clients.

revoke update on public.comments from authenticated;
grant update (body) on public.comments to authenticated;
revoke delete on public.comments from authenticated, anon;

-- Soft delete: author (own) anytime, family admin (any).
create or replace function public.delete_comment(p_comment uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v comments%rowtype;
begin
  select * into v from public.comments where id = p_comment for update;
  if not found or v.deleted_at is not null then
    raise exception 'comment_not_found' using errcode = 'P0001';
  end if;
  if v.author_user_id <> auth.uid() and not public.is_family_admin(v.family_id) then
    raise exception 'not_allowed_to_delete_comment' using errcode = 'P0001';
  end if;
  update public.comments set deleted_at = now() where id = p_comment;
end;
$$;

revoke all on function public.delete_comment(uuid) from public, anon;
grant execute on function public.delete_comment(uuid) to authenticated;

-- ---------- feed integration ----------

create or replace function public.feed_comment_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.feed_items (family_id, type, actor_user_id, target_table, target_id)
    values (new.family_id, 'comment_added', new.author_user_id, 'comments', new.id);
    return new;
  elsif tg_op = 'UPDATE' then
    if old.deleted_at is null and new.deleted_at is not null then
      delete from public.feed_items
      where target_table = 'comments' and target_id = new.id;
    end if;
    return new;
  else
    delete from public.feed_items
    where target_table = 'comments' and target_id = old.id;
    return old;
  end if;
end;
$$;

create trigger comments_feed
  after insert or update of deleted_at or delete on public.comments
  for each row execute function public.feed_comment_change();

-- comment_added branch of the feed visibility check (full restatement).
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
      return exists (
        select 1
        from jsonb_array_elements_text(p_payload -> 'photo_ids') as ids(pid)
        where public.can_view_photo(public.try_uuid(ids.pid))
      );
    when 'event_added' then
      return public.can_view_event(p_target_id);
    when 'person_added', 'person_claimed' then
      return exists (select 1 from public.persons where id = p_target_id);
    when 'relationship_added', 'relationship_ended' then
      return exists (select 1 from public.relationships where id = p_target_id);
    when 'comment_added' then
      return exists (
        select 1 from public.comments c
        where c.id = p_target_id
          and c.deleted_at is null
          and public.can_view_comment_target(c.target_type, c.target_id)
      );
    else
      return false;
  end case;
end;
$$;
