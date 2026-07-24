import Link from 'next/link';
import {getTranslations} from 'next-intl/server';
import {createClient} from '@/lib/supabase/server';

/**
 * Bell icon in the app header with the unread count. Links to the
 * notifications page (mobile-first: a dropdown would fight the bottom
 * tab bar; a full page works everywhere).
 */
export async function NotificationsBell({userId}: {userId: string}) {
  const t = await getTranslations('notifications');
  const supabase = await createClient();
  const {count} = await supabase
    .from('notifications')
    .select('id', {count: 'exact', head: true})
    .eq('recipient_user_id', userId)
    .is('read_at', null);
  const unread = count ?? 0;

  return (
    <Link
      href="/notifications"
      aria-label={
        unread > 0 ? t('bellLabelUnread', {count: unread}) : t('bellLabel')
      }
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-lg hover:bg-surface-sunken"
    >
      <span aria-hidden>🔔</span>
      {unread > 0 ? (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber px-1 text-[10px] font-bold text-surface-raised"
        >
          {unread > 99 ? '99+' : unread}
        </span>
      ) : null}
    </Link>
  );
}
