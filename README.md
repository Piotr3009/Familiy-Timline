# Family Timeline

A private family network: family tree, member profiles, a shared photo
album, typed family events and a chronological family timeline — built
together by invited family members and kept for the next generations.

**Stage 1** implements: auth (email + Google, verified email required),
family creation, person profiles (claimed and unclaimed), invitations
with two-sided claim approval, a 2–3 generation tree view, photo/video
upload with quotas and tagging, events, the family timeline, a dashboard
and basic privacy — all enforced with Postgres Row Level Security.

## Tech stack

Next.js (App Router) · TypeScript strict · Supabase (Postgres, Auth,
Storage, RLS) · Tailwind CSS v4 · next-intl (en/pl) · Resend · Vercel.

## Setup

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Link and push the migrations:

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

3. **Auth settings** (Dashboard → Authentication):
   - *Sign In / Up → Email*: enable **Confirm email** (mandatory — the
     app assumes sessions only exist after verification).
   - *Providers → Google*: enable and add your OAuth client id/secret
     ([guide](https://supabase.com/docs/guides/auth/social-login/auth-google)).
   - *URL Configuration*: set the Site URL to your deployment URL and add
     `https://<your-domain>/auth/callback` to the redirect allow list.

### 2. Resend (branded email)

1. Create an API key at [resend.com](https://resend.com) and verify your
   sending domain.
2. Invitation + claim-approved emails are sent by the app through the
   Resend API (`RESEND_API_KEY`, `EMAIL_FROM`).
3. **Supabase Auth emails through Resend SMTP** (so verification and
   password-reset emails share the branding): Dashboard → Project
   Settings → Auth → SMTP Settings, then enter:
   - Host `smtp.resend.com`, port `465`, username `resend`,
     password = your Resend API key, sender = the same `EMAIL_FROM`.
4. Optional: point the auth email templates at the token_hash endpoint
   (`https://<your-domain>/auth/confirm?token_hash={{ .TokenHash }}&type=email`)
   to keep links working across browsers.

### 3. Local development

```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev
```

With the Supabase CLI you can also run everything locally:

```bash
npx supabase start           # local stack; applies migrations + supabase/seed.sql
```

The local seed creates a demo login: `demo@familytimeline.app` /
`demo1234` (3 generations, relationships and sample events). To seed a
**hosted** dev project instead: `npm run seed` (uses the service role key).

### 4. Vercel deploy

1. Import the repository in Vercel.
2. Add the environment variables from `.env.example`
   (`NEXT_PUBLIC_APP_URL` = your production URL).
3. Deploy — no extra build configuration is required.

## Tests

```bash
npm test                     # unit tests: dates, tokens, tree layout, celebrations
./supabase/tests/run.sh      # DB tests: migrations + RLS proofs + invitation
                             # flow + quotas, on any local PostgreSQL
```

The SQL suite runs against plain PostgreSQL using a small Supabase shim
(`supabase/tests/harness/`) — no Supabase stack needed — and proves the
security model: strangers and anonymous users see nothing, `private`
items stay invisible to other members, `immediate_family` resolves
through the relationships table, ownership columns are locked, and
storage objects follow photo privacy.

## Architecture notes

- **Partial dates** are stored as `<field>_year/_month/_day` integer
  columns (day requires month, month requires year). Display format is
  always `dd.mm.yyyy` via `lib/dates.ts` — the single formatting utility.
- **Profiles vs accounts**: a `persons` row can exist without a login.
  Unclaimed profiles are controlled by `managed_by`; claiming transfers
  ownership (`user_id`) only after the inviter approves.
- **Business logic lives in the database** (security definer functions:
  onboarding, invitations, claiming, quotas, rate limits) so the future
  mobile app can call the same `rpc()` endpoints. RLS is the source of
  truth for privacy; app-level checks are convenience only.
- **Media** lives in private buckets (`avatars`, `media`), served
  exclusively through short-lived signed URLs. Photo files inherit the
  photo row's privacy via storage policies. Versions
  (original/preview/thumb) are generated client-side before upload.
- **Product limits** (file sizes, quotas, invite validity, rate limits)
  live in the `config` table — never hardcoded.
- **i18n**: `messages/en.json` is the source of truth; add a language by
  adding one JSON file and its code to `i18n/config.ts`. User-generated
  content is never translated. Event/relationship/privacy keys are
  stable English identifiers translated at display time.
- **Types**: `lib/database.types.ts` mirrors the migrations; regenerate
  with `npx supabase gen types typescript` after schema changes.
