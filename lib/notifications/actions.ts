'use server';

import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {getLocale} from 'next-intl/server';
import {createClient} from '@/lib/supabase/server';
import {getFamilyContext} from '@/lib/family';
import {dbErrorKey} from '@/lib/errors';
import {appUrl, sendNotificationEmail} from '@/lib/notifications/email';
import type {ActionState} from '@/lib/persons/actions';

/** Marks one notification read, then follows it to its target. */
export async function openNotificationAction(formData: FormData): Promise<void> {
  const notificationId = String(formData.get('notificationId') ?? '');
  const rawHref = String(formData.get('href') ?? '');
  const href =
    rawHref.startsWith('/') && !rawHref.startsWith('//') && !rawHref.includes('\\')
      ? rawHref
      : '/dashboard';
  if (notificationId) {
    const supabase = await createClient();
    await supabase
      .from('notifications')
      .update({read_at: new Date().toISOString()})
      .eq('id', notificationId)
      .is('read_at', null);
    revalidatePath('/notifications');
  }
  redirect(href);
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const supabase = await createClient();
  const {
    data: {user}
  } = await supabase.auth.getUser();
  if (user) {
    await supabase
      .from('notifications')
      .update({read_at: new Date().toISOString()})
      .eq('recipient_user_id', user.id)
      .is('read_at', null);
  }
  revalidatePath('/notifications');
  revalidatePath('/', 'layout');
}

/**
 * Takeover review: ask the owner of a photo/event to remove it. The DB
 * function writes the in-app notification (deduplicated); the immediate
 * email goes out inline here (one of the three email-worthy types).
 */
export async function requestRemovalAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const targetType = String(formData.get('targetType') ?? '');
  const targetId = String(formData.get('targetId') ?? '');
  if ((targetType !== 'event' && targetType !== 'photo') || !targetId) {
    return {error: 'errors.unexpected'};
  }

  const ctx = await getFamilyContext();
  if (ctx === 'no-user' || ctx === 'no-family') return {error: 'errors.not_authenticated'};
  const supabase = await createClient();

  const {data, error} = await supabase.rpc('request_content_removal', {
    p_target_type: targetType,
    p_target_id: targetId
  });
  if (error) return {error: dbErrorKey(error)};

  const ownerUserId = (data as {owner_user_id?: string} | null)?.owner_user_id;
  if (ownerUserId && ownerUserId !== ctx.user.id) {
    const requesterName = ctx.person
      ? `${ctx.person.first_name} ${ctx.person.last_name}`
      : '';
    const targetPath =
      targetType === 'event' ? `/events/${targetId}` : `/photos/${targetId}`;
    await sendNotificationEmail({
      recipientUserId: ownerUserId,
      fallbackLocale: await getLocale(),
      build: (t) => ({
        subject: t('removalRequested.subject'),
        heading: t('removalRequested.heading'),
        paragraphs: [t('removalRequested.body', {requesterName})],
        cta: {label: t('removalRequested.cta'), url: `${appUrl()}${targetPath}`}
      })
    });
  }

  revalidatePath('/profile-review');
  return {error: null, ok: true};
}
