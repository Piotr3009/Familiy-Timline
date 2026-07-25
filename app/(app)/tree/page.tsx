import {redirect} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import Link from 'next/link';
import {createClient} from '@/lib/supabase/server';
import {getFamilyContext} from '@/lib/family';
import {loadFamilyGraph, personName, sortByBirth} from '@/lib/persons/relations';
import {computeTreeLayout, type TreeGenerations, type TreePartnerFilter} from '@/lib/tree';
import {createSignedUrls} from '@/lib/media';
import {setTreePartnerFilterAction} from '@/lib/settings/actions';
import {Button, EmptyState, cx} from '@/components/ui';
import {FamilyTreeView} from '@/components/tree/FamilyTreeView';
import {TreeFocusPicker} from '@/components/tree/TreeFocusPicker';
import {TreeGenerationsPicker} from '@/components/tree/TreeGenerationsPicker';

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


  return (
    <div className="relative left-1/2 w-screen max-w-[1800px] -translate-x-1/2 space-y-4 px-4 sm:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-heading text-2xl">{t('tree.title')}</h1>
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
        <div className="min-w-0 space-y-2">
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
      ) : null}
    </div>
  );
}
