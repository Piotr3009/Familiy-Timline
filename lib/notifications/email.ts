import 'server-only';
import {getTranslations} from 'next-intl/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {renderBrandedEmail} from '@/emails/layout';
import {sendEmail} from '@/emails/send';
import {isLocale, type Locale} from '@/i18n/config';

/**
 * Immediate notification emails — ONLY for invitation_claimed,
 * claim_approved and removal_requested (everything else is in-app
 * only in Stage 2). Sent inline from the server action that caused the
 * event; failures are logged, never thrown — the in-app notification
 * row is the durable record. Respects the per-user email toggle
 * (user_metadata.email_notifications, default on) and the recipient's
 * saved locale.
 */
export async function sendNotificationEmail(input: {
  recipientUserId: string;
  /** Builds localized subject/heading/body once the locale is known. */
  build: (t: Awaited<ReturnType<typeof getTranslations>>, appName: string) => {
    subject: string;
    heading: string;
    paragraphs: string[];
    cta?: {label: string; url: string};
  };
  fallbackLocale: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const {data: userData} = await admin.auth.admin.getUserById(input.recipientUserId);
    const user = userData.user;
    if (!user?.email) return;
    if (user.user_metadata?.email_notifications === false) return;

    const savedLocale = user.user_metadata?.locale;
    const locale: Locale =
      typeof savedLocale === 'string' && isLocale(savedLocale)
        ? savedLocale
        : isLocale(input.fallbackLocale)
          ? input.fallbackLocale
          : 'en';

    const t = await getTranslations({locale, namespace: 'emails'});
    const tApp = await getTranslations({locale, namespace: 'app'});
    const content = input.build(t, tApp('name'));

    const result = await sendEmail({
      to: user.email,
      subject: content.subject,
      html: renderBrandedEmail({
        appName: tApp('name'),
        subject: content.subject,
        heading: content.heading,
        paragraphs: content.paragraphs,
        cta: content.cta
      })
    });
    if (!result.ok) {
      console.error(`notification email failed (${result.error})`);
    }
  } catch (error) {
    console.error('notification email failed', error);
  }
}

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}
