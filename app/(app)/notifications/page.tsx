import {redirect} from 'next/navigation';
import {getFormatter, getTranslations} from 'next-intl/server';
import {createClient} from '@/lib/supabase/server';
import {getFamilyContext} from '@/lib/family';
import {notificationHref, notificationPayload} from '@/lib/notifications/render';
import {
  markAllNotificationsReadAction,
  openNotificationAction
} from '@/lib/notifications/actions';
import {Button, Card, cx} from '@/components/ui';
import type {Notification} from '@/lib/database.types';

const TYPE_ICONS: Record<Notification['type'], string> = {
  invitation_claimed: '🔑',
  claim_approved: '🎉',
  tagged_in_photo: '🖼️',
  comment_on_your_item: '💬',
  comment_after_you: '💬',
  birthday_reminder: '🎂',
  adult_takeover_available: '🌱',
  removal_requested: '🙏'
};

export default async function NotificationsPage() {
  const ctx = await getFamilyContext();
  if (ctx === 'no-user') redirect('/login');
  if (ctx === 'no-family') redirect('/onboarding');
  const t = await getTranslations();
  const format = await getFormatter();
  const supabase = await createClient();

  // Derived notifications (birthdays today, adult takeovers) are
  // generated on open — the documented no-cron read-time approach.
  await supabase.rpc('refresh_derived_notifications');

  const {data: notifications} = await supabase
    .from('notifications')
    .select('*')
    .eq('recipient_user_id', ctx.user.id)
    .order('created_at', {ascending: false})
    .limit(50);

  const hasUnread = (notifications ?? []).some((item) => item.read_at === null);

  const text = (notification: Notification): string => {
    const payload = notificationPayload(notification);
    switch (notification.type) {
      case 'invitation_claimed':
        return t('notifications.items.invitation_claimed', {
          name: payload.person_name ?? ''
        });
      case 'claim_approved':
        return t('notifications.items.claim_approved', {
          name: payload.person_name ?? ''
        });
      case 'tagged_in_photo':
        return t('notifications.items.tagged_in_photo');
      case 'comment_on_your_item':
        return t('notifications.items.comment_on_your_item');
      case 'comment_after_you':
        return t('notifications.items.comment_after_you');
      case 'birthday_reminder':
        return t('notifications.items.birthday_reminder', {
          name: payload.person_name ?? ''
        });
      case 'adult_takeover_available':
        return t('notifications.items.adult_takeover_available', {
          name: payload.person_name ?? ''
        });
      case 'removal_requested':
        return t('notifications.items.removal_requested', {
          name: payload.requester_name || t('feed.unknownActor')
        });
      default:
        return '';
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-heading text-2xl">{t('notifications.title')}</h1>
        {hasUnread ? (
          <form action={markAllNotificationsReadAction}>
            <Button type="submit" variant="ghost">
              {t('notifications.markAllRead')}
            </Button>
          </form>
        ) : null}
      </div>

      <Card>
        {(notifications ?? []).length === 0 ? (
          <p className="text-sm text-ink-muted">{t('notifications.empty')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {(notifications ?? []).map((notification) => (
              <li key={notification.id}>
                <form action={openNotificationAction}>
                  <input type="hidden" name="notificationId" value={notification.id} />
                  <input
                    type="hidden"
                    name="href"
                    value={notificationHref(notification)}
                  />
                  <button
                    type="submit"
                    className={cx(
                      'flex w-full items-start gap-3 px-1 py-3 text-left hover:bg-surface-sunken',
                      notification.read_at === null && 'bg-amber-soft/40'
                    )}
                  >
                    <span aria-hidden className="mt-0.5 text-lg leading-none">
                      {TYPE_ICONS[notification.type]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cx(
                          'block text-sm',
                          notification.read_at === null
                            ? 'font-medium text-ink'
                            : 'text-ink-muted'
                        )}
                      >
                        {text(notification)}
                      </span>
                      <span className="block text-xs text-ink-faint">
                        {format.relativeTime(new Date(notification.created_at))}
                      </span>
                    </span>
                    {notification.read_at === null ? (
                      <span
                        aria-hidden
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber"
                      />
                    ) : null}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
