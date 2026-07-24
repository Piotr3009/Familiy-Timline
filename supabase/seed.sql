-- ============================================================
-- Development seed — runs on `supabase db reset` (local only).
-- Creates a demo account and a 3-generation family:
--
--   demo@familytimeline.app / demo1234  (claimed profile: Piotr)
--
--   Jan+Maria Kowalski        Henryk(+)  Zofia Wiśniewski
--          |                        |
--   Piotr ——— married ——— Anna      |  (Anna is Henryk & Zofia's daughter)
--   Katarzyna (Piotr's sister)
--          |
--   Julia (2005), Tomasz (2008)
--
-- Photos are not seeded because storage objects cannot be created
-- from SQL — upload some via the UI after signing in.
-- ============================================================

-- Demo auth user -----------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token,
  email_change, email_change_token_new, email_change_token_current
) values (
  '00000000-0000-0000-0000-000000000000',
  'd0000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated',
  'demo@familytimeline.app',
  crypt('demo1234', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(), now(), '', '', '', '', ''
);

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(),
  'd0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'sub', 'd0000000-0000-4000-8000-000000000001',
    'email', 'demo@familytimeline.app',
    'email_verified', true
  ),
  'email', now(), now(), now()
);

-- Family and membership ---------------------------------------------
insert into public.families (id, name, created_by) values
  ('f0000000-0000-4000-8000-000000000001', 'Kowalski Family',
   'd0000000-0000-4000-8000-000000000001');

insert into public.family_members (family_id, user_id, role) values
  ('f0000000-0000-4000-8000-000000000001',
   'd0000000-0000-4000-8000-000000000001', 'admin');

-- Persons ------------------------------------------------------------
-- Shorthand: family f1, demo user d1 manages every unclaimed profile.
insert into public.persons (
  id, family_id, user_id, managed_by, created_by,
  first_name, last_name, maiden_name, gender,
  birth_year, birth_month, birth_day, birth_place,
  death_year, death_month, death_day, death_place, is_deceased, bio
) values
  -- Generation 2: the demo user (claimed)
  ('a0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
   'd0000000-0000-4000-8000-000000000001', null, 'd0000000-0000-4000-8000-000000000001',
   'Piotr', 'Kowalski', null, 'male', 1975, 3, 14, 'Warsaw, Poland',
   null, null, null, null, false, 'Family historian and keeper of old photographs.'),
  ('a0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001',
   null, 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'Anna', 'Kowalska', 'Wiśniewska', 'female', 1978, 7, null, 'Kraków, Poland',
   null, null, null, null, false, null),
  ('a0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000001',
   null, 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'Katarzyna', 'Zielińska', 'Kowalska', 'female', 1980, null, null, 'Warsaw, Poland',
   null, null, null, null, false, null),
  -- Generation 1: grandparents
  ('a0000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000001',
   null, 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'Jan', 'Kowalski', null, 'male', 1948, 11, 2, 'Lublin, Poland',
   null, null, null, null, false, null),
  ('a0000000-0000-4000-8000-000000000005', 'f0000000-0000-4000-8000-000000000001',
   null, 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'Maria', 'Kowalska', 'Nowak', 'female', 1950, null, null, 'Lublin, Poland',
   null, null, null, null, false, null),
  ('a0000000-0000-4000-8000-000000000006', 'f0000000-0000-4000-8000-000000000001',
   null, 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'Henryk', 'Wiśniewski', null, 'male', 1945, null, null, 'Kraków, Poland',
   2020, 4, 18, 'Kraków, Poland', true, null),
  ('a0000000-0000-4000-8000-000000000007', 'f0000000-0000-4000-8000-000000000001',
   null, 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'Zofia', 'Wiśniewska', 'Dąbrowska', 'female', 1952, 2, 27, 'Kraków, Poland',
   null, null, null, null, false, null),
  -- Generation 3: children
  ('a0000000-0000-4000-8000-000000000008', 'f0000000-0000-4000-8000-000000000001',
   null, 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'Julia', 'Kowalska', null, 'female', 2005, 6, 12, 'Warsaw, Poland',
   null, null, null, null, false, null),
  ('a0000000-0000-4000-8000-000000000009', 'f0000000-0000-4000-8000-000000000001',
   null, 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'Tomasz', 'Kowalski', null, 'male', 2008, 1, 30, 'Warsaw, Poland',
   null, null, null, null, false, null);

-- Relationships ------------------------------------------------------
insert into public.relationships (
  family_id, person_a_id, person_b_id, type, parent_role, status,
  wedding_date, created_by
) values
  -- partners
  ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000002', 'partner', null, 'married',
   '2003-06-21', 'd0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004',
   'a0000000-0000-4000-8000-000000000005', 'partner', null, 'married',
   '1972-09-09', 'd0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006',
   'a0000000-0000-4000-8000-000000000007', 'partner', null, 'widowed',
   '1976-05-15', 'd0000000-0000-4000-8000-000000000001'),
  -- parent_child (a = parent, b = child)
  ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004',
   'a0000000-0000-4000-8000-000000000001', 'parent_child', 'biological', null,
   null, 'd0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005',
   'a0000000-0000-4000-8000-000000000001', 'parent_child', 'biological', null,
   null, 'd0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004',
   'a0000000-0000-4000-8000-000000000003', 'parent_child', 'biological', null,
   null, 'd0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005',
   'a0000000-0000-4000-8000-000000000003', 'parent_child', 'biological', null,
   null, 'd0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006',
   'a0000000-0000-4000-8000-000000000002', 'parent_child', 'biological', null,
   null, 'd0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000007',
   'a0000000-0000-4000-8000-000000000002', 'parent_child', 'biological', null,
   null, 'd0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000008', 'parent_child', 'biological', null,
   null, 'd0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002',
   'a0000000-0000-4000-8000-000000000008', 'parent_child', 'biological', null,
   null, 'd0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000009', 'parent_child', 'biological', null,
   null, 'd0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002',
   'a0000000-0000-4000-8000-000000000009', 'parent_child', 'biological', null,
   null, 'd0000000-0000-4000-8000-000000000001');

-- Events -------------------------------------------------------------
insert into public.events (
  id, family_id, type, title, description, location,
  event_year, event_month, event_day, privacy, created_by
) values
  ('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
   'wedding', null, 'A sunny June wedding in the old town.', 'Warsaw, Poland',
   2003, 6, 21, 'family', 'd0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001',
   'wedding', null, null, 'Lublin, Poland',
   1972, null, null, 'family', 'd0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000001',
   'birth', null, null, 'Warsaw, Poland',
   2005, 6, 12, 'family', 'd0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000001',
   'birth', null, null, 'Warsaw, Poland',
   2008, 1, 30, 'family', 'd0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000005', 'f0000000-0000-4000-8000-000000000001',
   'family_gathering', 'Christmas at the grandparents', 'The whole family together again.',
   'Lublin, Poland', 2024, 12, 24, 'family', 'd0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000006', 'f0000000-0000-4000-8000-000000000001',
   'death', null, null, 'Kraków, Poland',
   2020, 4, 18, 'family', 'd0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000007', 'f0000000-0000-4000-8000-000000000001',
   'emigration', null, 'Moved abroad for work, came back two years later.', 'London, UK',
   1998, 9, null, 'family', 'd0000000-0000-4000-8000-000000000001');

insert into public.event_persons (event_id, person_id) values
  ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002'),
  ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000004'),
  ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000005'),
  ('e0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000008'),
  ('e0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000009'),
  ('e0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000002'),
  ('e0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000004'),
  ('e0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000005'),
  ('e0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000008'),
  ('e0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000009'),
  ('e0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000006'),
  ('e0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001');
