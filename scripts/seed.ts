/**
 * Seeds a demo family into a REMOTE Supabase project (hosted dev/staging)
 * using the service role key. For LOCAL development prefer
 * `supabase db reset`, which applies supabase/seed.sql automatically.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed
 *
 * Idempotent-ish: refuses to run if the demo user already exists.
 */
import {createClient} from '@supabase/supabase-js';
import type {Database} from '../lib/database.types';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.');
  process.exit(1);
}

const admin = createClient<Database>(url, serviceKey, {
  auth: {autoRefreshToken: false, persistSession: false}
});

const DEMO_EMAIL = 'demo@familytimeline.app';
const DEMO_PASSWORD = 'demo1234';

async function main() {
  const {data: created, error: userError} = await admin.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true
  });
  if (userError || !created.user) {
    console.error(`Could not create ${DEMO_EMAIL} — already seeded?`, userError?.message);
    process.exit(1);
  }
  const userId = created.user.id;

  const {data: family, error: familyError} = await admin
    .from('families')
    .insert({name: 'Kowalski Family', created_by: userId})
    .select('id')
    .single();
  if (familyError || !family) throw familyError;
  const familyId = family.id;

  await admin.from('family_members').insert({family_id: familyId, user_id: userId, role: 'admin'});

  type PersonSeed = {
    key: string;
    first: string;
    last: string;
    maiden?: string;
    gender: 'male' | 'female';
    birth: [number, number | null, number | null];
    birthPlace: string;
    death?: [number, number, number];
    deathPlace?: string;
    claimed?: boolean;
    bio?: string;
  };
  const personSeeds: PersonSeed[] = [
    {key: 'piotr', first: 'Piotr', last: 'Kowalski', gender: 'male', birth: [1975, 3, 14], birthPlace: 'Warsaw, Poland', claimed: true, bio: 'Family historian and keeper of old photographs.'},
    {key: 'anna', first: 'Anna', last: 'Kowalska', maiden: 'Wiśniewska', gender: 'female', birth: [1978, 7, null], birthPlace: 'Kraków, Poland'},
    {key: 'katarzyna', first: 'Katarzyna', last: 'Zielińska', maiden: 'Kowalska', gender: 'female', birth: [1980, null, null], birthPlace: 'Warsaw, Poland'},
    {key: 'jan', first: 'Jan', last: 'Kowalski', gender: 'male', birth: [1948, 11, 2], birthPlace: 'Lublin, Poland'},
    {key: 'maria', first: 'Maria', last: 'Kowalska', maiden: 'Nowak', gender: 'female', birth: [1950, null, null], birthPlace: 'Lublin, Poland'},
    {key: 'henryk', first: 'Henryk', last: 'Wiśniewski', gender: 'male', birth: [1945, null, null], birthPlace: 'Kraków, Poland', death: [2020, 4, 18], deathPlace: 'Kraków, Poland'},
    {key: 'zofia', first: 'Zofia', last: 'Wiśniewska', maiden: 'Dąbrowska', gender: 'female', birth: [1952, 2, 27], birthPlace: 'Kraków, Poland'},
    {key: 'julia', first: 'Julia', last: 'Kowalska', gender: 'female', birth: [2005, 6, 12], birthPlace: 'Warsaw, Poland'},
    {key: 'tomasz', first: 'Tomasz', last: 'Kowalski', gender: 'male', birth: [2008, 1, 30], birthPlace: 'Warsaw, Poland'}
  ];

  const ids = new Map<string, string>();
  for (const seed of personSeeds) {
    const {data: person, error} = await admin
      .from('persons')
      .insert({
        family_id: familyId,
        user_id: seed.claimed ? userId : null,
        managed_by: seed.claimed ? null : userId,
        created_by: userId,
        first_name: seed.first,
        last_name: seed.last,
        maiden_name: seed.maiden ?? null,
        gender: seed.gender,
        birth_year: seed.birth[0],
        birth_month: seed.birth[1],
        birth_day: seed.birth[2],
        birth_place: seed.birthPlace,
        is_deceased: Boolean(seed.death),
        death_year: seed.death?.[0] ?? null,
        death_month: seed.death?.[1] ?? null,
        death_day: seed.death?.[2] ?? null,
        death_place: seed.deathPlace ?? null,
        bio: seed.bio ?? null
      })
      .select('id')
      .single();
    if (error || !person) throw error;
    ids.set(seed.key, person.id);
  }
  const id = (key: string) => ids.get(key)!;

  const partner = (a: string, b: string, status: 'married' | 'widowed', wedding: string) => ({
    family_id: familyId, person_a_id: id(a), person_b_id: id(b),
    type: 'partner' as const, status, wedding_date: wedding, created_by: userId
  });
  const parent = (a: string, b: string) => ({
    family_id: familyId, person_a_id: id(a), person_b_id: id(b),
    type: 'parent_child' as const, parent_role: 'biological' as const, created_by: userId
  });
  const {error: relError} = await admin.from('relationships').insert([
    partner('piotr', 'anna', 'married', '2003-06-21'),
    partner('jan', 'maria', 'married', '1972-09-09'),
    partner('henryk', 'zofia', 'widowed', '1976-05-15'),
    parent('jan', 'piotr'), parent('maria', 'piotr'),
    parent('jan', 'katarzyna'), parent('maria', 'katarzyna'),
    parent('henryk', 'anna'), parent('zofia', 'anna'),
    parent('piotr', 'julia'), parent('anna', 'julia'),
    parent('piotr', 'tomasz'), parent('anna', 'tomasz')
  ]);
  if (relError) throw relError;

  type EventSeed = {
    type: Database['public']['Enums']['event_type'];
    title?: string;
    description?: string;
    location: string;
    date: [number, number | null, number | null];
    participants: string[];
  };
  const eventSeeds: EventSeed[] = [
    {type: 'wedding', description: 'A sunny June wedding in the old town.', location: 'Warsaw, Poland', date: [2003, 6, 21], participants: ['piotr', 'anna']},
    {type: 'wedding', location: 'Lublin, Poland', date: [1972, null, null], participants: ['jan', 'maria']},
    {type: 'birth', location: 'Warsaw, Poland', date: [2005, 6, 12], participants: ['julia']},
    {type: 'birth', location: 'Warsaw, Poland', date: [2008, 1, 30], participants: ['tomasz']},
    {type: 'family_gathering', title: 'Christmas at the grandparents', description: 'The whole family together again.', location: 'Lublin, Poland', date: [2024, 12, 24], participants: ['piotr', 'anna', 'jan', 'maria', 'julia', 'tomasz']},
    {type: 'death', location: 'Kraków, Poland', date: [2020, 4, 18], participants: ['henryk']},
    {type: 'emigration', description: 'Moved abroad for work, came back two years later.', location: 'London, UK', date: [1998, 9, null], participants: ['piotr']}
  ];
  for (const seed of eventSeeds) {
    const {data: event, error} = await admin
      .from('events')
      .insert({
        family_id: familyId,
        created_by: userId,
        type: seed.type,
        title: seed.title ?? null,
        description: seed.description ?? null,
        location: seed.location,
        event_year: seed.date[0],
        event_month: seed.date[1],
        event_day: seed.date[2]
      })
      .select('id')
      .single();
    if (error || !event) throw error;
    await admin
      .from('event_persons')
      .insert(seed.participants.map((key) => ({event_id: event.id, person_id: id(key)})));
  }

  console.log(`Seeded demo family. Sign in as ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
