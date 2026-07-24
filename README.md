# Family Timeline

A private family network: family tree, member profiles, a shared photo
album, typed family events and a chronological family timeline — built
together by invited family members and kept for the next generations.

**Stage 1** implements: auth (email + Google, verified email required),
family creation, person profiles (claimed and unclaimed), invitations
with two-sided claim approval, a 2–3 generation tree view, photo/video
upload with quotas and tagging, events, the family timeline, a dashboard
and basic privacy — all enforced with Postgres Row Level Security.

**Stage 2** adds: divorces & multiple relationships (full UI: statuses,
dates, remarriage, tree rendering with an all/current filter), children
& legal guardians (guardian-managed profiles, minor rules), profile
ownership transfer at adulthood (guardian banner → standard invitation →
post-takeover review screen), the family activity feed, comments on
events and photos, in-app notifications with a bell (immediate email for
claim/approval/removal events via Resend), and append-only edit history
with per-field undo on person and event pages.

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
   to keep links working across browsers. Note that this template variant
   cannot carry a post-verification destination, so for the
   invite → register → verify → claim journey prefer the **default**
   confirmation email (`{{ .ConfirmationURL }}`), whose code-flow link
   goes through `/auth/callback` and preserves the `next` target.

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

> **After pulling Stage 2:** the new migrations
> (`20260724000014` … `20260724000020`) must be applied with
> `npx supabase db push` before the deployed app works — guardianships,
> audit log, feed, comments and notifications all live in the database.

## Tests

```bash
npm test                     # unit tests: dates, tokens, tree layout, celebrations,
                             # history diffs, relationship dates, minor status
npm run lint                 # eslint (next/core-web-vitals + next/typescript)
./supabase/tests/run.sh      # DB tests: migrations + RLS proofs + invitation
                             # flow + quotas + the Stage 2 suite
                             # (05_stage2.test.sql), on any local PostgreSQL
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
  live in the `config` table — never hardcoded. Stage 2 adds
  `adulthood_age` (18), `max_comment_length` (2000),
  `comment_edit_window_min` (15) and `feed_photo_batch_window_min` (15).
- **Guardianships** control who MANAGES an unclaimed profile (ancestry
  stays in `relationships`). Rows are never deleted — ending sets
  `ended_at`; the last active guardian of an unclaimed profile cannot be
  removed. Minor rules are hard: a minor's profile cannot be more
  visible than `family`, and invitations for minors are refused by the
  database. Minor status is computed conservatively from the partial
  birth date (`public.is_minor` / `lib/persons/minors.ts` — keep in sync).
- **No cron jobs.** Adulthood detection and the derived notifications
  (today's birthdays, adult-takeover nudges) are computed at read time
  on the relevant pages — nothing to schedule or break silently, at the
  cost of nudges appearing only when pages are viewed. `pg_cron` can be
  added later without schema changes.
- **Feed & comments** are written by database triggers only, and their
  RLS re-checks the target object's visibility on every read — a
  private photo never produces a visible feed item, comment or
  notification for anyone but its owner.
- **Edit history** (`audit_log`) is append-only and populated by a
  generic trigger on persons/relationships/events/photos/guardianships.
  Reverting a field writes the old value back through a normal update —
  history is never rewritten, and reverts appear in history themselves.
- **Notification emails** (immediate only for `invitation_claimed`,
  `claim_approved`, `removal_requested`) are sent inline from the server
  action that caused the event, with failure logging; everything else is
  in-app only. A per-user toggle on the settings page (default on) is
  respected by every email.
- **i18n**: `messages/en.json` is the source of truth; add a language by
  adding one JSON file and its code to `i18n/config.ts`. User-generated
  content is never translated. Event/relationship/privacy keys are
  stable English identifiers translated at display time.
- **Types**: `lib/database.types.ts` mirrors the migrations; regenerate
  with `npx supabase gen types typescript` after schema changes.

## Known limitations (tracked for a follow-up pass)

Non-blocking items surfaced by the Stage 1 review that are safe to defer:

- **Media byte quotas** are enforced by row count (hard) and by the
  client-declared file size (soft). The DB trigger cannot see the real
  uploaded bytes, so a client bypassing the app could understate size.
  A bucket-level `file_size_limit` or a storage Edge Function would make
  the byte cap authoritative.
- **Invite-link lookup rate limiting** keys on a best-effort caller value
  (an anonymous RPC has no trusted client IP through PostgREST). Because
  tokens are 256-bit and unguessable this is DoS-hardening, not an
  access-control boundary.
- **Orphaned media rows**: a browser dying between the photos-row insert
  and the file upload leaves a quota-consuming row with no file. A
  periodic sweep of rows whose storage objects are missing would reclaim
  them.
- **Upcoming celebrations** are computed from the persons' partial birth
  dates (`birth_month`/`birth_day`) and `wedding` events; `birth`-type
  events are intentionally not a second birthday source to avoid
  duplicate reminders.
- **pgcrypto portability**: migration 1 installs pgcrypto without a
  schema, so on a fresh database its functions land in `public`. On a
  project where pgcrypto was pre-enabled in the `extensions` schema the
  invitation functions would not resolve `digest()`; migration 15 pins
  their `search_path` to `public, extensions`, which is correct in both
  layouts. New crypto-using functions should do the same.
- **Reconciliation of an ended relationship between two claimed
  accounts** (e.g. divorced → married again) requires a family admin —
  a deliberate guard against one side unilaterally granting themselves
  immediate-family visibility. Consent-based linking arrives in Stage 3.
- **Tags on `private` items are invisible to the tagged person** (Stage
  1 semantics): the takeover review can only list content its owner has
  made at least family-visible.
