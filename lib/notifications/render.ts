import type {Notification} from '@/lib/database.types';

/**
 * Payload access + target link resolution for notifications. Plain
 * module shared by the page, the bell and the actions.
 */

type NotificationPayload = {
  person_id?: string;
  person_name?: string;
  photo_id?: string;
  invitation_id?: string;
  comment_id?: string;
  target_type?: string;
  target_id?: string;
  requester_name?: string;
};

export function notificationPayload(notification: Notification): NotificationPayload {
  const payload = notification.payload;
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return {};
  return payload as NotificationPayload;
}

/** Where clicking the notification takes the user. */
export function notificationHref(notification: Notification): string {
  const payload = notificationPayload(notification);
  switch (notification.type) {
    case 'invitation_claimed':
      // Approve/reject lives on the dashboard (pending claims panel).
      return '/dashboard';
    case 'claim_approved':
      return '/dashboard';
    case 'tagged_in_photo':
      return payload.photo_id ? `/photos/${payload.photo_id}` : '/photos';
    case 'comment_on_your_item':
    case 'comment_after_you':
    case 'removal_requested':
      if (!payload.target_id) return '/dashboard';
      return payload.target_type === 'event'
        ? `/events/${payload.target_id}`
        : `/photos/${payload.target_id}`;
    case 'birthday_reminder':
    case 'adult_takeover_available':
      return payload.person_id ? `/people/${payload.person_id}` : '/dashboard';
    default:
      return '/dashboard';
  }
}
