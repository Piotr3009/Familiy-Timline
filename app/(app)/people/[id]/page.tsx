import Link from 'next/link';
import {notFound, redirect} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {createClient} from '@/lib/supabase/server';
import {getFamilyContext} from '@/lib/family';
import {
  childrenOf,
  loadFamilyGraph,
  parentsOf,
  partnersOf,
  personName,
  siblingsOf,
  sortByBirth,
  CURRENT_PARTNER_STATUSES,
  type FamilyGraph
} from '@/lib/persons/relations';
import {computeAge, formatDate, formatPartialDate} from '@/lib/dates';
import {createSignedUrl} from '@/lib/media';
import {loadTimeline} from '@/lib/timeline';
import {loadActorNames, loadHistory} from '@/lib/audit/load';
import {canEditPersonRecord} from '@/lib/persons/permissions';
import {isMinor} from '@/lib/persons/minors';
import {getAppConfig} from '@/lib/config';
import {TERMINAL_PARTNER_STATUSES} from '@/lib/relationships/validate';
import {AddGuardianToggle, EndGuardianshipButton} from '@/components/people/GuardianForms';
import {Timeline} from '@/components/timeline/Timeline';
import {HistoryPanel} from '@/components/history/HistoryPanel';
import {
  RelationshipsSection,
  type RelationshipItem
} from '@/components/people/RelationshipsSection';
import {Alert, Card, PersonAvatar} from '@/components/ui';
import {EditPersonForm} from '@/components/people/EditPersonForm';
import {AvatarUpload} from '@/components/people/AvatarUpload';
import {InvitePanel} from '@/components/invite/InvitePanel';
import {ReportButton} from '@/components/people/ReportButton';
import {AddRelativeToggle} from '@/components/people/AddRelativeToggle';
import {DeletePersonButton} from '@/components/people/DeletePersonButton';
import type {VisiblePerson} from '@/lib/database.types';

function RelationList({
  title,
  persons,
  avatarUrls,
  dashedIds
}: {
  title: string;
  persons: VisiblePerson[];
  avatarUrls: Map<string, string>;
  /** Person ids linked by an ended relationship (rendered muted). */
  dashedIds?: Set<string>;
}) {
  if (persons.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-ink-muted">{title}</h3>
      <ul className="space-y-1.5">
        {persons.map((person) => (
          <li key={person.id}>
            <Link
              href={`/people/${person.id}`}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-sunken ${
                dashedIds?.has(person.id) ? 'opacity-60' : ''
              }`}
            >
              <PersonAvatar
                name={personName(person)}
                src={person.avatar_url ? avatarUrls.get(person.avatar_url) : null}
                size="sm"
                deceased={person.is_deceased}
              />
              <span className="text-sm">{personName(person)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function PersonTimeline({familyId, personId}: {familyId: string; personId: string}) {
  const t = await getTranslations('persons');
  const supabase = await createClient();
  const entries = await loadTimeline(supabase, familyId, {kind: 'person', personId});
  if (entries.length === 0) {
    return <p className="text-sm text-ink-muted">{t('noEventsYet')}</p>;
  }
  return <Timeline entries={entries.slice(0, 20)} />;
}

/** Profile changes together with changes to this person's relationships. */
async function PersonHistory({
  familyId,
  personId,
  graph,
  canEdit
}: {
  familyId: string;
  personId: string;
  graph: FamilyGraph;
  canEdit: boolean;
}) {
  const t = await getTranslations();
  const supabase = await createClient();
  const relationshipIds = graph.relationships
    .filter((rel) => rel.person_a_id === personId || rel.person_b_id === personId)
    .map((rel) => rel.id);
  const {data: guardianshipRows} = await supabase
    .from('guardianships')
    .select('id')
    .eq('person_id', personId);
  const entries = await loadHistory(supabase, [
    {table: 'persons', rowIds: [personId]},
    {table: 'relationships', rowIds: relationshipIds},
    {table: 'guardianships', rowIds: (guardianshipRows ?? []).map((row) => row.id)}
  ]);
  const actorNames = await loadActorNames(supabase, familyId, entries);
  const rowLabels = new Map<string, string>();
  for (const rel of graph.relationships) {
    if (rel.person_a_id !== personId && rel.person_b_id !== personId) continue;
    const otherId = rel.person_a_id === personId ? rel.person_b_id : rel.person_a_id;
    const other = graph.persons.get(otherId);
    if (other) {
      rowLabels.set(rel.id, t('history.relationshipWith', {name: personName(other)}));
    }
  }
  return (
    <HistoryPanel
      entries={entries}
      actorNames={actorNames}
      rowLabels={rowLabels}
      canEdit={canEdit}
      revalidate={`/people/${personId}`}
    />
  );
}

export default async function PersonPage({params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  const ctx = await getFamilyContext();
  if (ctx === 'no-user') redirect('/login');
  if (ctx === 'no-family') redirect('/onboarding');
  const t = await getTranslations();
  const supabase = await createClient();

  const graph = await loadFamilyGraph(supabase, ctx.family.id);
  const person = graph.persons.get(id);
  if (!person) notFound();

  const parents = sortByBirth(parentsOf(graph, id));
  const children = sortByBirth(childrenOf(graph, id));
  const partners = partnersOf(graph, id);
  const siblings = sortByBirth(siblingsOf(graph, id));

  // Profiles the signed-in user guards (via their claimed person).
  const {data: activeGuardianships} = await supabase
    .from('guardianships')
    .select('id, person_id, guardian_person_id, type')
    .eq('family_id', ctx.family.id)
    .is('ended_at', null);
  const guardedPersonIds = new Set(
    (activeGuardianships ?? [])
      .filter((row) => row.guardian_person_id === ctx.person?.id)
      .map((row) => row.person_id)
  );
  const viewer = {userId: ctx.user.id, isAdmin: ctx.role === 'admin', guardedPersonIds};

  const canEdit = canEditPersonRecord(person, viewer);
  const isOwnProfile = person.user_id === ctx.user.id;
  const canDelete = person.user_id === null && person.managed_by === ctx.user.id;

  // Minor status: conservative partial-date rule, threshold from config.
  const appConfig = await getAppConfig(supabase);
  const personIsMinor = isMinor(
    {year: person.birth_year, month: person.birth_month, day: person.birth_day},
    appConfig.adulthoodAge,
    new Date(),
    person.is_deceased
  );
  // HARD RULE: no invitations for minors (also enforced in the DB).
  const canInvite = person.user_id === null && !person.is_deceased && !personIsMinor;

  // Guardianships of THIS person (active first, for the guardians card).
  const personGuardianships = (activeGuardianships ?? []).filter(
    (row) => row.person_id === person.id
  );
  const canManageGuardians =
    person.user_id === null &&
    (guardedPersonIds.has(person.id) ||
      (personGuardianships.length === 0 && canEdit));

  // Sign avatars for the person + every listed relative.
  const avatarPaths = new Set<string>();
  if (person.avatar_url) avatarPaths.add(person.avatar_url);
  for (const related of [...parents, ...children, ...siblings, ...partners.map((p) => p.person)]) {
    if (related.avatar_url) avatarPaths.add(related.avatar_url);
  }
  const avatarUrls = new Map<string, string>();
  for (const path of avatarPaths) {
    const url = await createSignedUrl(supabase, 'avatars', path);
    if (url) avatarUrls.set(path, url);
  }

  // Latest invitation for the invite panel (RLS: inviter/manager/admin).
  let inviteSummary = null;
  if (canInvite) {
    const {data: invitation} = await supabase
      .from('invitations')
      .select('status, email, expires_at, claim_status')
      .eq('person_id', id)
      .order('created_at', {ascending: false})
      .limit(1)
      .maybeSingle();
    if (invitation) {
      inviteSummary = {
        status: invitation.status,
        email: invitation.email,
        expiresAt: invitation.expires_at,
        isExpired: new Date(invitation.expires_at).getTime() < Date.now(),
        hasPendingClaim: invitation.claim_status === 'pending_approval'
      };
    }
  }

  const partnerOptions = partners
    .filter((link) =>
      CURRENT_PARTNER_STATUSES.includes(
        link.relationship.status as (typeof CURRENT_PARTNER_STATUSES)[number]
      )
    )
    .map((link) => ({id: link.person.id, name: personName(link.person)}));

  // Relationship cards: every partner record with status, dates and the
  // children this couple shares. Editable by the record's creator, an
  // admin, an involved (claimed) person, or an editor of either profile.
  const childIds = new Set(children.map((child) => child.id));
  const relationshipItems: RelationshipItem[] = partners.map((link) => {
    const rel = link.relationship;
    const sharedChildren = sortByBirth(
      childrenOf(graph, link.person.id).filter((child) => childIds.has(child.id))
    ).map((child) => child.first_name);
    const canEditRelationship =
      rel.created_by === ctx.user.id ||
      ctx.role === 'admin' ||
      (ctx.person !== null &&
        (rel.person_a_id === ctx.person.id || rel.person_b_id === ctx.person.id)) ||
      canEditPersonRecord(person, viewer) ||
      canEditPersonRecord(link.person, viewer);
    return {
      relationship: rel,
      partner: {
        id: link.person.id,
        name: personName(link.person),
        avatarUrl: link.person.avatar_url
          ? avatarUrls.get(link.person.avatar_url) ?? null
          : null,
        isDeceased: link.person.is_deceased
      },
      sharedChildren,
      canEdit: canEditRelationship,
      offerWidowed:
        ['partners', 'married'].includes(rel.status ?? '') &&
        (link.person.is_deceased || person.is_deceased) &&
        !(link.person.is_deceased && person.is_deceased)
    };
  });

  // Existing persons offerable as a new partner: nobody with an ongoing
  // record with this person, and not the person themselves.
  const ongoingPartnerIds = new Set(
    partners
      .filter(
        (link) =>
          !TERMINAL_PARTNER_STATUSES.includes(
            link.relationship.status as (typeof TERMINAL_PARTNER_STATUSES)[number]
          )
      )
      .map((link) => link.person.id)
  );
  const addRelationshipOptions = sortByBirth(
    [...graph.persons.values()].filter(
      (candidate) => candidate.id !== person.id && !ongoingPartnerIds.has(candidate.id)
    )
  ).map((candidate) => ({id: candidate.id, name: personName(candidate)}));

  const birthText = formatPartialDate({
    year: person.birth_year,
    month: person.birth_month,
    day: person.birth_day
  });
  const deathText = formatPartialDate({
    year: person.death_year,
    month: person.death_month,
    day: person.death_day
  });
  const age = computeAge(
    {year: person.birth_year, month: person.birth_month, day: person.birth_day},
    person.is_deceased
      ? {year: person.death_year, month: person.death_month, day: person.death_day}
      : null
  );

  // Read-time adulthood detection (see 20260724000017 for the choice):
  // a guardian viewing a grown-up, still-unclaimed profile gets nudged
  // to hand it over via the standard invitation flow below.
  const showAdultTakeoverBanner =
    person.user_id === null &&
    !person.is_deceased &&
    !personIsMinor &&
    person.birth_year !== null &&
    guardedPersonIds.has(person.id);

  return (
    <div className="space-y-4">
      {showAdultTakeoverBanner ? (
        <Alert tone="info">
          {t('takeover.adultBanner', {name: person.first_name})}
        </Alert>
      ) : null}
      <Card>
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <PersonAvatar
            name={personName(person)}
            src={person.avatar_url ? avatarUrls.get(person.avatar_url) : null}
            size="lg"
            deceased={person.is_deceased}
          />
          <div className="min-w-0 flex-1">
            <h1 className="font-heading text-2xl sm:text-3xl">
              {personName(person)}
              {person.is_deceased ? (
                <span aria-hidden className="ml-2 text-lg text-ink-faint">
                  🕯️
                </span>
              ) : null}
            </h1>
            {person.maiden_name ? (
              <p className="text-sm text-ink-muted">
                {t('persons.nee', {name: person.maiden_name})}
              </p>
            ) : null}
            {isOwnProfile ? (
              <p className="mt-1 text-xs text-amber-strong">{t('persons.thisIsYou')}</p>
            ) : null}
          </div>
          <div className="flex flex-col items-start gap-2">
            {canEdit ? <AvatarUpload personId={person.id} familyId={person.family_id} /> : null}
            <Link
              href={`/tree?focus=${person.id}`}
              className="text-sm text-amber hover:underline"
            >
              {t('persons.showTreeFromHere')}
            </Link>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2 border-t border-border pt-4 text-sm sm:grid-cols-2">
          {birthText ? (
            <div className="flex justify-between gap-4 sm:block">
              <dt className="text-ink-muted">{t('persons.birthDate')}</dt>
              <dd>
                {birthText}
                {age !== null && !person.is_deceased
                  ? ` · ${t('persons.age', {age})}`
                  : ''}
              </dd>
            </div>
          ) : null}
          {person.birth_place ? (
            <div className="flex justify-between gap-4 sm:block">
              <dt className="text-ink-muted">{t('persons.birthPlace')}</dt>
              <dd>{person.birth_place}</dd>
            </div>
          ) : null}
          {person.is_deceased && deathText ? (
            <div className="flex justify-between gap-4 sm:block">
              <dt className="text-ink-muted">{t('persons.deathDate')}</dt>
              <dd>{deathText}</dd>
            </div>
          ) : null}
          {person.is_deceased && person.death_place ? (
            <div className="flex justify-between gap-4 sm:block">
              <dt className="text-ink-muted">{t('persons.deathPlace')}</dt>
              <dd>{person.death_place}</dd>
            </div>
          ) : null}
        </dl>
        {!person.details_visible ? (
          <p className="mt-3 text-xs text-ink-faint">{t('persons.detailsHidden')}</p>
        ) : null}
        {person.bio ? (
          <p className="mt-4 whitespace-pre-wrap border-t border-border pt-4 text-sm text-ink">
            {person.bio}
          </p>
        ) : null}
        {canEdit ? (
          <div className="mt-4">
            <EditPersonForm person={person} />
          </div>
        ) : null}
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-heading text-xl">{t('persons.familyOf', {name: person.first_name})}</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <RelationList title={t('persons.parents')} persons={parents} avatarUrls={avatarUrls} />
          <RelationList title={t('persons.siblings')} persons={siblings} avatarUrls={avatarUrls} />
          <RelationList title={t('persons.children')} persons={children} avatarUrls={avatarUrls} />
        </div>
        {parents.length + children.length + partners.length + siblings.length === 0 ? (
          <p className="text-sm text-ink-muted">{t('persons.noRelativesYet')}</p>
        ) : null}
        <div className="mt-4">
          <AddRelativeToggle
            anchorId={person.id}
            anchorName={person.first_name}
            partnerOptions={partnerOptions}
          />
        </div>
      </Card>

      <Card>
        <h2 className="font-heading mb-3 text-xl">{t('relationships.title')}</h2>
        <RelationshipsSection
          anchorId={person.id}
          items={relationshipItems}
          addOptions={addRelationshipOptions}
        />
      </Card>

      {person.user_id === null && !person.is_deceased ? (
        <Card>
          <h2 className="font-heading mb-3 text-xl">{t('guardians.title')}</h2>
          {personIsMinor ? (
            <p className="mb-3 text-sm text-ink-muted">{t('guardians.minorNote')}</p>
          ) : null}
          {personGuardianships.length === 0 ? (
            <p className="mb-3 text-sm text-ink-muted">{t('guardians.empty')}</p>
          ) : (
            <ul className="mb-3 space-y-1.5">
              {personGuardianships.map((row) => {
                const guardian = graph.persons.get(row.guardian_person_id);
                return (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-surface-sunken px-3 py-2"
                  >
                    <span className="min-w-0">
                      {guardian ? (
                        <Link
                          href={`/people/${guardian.id}`}
                          className="text-sm text-ink hover:underline"
                        >
                          {personName(guardian)}
                        </Link>
                      ) : (
                        <span className="text-sm text-ink-muted">—</span>
                      )}
                      <span className="ml-2 text-xs text-ink-faint">
                        {t(`guardians.types.${row.type}`)}
                      </span>
                    </span>
                    {canManageGuardians ? (
                      <EndGuardianshipButton guardianshipId={row.id} personId={person.id} />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {canManageGuardians ? (
            <AddGuardianToggle
              personId={person.id}
              options={sortByBirth(
                [...graph.persons.values()].filter(
                  (candidate) =>
                    candidate.id !== person.id &&
                    !candidate.is_deceased &&
                    !personGuardianships.some(
                      (row) => row.guardian_person_id === candidate.id
                    )
                )
              ).map((candidate) => ({id: candidate.id, name: personName(candidate)}))}
            />
          ) : null}
        </Card>
      ) : null}

      <Card>
        <h2 className="font-heading mb-4 text-xl">
          {t('persons.timelineOf', {name: person.first_name})}
        </h2>
        <PersonTimeline familyId={ctx.family.id} personId={person.id} />
      </Card>

      <Card>
        <details>
          <summary className="font-heading cursor-pointer text-xl">
            {t('history.title')}
          </summary>
          <div className="mt-4">
            <PersonHistory
              familyId={ctx.family.id}
              personId={person.id}
              graph={graph}
              canEdit={canEdit}
            />
          </div>
        </details>
      </Card>

      {canInvite ? (
        <Card>
          <h2 className="font-heading mb-3 text-xl">
            {t('invite.panelTitle', {name: person.first_name})}
          </h2>
          <InvitePanel
            personId={person.id}
            personFirstName={person.first_name}
            existing={inviteSummary}
            expiresText={inviteSummary ? formatDate(inviteSummary.expiresAt) : null}
          />
        </Card>
      ) : person.user_id === null && !person.is_deceased && personIsMinor ? (
        <Card>
          <h2 className="font-heading mb-3 text-xl">
            {t('invite.panelTitle', {name: person.first_name})}
          </h2>
          <p className="text-sm text-ink-muted">{t('persons.minorInviteBlocked')}</p>
        </Card>
      ) : null}

      <div className="flex items-center justify-between px-1">
        {!isOwnProfile ? <ReportButton personId={person.id} /> : <span />}
        {canDelete ? <DeletePersonButton personId={person.id} /> : null}
      </div>
    </div>
  );
}
