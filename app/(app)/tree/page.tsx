import {redirect} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import Link from 'next/link';
import {createClient} from '@/lib/supabase/server';
import {getFamilyContext} from '@/lib/family';
import {childrenOf, loadFamilyGraph, parentsOf, partnersOf, personName, sortByBirth} from '@/lib/persons/relations';
import {computeTreeLayout, type TreeGenerations, type TreePartnerFilter} from '@/lib/tree';
import {createSignedUrls} from '@/lib/media';
import {setTreePartnerFilterAction} from '@/lib/settings/actions';
import {Button, EmptyState, cx} from '@/components/ui';
import {FamilyTreeView} from '@/components/tree/FamilyTreeView';
import {TreeFocusPicker} from '@/components/tree/TreeFocusPicker';
import {TreeGenerationsPicker} from '@/components/tree/TreeGenerationsPicker';
import {TreeSidePanel} from '@/components/tree/TreeSidePanel';
import {CURRENT_PARTNER_STATUSES} from '@/lib/persons/relations';

function isPartnerFilter(value: string | undefined): value is TreePartnerFilter {
  return value === 'all' || value === 'current';
}

export default async function TreePage({
  searchParams
}: {
  searchParams: Promise<{focus?: string; partners?: string; gens?: string}>;
}) {
  const {focus, partners, gens} = await searchParams;
  const ctx = await getFamilyContext();
  if (ctx === 'no-user') redirect('/login');
  if (ctx === 'no-family') redirect('/onboarding');
  const t = await getTranslations();
  const supabase = await createClient();

  // Filter precedence: explicit URL param > account preference >
  // default 'current' (spec: current-only is the default view).
  const storedFilter = ctx.user.user_metadata?.tree_partner_filter as string | undefined;
  const partnerFilter: TreePartnerFilter = isPartnerFilter(partners)
    ? partners
    : isPartnerFilter(storedFilter)
      ? storedFilter
      : 'current';

  const generations: TreeGenerations =
    gens === '3' ? 3 : gens === '5' ? 5 : 4;

  const graph = await loadFamilyGraph(supabase, ctx.family.id);
  if (graph.persons.size === 0) {
    return (
      <EmptyState
        icon="🌳"
        title={t('tree.emptyTitle')}
        hint={t('tree.emptyHint')}
        action={
          <Link href="/onboarding">
            <Button>{t('tree.emptyAction')}</Button>
          </Link>
        }
      />
    );
  }

  const focusId =
    focus && graph.persons.has(focus)
      ? focus
      : ctx.person?.id ?? [...graph.persons.keys()][0]!;
  const layout = computeTreeLayout(graph, focusId, {partnerFilter, generations});

  const avatarPaths = layout
    ? layout.nodes
        .map((node) => node.person.avatar_url)
        .filter((path): path is string => Boolean(path))
    : [];
  const avatarUrls = await createSignedUrls(supabase, 'avatars', avatarPaths);

  const focusPerson = graph.persons.get(focusId)!;
  const options = sortByBirth([...graph.persons.values()]).map((person) => ({
    id: person.id,
    name: personName(person)
  }));

  // Side-panel data + family stats for the hero strip.
  const focusParents = sortByBirth(parentsOf(graph, focusId));
  const focusSpouse =
    partnersOf(graph, focusId).find((link) =>
      (CURRENT_PARTNER_STATUSES as readonly string[]).includes(link.relationship.status ?? '')
    )?.person ?? null;
  const focusChildren = sortByBirth(childrenOf(graph, focusId));
  const focusAvatarUrl = focusPerson.avatar_url
    ? (avatarUrls.get(focusPerson.avatar_url) ?? null)
    : null;
  const [{count: photosCount}, {count: eventsCount}] = await Promise.all([
    supabase
      .from('photos')
      .select('id', {count: 'exact', head: true})
      .eq('family_id', ctx.family.id),
    supabase
      .from('events')
      .select('id', {count: 'exact', head: true})
      .eq('family_id', ctx.family.id)
  ]);
  const stats = [
    {value: graph.persons.size, label: t('tree.statsMembers')},
    {value: photosCount ?? 0, label: t('tree.statsPhotos')},
    {value: eventsCount ?? 0, label: t('tree.statsEvents')}
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-md space-y-2">
          <h1 className="font-heading text-3xl leading-tight text-ink sm:text-4xl">
            {t('tree.heroTitle1')}{' '}
            <span className="text-amber">{t('tree.heroTitle2')}</span>
          </h1>
          <p className="text-sm text-ink-muted">{t('tree.heroTagline')}</p>
          <Link
            href={`/people/${focusId}`}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-amber-strong"
          >
            <span aria-hidden>+</span> {t('tree.addMember')}
          </Link>
        </div>
        <div className="flex gap-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="min-w-20 rounded-card border border-border bg-surface-raised/85 px-4 py-3 text-center shadow-sm"
            >
              <p className="font-heading text-xl text-ink">{stat.value}</p>
              <p className="text-xs text-ink-muted">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="sr-only">{t('tree.title')}</h2>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <form action={setTreePartnerFilterAction} className="flex items-center gap-1">
            <input type="hidden" name="focus" value={focusId} />
            <span className="mr-1 text-xs text-ink-muted">{t('tree.filterLabel')}</span>
            {(['current', 'all'] as const).map((option) => (
              <button
                key={option}
                type="submit"
                name="filter"
                value={option}
                className={cx(
                  'rounded-lg border px-2.5 py-1.5 text-xs',
                  partnerFilter === option
                    ? 'border-amber bg-amber-soft font-medium text-amber-strong'
                    : 'border-border text-ink-muted hover:bg-surface-sunken'
                )}
              >
                {option === 'current' ? t('tree.filterCurrent') : t('tree.filterAll')}
              </button>
            ))}
          </form>
          <TreeGenerationsPicker
            value={generations}
            focusId={focusId}
            partnerFilter={partnerFilter}
            options={([3, 4, 5] as const).map((value) => ({
              value,
              label: t('tree.generations', {count: value})
            }))}
          />
          <TreeFocusPicker
            options={options}
            value={focusId}
            label={t('tree.centerOn')}
            extraQuery={`&partners=${partnerFilter}&gens=${generations}`}
          />
        </div>
      </div>
      {layout ? (
        <div className="flex items-start gap-5">
          <div className="min-w-0 flex-1 space-y-2">
          <FamilyTreeView
            layout={layout}
            avatarUrls={avatarUrls}
            endedYearLabel={(year) => t('tree.endedYear', {year})}
            youLabel={ctx.person?.id === focusId ? t('tree.you') : undefined}
            zoomLabels={{
              zoomIn: t('tree.zoomIn'),
              zoomOut: t('tree.zoomOut'),
              fit: t('tree.zoomFit')
            }}
          />
          <p className="text-center text-xs text-ink-faint">
            {t('tree.hint', {name: focusPerson.first_name})}
          </p>
          </div>
          <TreeSidePanel
            person={focusPerson}
            avatarUrl={focusAvatarUrl}
            parents={focusParents}
            spouse={focusSpouse}
            childList={focusChildren}
            isYou={ctx.person?.id === focusId}
          />
        </div>
      ) : null}
    </div>
  );
}
