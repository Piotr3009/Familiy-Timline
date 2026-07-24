import Link from 'next/link';
import {getTranslations} from 'next-intl/server';
import {EVENT_TYPES} from '@/lib/event-types';
import {formatPartialDate} from '@/lib/dates';
import {groupByYear, type TimelineEntry} from '@/lib/timeline';
import {PersonAvatar} from '@/components/ui';

/**
 * Vertical timeline grouped by year. Each entry: type icon + accent dot,
 * gracefully partial date (dd.mm.yyyy / mm.yyyy / yyyy), title,
 * location, participant avatars and photo thumbnails.
 */
export async function Timeline({entries}: {entries: TimelineEntry[]}) {
  const t = await getTranslations('events');
  const tPrivacy = await getTranslations('privacy');
  const groups = groupByYear(entries);

  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute bottom-0 left-[15px] top-0 w-0.5 bg-line"
      />
      <div className="space-y-8">
        {groups.map((group) => (
          <section key={group.year}>
            <div className="relative mb-4 flex items-center">
              <span className="z-10 rounded-full border border-border-strong bg-surface-sunken px-3 py-1 font-heading text-sm text-ink">
                {group.year}
              </span>
            </div>
            <ol className="space-y-4">
              {group.entries.map((entry) => {
                const meta = EVENT_TYPES[entry.event.type];
                const dateText = formatPartialDate({
                  year: entry.event.event_year,
                  month: entry.event.event_month,
                  day: entry.event.event_day
                });
                const title =
                  entry.event.title ?? t(`types.${entry.event.type}`);
                return (
                  <li key={entry.event.id} className="relative pl-10">
                    <span
                      aria-hidden
                      className={`absolute left-[7px] top-3 z-10 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-current bg-surface-raised ${meta.colorClass}`}
                    />
                    <Link
                      href={`/events/${entry.event.id}`}
                      className="block rounded-card border border-border bg-surface-raised p-4 shadow-sm transition-shadow hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="flex items-center gap-2">
                            <span aria-hidden>{meta.icon}</span>
                            <span className="font-heading text-base text-ink">{title}</span>
                          </p>
                          <p className="mt-0.5 text-xs text-ink-muted">
                            {dateText}
                            {entry.event.location ? ` · ${entry.event.location}` : ''}
                          </p>
                        </div>
                        {entry.event.privacy !== 'family' ? (
                          <span
                            role="img"
                            aria-label={tPrivacy(entry.event.privacy)}
                            title={tPrivacy(entry.event.privacy)}
                          >
                            🔒
                          </span>
                        ) : null}
                      </div>
                      {entry.event.description ? (
                        <p className="mt-2 line-clamp-2 text-sm text-ink-muted">
                          {entry.event.description}
                        </p>
                      ) : null}
                      {entry.participants.length > 0 ? (
                        <div className="mt-3 flex -space-x-2">
                          {entry.participants.slice(0, 6).map((participant) => (
                            <span key={participant.id} title={participant.name}>
                              <PersonAvatar
                                name={participant.name}
                                src={participant.avatarUrl}
                                size="sm"
                              />
                            </span>
                          ))}
                          {entry.participants.length > 6 ? (
                            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface-sunken text-xs text-ink-muted">
                              +{entry.participants.length - 6}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      {entry.photos.length > 0 ? (
                        <div className="mt-3 flex gap-1.5">
                          {entry.photos.map((photo) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={photo.id}
                              src={photo.thumbUrl}
                              alt=""
                              className="h-14 w-14 rounded-md border border-border object-cover"
                            />
                          ))}
                        </div>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
