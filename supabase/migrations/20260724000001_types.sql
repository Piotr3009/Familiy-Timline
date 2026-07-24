-- ============================================================
-- Family Timeline — enums and extensions
--
-- PARTIAL DATE CONVENTION (used by persons, events, photos):
-- dates that may be only partially known are stored as three
-- integer columns: <field>_year, <field>_month, <field>_day.
-- Rules, enforced by CHECK constraints on each table:
--   * day requires month, month requires year;
--   * "1969"      -> year=1969, month=null, day=null
--   * "05.1969"   -> year=1969, month=5,    day=null
--   * "07.05.1969"-> year=1969, month=5,    day=7
-- Display formatting (dd.mm.yyyy) lives in lib/dates.ts.
-- ============================================================

create extension if not exists pgcrypto;

-- Values are stable English keys; UI translates them via i18n.
create type public.gender as enum ('male', 'female', 'other', 'unspecified');

create type public.relationship_type as enum ('partner', 'parent_child', 'sibling');

-- For parent_child relationships: person_a = parent, person_b = child.
create type public.parent_role as enum
  ('biological', 'adoptive', 'step', 'foster', 'legal_guardian');

create type public.partner_status as enum
  ('partners', 'married', 'separated', 'divorced', 'former_partner', 'widowed');

-- Extensible: later stages add generation-based levels with
-- ALTER TYPE public.privacy_level ADD VALUE '...'.
create type public.privacy_level as enum ('private', 'immediate_family', 'family');

create type public.invitation_status as enum
  ('pending', 'opened', 'claimed', 'expired', 'revoked');

create type public.claim_status as enum ('pending_approval', 'approved', 'rejected');

create type public.event_type as enum (
  'birth', 'baptism', 'first_communion', 'school_graduation', 'university',
  'wedding', 'divorce', 'moving_home', 'home_purchase', 'emigration',
  'job_start', 'business_start', 'child_birth', 'family_gathering',
  'anniversary', 'death', 'funeral', 'achievement', 'travel', 'other'
);

create type public.media_kind as enum ('photo', 'video');

create type public.report_status as enum ('open', 'resolved', 'dismissed');

create type public.family_role as enum ('admin', 'member');

-- Shared trigger to maintain updated_at on every table.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
