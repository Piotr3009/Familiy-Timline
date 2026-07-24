import {redirect} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import Link from 'next/link';
import {createClient} from '@/lib/supabase/server';
import {getFamilyContext} from '@/lib/family';
import {loadFamilyGraph, personName, sortByBirth} from '@/lib/persons/relations';
import {computeTreeLayout} from '@/lib/tree';
import {createSignedUrls} from '@/lib/media';
import {Button, EmptyState} from '@/components/ui';
import {FamilyTreeView} from '@/components/tree/FamilyTreeView';
import {TreeFocusPicker} from '@/components/tree/TreeFocusPicker';

export default async function TreePage({
  searchParams
}: {
  searchParams: Promise<{focus?: string}>;
}) {
  const {focus} = await searchParams;
  const ctx = await getFamilyContext();
  if (ctx === 'no-user') redirect('/login');
  if (ctx === 'no-family') redirect('/onboarding');
  const t = await getTranslations();
  const supabase = await createClient();

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
  const layout = computeTreeLayout(graph, focusId);

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
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-heading text-2xl">{t('tree.title')}</h1>
        <TreeFocusPicker
          options={options}
          value={focusId}
          label={t('tree.centerOn')}
        />
      </div>
      {layout ? (
        <>
          <FamilyTreeView layout={layout} avatarUrls={avatarUrls} />
          <p className="text-center text-xs text-ink-faint">
            {t('tree.hint', {name: focusPerson.first_name})}
          </p>
        </>
      ) : null}
    </div>
  );
}
