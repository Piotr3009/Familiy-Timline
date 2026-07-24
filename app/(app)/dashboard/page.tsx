import Link from 'next/link';
import {redirect} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {getFamilyContext} from '@/lib/family';
import {
  childrenOf,
  loadFamilyGraph,
  parentsOf,
  partnersOf,
  personName,
  siblingsOf,
  type FamilyGraph
} from '@/lib/persons/relations';
import {computeTreeLayout} from '@/lib/tree';
import {upcomingCelebrations} from '@/lib/celebrations';
import {createSignedUrls} from '@/lib/media';
import {formatDate} from '@/lib/dates';
import {loadFeed} from '@/lib/feed/load';
import {Card} from '@/components/ui';
import {FamilyTreeView} from '@/components/tree/FamilyTreeView';
import {FeedList} from '@/components/feed/FeedList';
import {PendingClaims, type PendingClaim} from '@/components/invite/PendingClaims';

const CELEBRATION_WINDOW_DAYS = 30;

/** Immediate-family subgraph: focus + parents, partners, siblings, children. */
function immediateSubgraph(graph: FamilyGraph, focusId: string): FamilyGraph {
  const keep = new Set<string>([focusId]);
  for (const person of parentsOf(graph, focusId)) keep.add(person.id);
  for (const link of partnersOf(graph, focusId)) keep.add(link.person.id);
  for (const person of siblingsOf(graph, focusId)) keep.add(person.id);
  for (const person of childrenOf(graph, focusId)) keep.add(person.id);
  return {
    persons: new Map([...graph.persons].filter(([id]) => keep.has(id))),
    relationships: graph.relationships.filter(
      (rel) => keep.has(rel.person_a_id) && keep.has(rel.person_b_id)
    )
  };
}

export default async function DashboardPage({
  searchParams
}: {
  searchParams: Promise<{feedBefore?: string}>;
}) {
  const {feedBefore} = await searchParams;
  const ctx = await getFamilyContext();
  if (ctx === 'no-user') redirect('/login');
  if (ctx === 'no-family') redirect('/onboarding');
  const t = await getTranslations();
  const supabase = await createClient();

  const graph = await loadFamilyGraph(supabase, ctx.family.id);

  // Post-takeover review nudge: the user claimed a profile that was
  // guardian-managed and has not walked through the review screen yet.
  let showTakeoverReview = false;
  if (ctx.person && ctx.person.takeover_reviewed_at === null) {
    const {data: endedGuardianship} = await supabase
      .from('guardianships')
      .select('id')
      .eq('person_id', ctx.person.id)
      .not('ended_at', 'is', null)
      .limit(1)
      .maybeSingle();
    showTakeoverReview = Boolean(endedGuardianship);
  }

  // Mini tree around me (2–3 generations, no grandparents).
  let miniLayout = null;
  let treeAvatarUrls = new Map<string, string>();
  if (ctx.person && graph.persons.has(ctx.person.id)) {
    const subgraph = immediateSubgraph(graph, ctx.person.id);
    miniLayout = computeTreeLayout(subgraph, ctx.person.id);
    if (miniLayout) {
      treeAvatarUrls = await createSignedUrls(
        supabase,
        'avatars',
        miniLayout.nodes
          .map((node) => node.person.avatar_url)
          .filter((path): path is string => Boolean(path))
      );
    }
  }

  // Upcoming birthdays + anniversaries.
  const {data: weddingEvents} = await supabase
    .from('events')
    .select('id, type, event_year, event_month, event_day')
    .eq('family_id', ctx.family.id)
    .eq('type', 'wedding');
  const weddingIds = (weddingEvents ?? []).map((event) => event.id);
  const {data: weddingParticipants} = weddingIds.length
    ? await supabase
        .from('event_persons')
        .select('event_id, person_id')
        .in('event_id', weddingIds)
    : {data: []};
  const celebrations = upcomingCelebrations(
    [...graph.persons.values()],
    (weddingEvents ?? []).map((event) => ({
      ...event,
      participantNames: (weddingParticipants ?? [])
        .filter((row) => row.event_id === event.id)
        .map((row) => {
          const person = graph.persons.get(row.person_id);
          return person ? person.first_name : '';
        })
        .filter(Boolean)
    })),
    CELEBRATION_WINDOW_DAYS,
    new Date()
  );

  // Claims waiting for my approval (RLS narrows visibility; exclude my
  // own claims in other families — I cannot approve those).
  const {data: pendingInvitations} = await supabase
    .from('invitations')
    .select('id, person_id, claimed_by')
    .eq('claim_status', 'pending_approval')
    .eq('family_id', ctx.family.id)
    .neq('claimed_by', ctx.user.id);
  const pendingClaims: PendingClaim[] = [];
  if (pendingInvitations && pendingInvitations.length > 0) {
    const admin = createAdminClient();
    for (const invitation of pendingInvitations) {
      const person = graph.persons.get(invitation.person_id);
      let claimerEmail: string | null = null;
      if (invitation.claimed_by) {
        try {
          const {data: userData} = await admin.auth.admin.getUserById(invitation.claimed_by);
          claimerEmail = userData.user?.email ?? null;
        } catch {
          claimerEmail = null;
        }
      }
      pendingClaims.push({
        invitationId: invitation.id,
        personName: person ? personName(person) : '',
        claimerEmail
      });
    }
  }

  // Family activity feed (replaces the Stage 1 "recently added" list).
  // Today's birthdays/anniversaries are generated at read time. An
  // invalid cursor is ignored rather than yielding an empty feed.
  const validFeedBefore =
    feedBefore && !Number.isNaN(new Date(feedBefore).getTime()) ? feedBefore : null;
  const feedPage = await loadFeed(supabase, ctx.family.id, graph, {
    before: validFeedBefore
  });
  const todayCelebrations = validFeedBefore
    ? []
    : upcomingCelebrations(
        [...graph.persons.values()],
        (weddingEvents ?? []).map((event) => ({
          ...event,
          participantNames: (weddingParticipants ?? [])
            .filter((row) => row.event_id === event.id)
            .map((row) => graph.persons.get(row.person_id)?.first_name ?? '')
            .filter(Boolean)
        })),
        0,
        new Date()
      );

  return (
    <div className="space-y-5">
      <h1 className="font-heading text-2xl">
        {t('dashboard.greeting', {name: ctx.person?.first_name ?? ''})}
      </h1>

      {showTakeoverReview ? (
        <div className="rounded-lg border border-amber/30 bg-amber-soft px-4 py-3 text-sm text-amber-strong">
          {t('takeover.reviewNudge')}{' '}
          <Link href="/profile-review" className="font-medium underline">
            {t('takeover.reviewNudgeAction')}
          </Link>
        </div>
      ) : null}

      <PendingClaims claims={pendingClaims} />

      {miniLayout ? (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-heading text-lg">{t('dashboard.miniTreeTitle')}</h2>
            <Link href="/tree" className="text-sm text-amber hover:underline">
              {t('dashboard.openFullTree')}
            </Link>
          </div>
          <FamilyTreeView layout={miniLayout} avatarUrls={treeAvatarUrls} />
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <h2 className="font-heading mb-3 text-lg">{t('dashboard.upcomingTitle')}</h2>
          {celebrations.length === 0 ? (
            <p className="text-sm text-ink-muted">{t('dashboard.upcomingEmpty')}</p>
          ) : (
            <ul className="space-y-2">
              {celebrations.slice(0, 8).map((celebration, index) => (
                <li key={index}>
                  <Link
                    href={celebration.href}
                    className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-sunken"
                  >
                    <span aria-hidden className="text-xl">
                      {celebration.kind === 'birthday' ? '🎂' : '💞'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">
                        {celebration.label}
                      </span>
                      <span className="block text-xs text-ink-muted">
                        {formatDate(celebration.date)}
                        {celebration.years !== null
                          ? ` · ${
                              celebration.kind === 'birthday'
                                ? t('dashboard.turnsAge', {age: celebration.years})
                                : t('dashboard.anniversaryYears', {years: celebration.years})
                            }`
                          : ''}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="font-heading mb-3 text-lg">{t('feed.title')}</h2>
          <FeedList
            items={feedPage.items}
            todayCelebrations={todayCelebrations}
            loadMoreHref={
              feedPage.nextCursor
                ? `/dashboard?feedBefore=${encodeURIComponent(feedPage.nextCursor)}`
                : null
            }
          />
        </Card>
      </div>
    </div>
  );
}
