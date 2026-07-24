-- ============================================================
-- Stage 2 minors: minor status + the two hard rules.
--
--  * is_minor(person): computed from the partial birth date against
--    config adulthood_age. Conservative: with only a birth year (or
--    year+month) known, the LATEST possible birthday is assumed, so a
--    person stays "minor" until they are certainly an adult. Profiles
--    without a birth year are treated as adults (spec). Deceased
--    profiles are never minors for this mechanism.
--    Mirrored in lib/persons/minors.ts — keep the two in sync.
--  * HARD RULE 1: a minor's profile can never be more visible than
--    'family'. All three current privacy levels satisfy this (family is
--    the widest), so the trigger is a whitelist that blocks any wider
--    level a future migration might add.
--  * HARD RULE 2: no invitations for minors — enforced in
--    create_invitation (and mirrored in the UI).
-- ============================================================

create or replace function public.is_minor(p_person uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when p.birth_year is null or p.is_deceased then false
    else (
      (extract(year from current_date)::int - p.birth_year)
      - case
          when (extract(month from current_date)::int, extract(day from current_date)::int)
             < (coalesce(p.birth_month, 12), coalesce(p.birth_day, 31))
          then 1 else 0
        end
    ) < public.config_int('adulthood_age')
  end
  from public.persons p
  where p.id = p_person;
$$;

revoke all on function public.is_minor(uuid) from public, anon;
grant execute on function public.is_minor(uuid) to authenticated;

-- HARD RULE 1: visibility cap. Whitelist so any future, wider privacy
-- level is rejected for minors even before app code learns about it.
create or replace function public.check_minor_privacy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.birth_year is not null
     and not new.is_deceased
     and new.life_details_privacy not in ('private', 'immediate_family', 'family')
     and (
       (extract(year from current_date)::int - new.birth_year)
       - case
           when (extract(month from current_date)::int, extract(day from current_date)::int)
              < (coalesce(new.birth_month, 12), coalesce(new.birth_day, 31))
           then 1 else 0
         end
     ) < public.config_int('adulthood_age') then
    raise exception 'minor_privacy_capped' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger persons_minor_privacy_check
  before insert or update of life_details_privacy, birth_year, birth_month, birth_day
  on public.persons
  for each row execute function public.check_minor_privacy();

-- HARD RULE 2: create_invitation refuses minors (in addition to the
-- deceased/claimed checks). Full function body restated — CREATE OR
-- REPLACE in a NEW migration; 20260724000013 stays untouched.
create or replace function public.create_invitation(
  p_person_id uuid,
  p_token text,
  p_email text default null
)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_person persons%rowtype;
  v_id uuid := gen_random_uuid();
  v_expires timestamptz;
  v_token_hash text := encode(digest(p_token, 'sha256'), 'hex');
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select * into v_person from public.persons where id = p_person_id;
  if not found then
    raise exception 'person_not_found' using errcode = 'P0001';
  end if;
  if not public.is_family_member(v_person.family_id) then
    raise exception 'not_a_family_member' using errcode = 'P0001';
  end if;
  if v_person.user_id is not null then
    raise exception 'person_already_claimed' using errcode = 'P0001';
  end if;
  if v_person.is_deceased then
    raise exception 'person_deceased' using errcode = 'P0001';
  end if;
  if public.is_minor(p_person_id) then
    raise exception 'person_is_minor' using errcode = 'P0001';
  end if;

  perform public.consume_rate_limit(
    'invite_create', auth.uid()::text,
    public.config_int('max_invites_per_user_day'), interval '1 day'
  );

  v_expires := now() + make_interval(days => public.config_int('invite_validity_days'));

  insert into public.invitations (
    id, family_id, person_id, invited_by, email, token_hash, expires_at
  )
  values (
    v_id, v_person.family_id, p_person_id, auth.uid(), p_email,
    v_token_hash, v_expires
  );

  update public.invitations
  set status = 'revoked', superseded_by = v_id
  where person_id = p_person_id
    and id <> v_id
    and status in ('pending', 'opened');

  return jsonb_build_object('invitation_id', v_id, 'expires_at', v_expires);
end;
$$;

revoke all on function public.create_invitation(uuid, text, text) from public, anon;
grant execute on function public.create_invitation(uuid, text, text) to authenticated;
