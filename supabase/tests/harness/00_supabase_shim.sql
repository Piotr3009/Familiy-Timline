-- ============================================================
-- Test harness: minimal emulation of the Supabase runtime on plain
-- PostgreSQL, so migrations + RLS tests run locally and in CI without
-- a full Supabase stack. NOT used in production.
--
-- Emulates: anon/authenticated/service_role roles, auth.users,
-- auth.identities, auth.uid(), storage.buckets/objects/foldername(),
-- and Supabase's default privilege grants.
-- ============================================================

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;

-- Supabase grants table/sequence/function privileges by default; RLS is
-- what actually restricts access. Replicate via default privileges so
-- objects created by the migrations pick them up.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

-- auth schema ------------------------------------------------------

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  instance_id uuid,
  id uuid primary key,
  aud text,
  role text,
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  confirmation_token text,
  recovery_token text,
  email_change text,
  email_change_token_new text,
  email_change_token_current text
);

create table auth.identities (
  id uuid primary key,
  user_id uuid references auth.users (id) on delete cascade,
  provider_id text,
  identity_data jsonb,
  provider text,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
);

-- Same resolution logic as Supabase: the JWT "sub" claim.
create or replace function auth.uid()
returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;

-- storage schema ---------------------------------------------------

create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  created_at timestamptz not null default now()
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

grant all on storage.buckets to anon, authenticated, service_role;
grant all on storage.objects to anon, authenticated, service_role;

create or replace function storage.foldername(name text)
returns text[]
language sql immutable
as $$
  select (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1];
$$;

grant execute on function storage.foldername(text) to anon, authenticated, service_role;
