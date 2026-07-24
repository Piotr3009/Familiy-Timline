import Link from 'next/link';
import {redirect} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {createClient} from '@/lib/supabase/server';
import {getFamilyContext} from '@/lib/family';
import {loadTimeline} from '@/lib/timeline';
import {Button, EmptyState} from '@/components/ui';
import {Timeline} from '@/components/timeline/Timeline';

function toggleClass(active: boolean): string {
  return active
    ? 'rounded-full bg-amber-soft px-3 py-1.5 text-sm font-medium text-amber-strong'
    : 'rounded-full px-3 py-1.5 text-sm text-ink-muted hover:bg-surface-sunken';
}

export default async function TimelinePage({
  searchParams
}: {
  searchParams: Promise<{scope?: string; order?: string}>;
}) {
  const params = await searchParams;
  const ctx = await getFamilyContext();
  if (ctx === 'no-user') redirect('/login');
  if (ctx === 'no-family') redirect('/onboarding');
  const t = await getTranslations();
  const supabase = await createClient();

  const scopeMine = params.scope === 'mine' && ctx.person !== null;
  const oldestFirst = params.order === 'oldest';

  const entries = await loadTimeline(
    supabase,
    ctx.family.id,
    scopeMine ? {kind: 'person', personId: ctx.person!.id} : {kind: 'family'},
    oldestFirst
  );

  const query = (scope: string, order: string) =>
    `/timeline?scope=${scope}&order=${order}`;
  const scopeParam = scopeMine ? 'mine' : 'family';
  const orderParam = oldestFirst ? 'oldest' : 'newest';

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-heading text-2xl">{t('timeline.title')}</h1>
        <Link href="/events/new">
          <Button>{t('events.addButton')}</Button>
        </Link>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-full border border-border bg-surface-raised p-1">
          <Link href={query('family', orderParam)} className={toggleClass(!scopeMine)}>
            {t('timeline.scopeFamily')}
          </Link>
          {ctx.person ? (
            <Link href={query('mine', orderParam)} className={toggleClass(scopeMine)}>
              {t('timeline.scopeMine')}
            </Link>
          ) : null}
        </div>
        <div className="flex gap-1 rounded-full border border-border bg-surface-raised p-1">
          <Link href={query(scopeParam, 'newest')} className={toggleClass(!oldestFirst)}>
            {t('timeline.newestFirst')}
          </Link>
          <Link href={query(scopeParam, 'oldest')} className={toggleClass(oldestFirst)}>
            {t('timeline.oldestFirst')}
          </Link>
        </div>
      </div>
      {entries.length === 0 ? (
        <EmptyState
          icon="🕰️"
          title={t('timeline.emptyTitle')}
          hint={t('timeline.emptyHint')}
          action={
            <Link href="/events/new">
              <Button>{t('timeline.emptyAction')}</Button>
            </Link>
          }
        />
      ) : (
        <Timeline entries={entries} />
      )}
    </div>
  );
}
