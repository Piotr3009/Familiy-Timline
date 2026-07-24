import Link from 'next/link';
import {getFormatter, getTranslations} from 'next-intl/server';
import {EVENT_TYPES, type EventTypeMeta} from '@/lib/event-types';
import type {RenderedFeedItem} from '@/lib/feed/load';
import type {Celebration} from '@/lib/celebrations';

/**
 * The family activity feed. Items arrive RLS-filtered and
 * render-resolved (lib/feed/load.ts); today's birthdays/anniversaries
 * are computed at read time and shown on top of the first page.
 */

const TYPE_ICONS: Record<string, string> = {
  person_added: '🌱',
  person_claimed: '🎉',
  photo_added: '🖼️',
  relationship_added: '💞',
  relationship_ended: '🍂',
  comment_added: '💬'
};

function itemIcon(item: RenderedFeedItem): string {
  if (item.type === 'event_added' && item.eventType) {
    const meta = (EVENT_TYPES as Record<string, EventTypeMeta>)[item.eventType];
    if (meta) return meta.icon;
  }
  return TYPE_ICONS[item.type] ?? '✨';
}

export async function FeedList({
  items,
  todayCelebrations,
  loadMoreHref
}: {
  items: RenderedFeedItem[];
  todayCelebrations: Celebration[];
  loadMoreHref: string | null;
}) {
  const t = await getTranslations();
  const format = await getFormatter();

  const sentence = (item: RenderedFeedItem): string => {
    const actor = item.actorName ?? t('feed.unknownActor');
    switch (item.type) {
      case 'person_added':
        return t('feed.items.person_added', {actor, name: item.targetLabel ?? ''});
      case 'person_claimed':
        return t('feed.items.person_claimed', {name: item.targetLabel ?? ''});
      case 'photo_added':
        return t('feed.items.photo_added', {actor, count: item.photoCount ?? 1});
      case 'event_added':
        return t('feed.items.event_added', {
          actor,
          title:
            item.targetLabel ??
            (item.eventType ? t(`events.types.${item.eventType}`) : '')
        });
      case 'relationship_added':
        return t('feed.items.relationship_added', {
          actor,
          a: item.pair?.a ?? '',
          b: item.pair?.b ?? '',
          status: item.pair?.status
            ? t(`relationships.statuses.${item.pair.status}`)
            : ''
        });
      case 'relationship_ended':
        return t('feed.items.relationship_ended', {
          a: item.pair?.a ?? '',
          b: item.pair?.b ?? '',
          status: item.pair?.status
            ? t(`relationships.statuses.${item.pair.status}`)
            : ''
        });
      case 'comment_added': {
        const target =
          item.commentTarget?.label ||
          (item.commentTarget?.eventType
            ? t(`events.types.${item.commentTarget.eventType}`)
            : t('feed.targets.photo'));
        return t('feed.items.comment_added', {actor, target});
      }
      default:
        return '';
    }
  };

  if (items.length === 0 && todayCelebrations.length === 0) {
    return <p className="text-sm text-ink-muted">{t('feed.empty')}</p>;
  }

  return (
    <div className="space-y-1.5">
      {todayCelebrations.map((celebration, index) => (
        <Link
          key={`today-${index}`}
          href={celebration.href}
          className="flex items-center gap-2.5 rounded-lg bg-amber-soft px-3 py-2 text-sm text-amber-strong hover:opacity-90"
        >
          <span aria-hidden>{celebration.kind === 'birthday' ? '🎂' : '💞'}</span>
          <span className="min-w-0 flex-1">
            {celebration.kind === 'birthday'
              ? t('feed.items.birthday_today', {
                  name: celebration.label,
                  age: celebration.years ?? 0,
                  hasAge: celebration.years !== null ? 'yes' : 'no'
                })
              : t('feed.items.anniversary_today', {names: celebration.label})}
          </span>
        </Link>
      ))}
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href ?? '#'}
              className="flex items-start gap-2.5 rounded-lg px-3 py-2 hover:bg-surface-sunken"
            >
              <span aria-hidden className="mt-0.5 text-lg leading-none">
                {itemIcon(item)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-ink">{sentence(item)}</span>
                {item.photos && item.photos.length > 0 ? (
                  <span className="mt-1.5 flex gap-1">
                    {item.photos.map((photo) =>
                      photo.thumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={photo.id}
                          src={photo.thumbUrl}
                          alt=""
                          className="h-12 w-12 rounded-md border border-border object-cover"
                        />
                      ) : null
                    )}
                    {(item.photoCount ?? 0) > item.photos.length ? (
                      <span className="flex h-12 w-12 items-center justify-center rounded-md border border-border bg-surface-sunken text-xs text-ink-muted">
                        +{(item.photoCount ?? 0) - item.photos.length}
                      </span>
                    ) : null}
                  </span>
                ) : null}
                <span className="block text-xs text-ink-faint">
                  {format.relativeTime(new Date(item.createdAt))}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {loadMoreHref ? (
        <div className="pt-1 text-center">
          <Link href={loadMoreHref} className="text-sm text-amber hover:underline">
            {t('feed.loadMore')}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
