import Link from 'next/link';
import {redirect} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {createClient} from '@/lib/supabase/server';
import {getFamilyContext} from '@/lib/family';
import {EVENT_TYPES} from '@/lib/event-types';
import {formatPartialDate} from '@/lib/dates';
import {Button, EmptyState} from '@/components/ui';

export default async function EventsPage() {
  const ctx = await getFamilyContext();
  if (ctx === 'no-user') redirect('/login');
  if (ctx === 'no-family') redirect('/onboarding');
  const t = await getTranslations();
  const supabase = await createClient();

  const {data: events} = await supabase
    .from('events')
    .select('*')
    .eq('family_id', ctx.family.id)
    .order('event_year', {ascending: false})
    .order('event_month', {ascending: false, nullsFirst: false})
    .order('event_day', {ascending: false, nullsFirst: false})
    .limit(200);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl">{t('events.title')}</h1>
        <Link href="/events/new">
          <Button>{t('events.addButton')}</Button>
        </Link>
      </div>
      {(events ?? []).length === 0 ? (
        <EmptyState
          icon="📅"
          title={t('events.emptyTitle')}
          hint={t('events.emptyHint')}
          action={
            <Link href="/events/new">
              <Button>{t('events.emptyAction')}</Button>
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-border rounded-card border border-border bg-surface-raised">
          {(events ?? []).map((event) => {
            const meta = EVENT_TYPES[event.type];
            return (
              <li key={event.id}>
                <Link
                  href={`/events/${event.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface-sunken"
                >
                  <span aria-hidden className="text-xl">
                    {meta.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">
                      {event.title ?? t(`events.types.${event.type}`)}
                    </span>
                    <span className="block text-xs text-ink-muted">
                      {formatPartialDate({
                        year: event.event_year,
                        month: event.event_month,
                        day: event.event_day
                      })}
                      {event.location ? ` · ${event.location}` : ''}
                    </span>
                  </span>
                  {event.privacy !== 'family' ? <span aria-hidden>🔒</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
