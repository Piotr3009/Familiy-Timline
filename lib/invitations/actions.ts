'use server';

import {revalidatePath} from 'next/cache';
import {getLocale, getTranslations} from 'next-intl/server';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {generateInviteToken} from '@/lib/invitations/token';
import {dbErrorKey} from '@/lib/errors';
import {renderBrandedEmail} from '@/emails/layout';
import {sendEmail} from '@/emails/send';
import {sendNotificationEmail} from '@/lib/notifications/email';
import {formatDate} from '@/lib/dates';

export type InviteActionState = {
  error: string | null;
  /** Full invite link — shown to the inviter for copy/share. */
  inviteUrl?: string;
  emailSent?: boolean;
};

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

/**
 * Creates (or re-sends) an invitation for an unclaimed profile.
 * The DB function enforces membership, rate limits and single-active-link
 * semantics; it hashes the token server-side, so the database only ever
 * stores the hash — the raw token lives only in the invite link.
 */
export async function createInvitationAction(
  _prev: InviteActionState,
  formData: FormData
): Promise<InviteActionState> {
  const personId = String(formData.get('personId') ?? '');
  const email = String(formData.get('email') ?? '').trim() || null;
  if (!personId) return {error: 'errors.unexpected'};

  const supabase = await createClient();
  const token = generateInviteToken();

  const {data, error} = await supabase.rpc('create_invitation', {
    p_person_id: personId,
    p_token: token,
    p_email: email
  });
  if (error || !data) return {error: dbErrorKey(error)};

  const result = data as {invitation_id: string; expires_at: string};
  const inviteUrl = `${appUrl()}/invite/${token}`;

  let emailSent = false;
  if (email) {
    const {data: person} = await supabase
      .from('visible_persons')
      .select('first_name, last_name, family_id')
      .eq('id', personId)
      .maybeSingle();
    const {data: family} = person
      ? await supabase.from('families').select('name').eq('id', person.family_id).maybeSingle()
      : {data: null};

    const locale = await getLocale();
    const t = await getTranslations({locale, namespace: 'emails'});
    const tApp = await getTranslations({locale, namespace: 'app'});
    const personName = person ? `${person.first_name} ${person.last_name}` : '';
    const familyName = family?.name ?? '';

    const sendResult = await sendEmail({
      to: email,
      subject: t('invitation.subject', {familyName}),
      html: renderBrandedEmail({
        appName: tApp('name'),
        subject: t('invitation.subject', {familyName}),
        heading: t('invitation.heading'),
        paragraphs: [
          t('invitation.body', {personName, familyName}),
          t('invitation.explainer')
        ],
        cta: {label: t('invitation.cta'), url: inviteUrl},
        footnote: t('invitation.expiry', {date: formatDate(result.expires_at)})
      })
    });
    emailSent = sendResult.ok;
  }

  revalidatePath(`/people/${personId}`);
  return {error: null, inviteUrl, emailSent};
}

export async function claimInvitationAction(
  _prev: {error: string | null; claimed?: boolean},
  formData: FormData
): Promise<{error: string | null; claimed?: boolean}> {
  const token = String(formData.get('token') ?? '');
  if (!token) return {error: 'errors.invitation_not_found'};

  const supabase = await createClient();
  const {data, error} = await supabase.rpc('claim_invitation', {p_token: token});
  if (error) return {error: dbErrorKey(error)};

  // Immediate email to whoever can approve (inviter + manager). The
  // in-app notification row comes from the invitations trigger; email
  // is inline-with-logging per the Stage 2 delivery choice.
  try {
    const result = data as {invitation_id: string; person_id: string};
    const admin = createAdminClient();
    const {data: invitation} = await admin
      .from('invitations')
      .select('invited_by')
      .eq('id', result.invitation_id)
      .maybeSingle();
    const {data: person} = await admin
      .from('persons')
      .select('first_name, last_name, managed_by')
      .eq('id', result.person_id)
      .maybeSingle();
    const personName = person ? `${person.first_name} ${person.last_name}` : '';
    const approverIds = [
      ...new Set(
        [invitation?.invited_by, person?.managed_by].filter((id): id is string =>
          Boolean(id)
        )
      )
    ];
    const fallbackLocale = await getLocale();
    for (const approverId of approverIds) {
      await sendNotificationEmail({
        recipientUserId: approverId,
        fallbackLocale,
        build: (t) => ({
          subject: t('invitationClaimed.subject', {personName}),
          heading: t('invitationClaimed.heading'),
          paragraphs: [t('invitationClaimed.body', {personName})],
          cta: {label: t('invitationClaimed.cta'), url: `${appUrl()}/dashboard`}
        })
      });
    }
  } catch {
    // Email is best effort; the claim itself already succeeded.
  }
  return {error: null, claimed: true};
}

/**
 * Approve a pending claim ("Yes, this is them"). Ownership transfers in
 * the DB function; afterwards we notify the claimer by email (best
 * effort, via the service role to resolve their address).
 */
export async function approveClaimAction(
  _prev: {error: string | null; ok?: boolean},
  formData: FormData
): Promise<{error: string | null; ok?: boolean}> {
  const invitationId = String(formData.get('invitationId') ?? '');
  if (!invitationId) return {error: 'errors.unexpected'};

  const supabase = await createClient();
  const {data, error} = await supabase.rpc('approve_claim', {p_invitation_id: invitationId});
  if (error) return {error: dbErrorKey(error)};

  const result = data as {person_id: string; claimed_by: string};
  // Email localized to the RECIPIENT's saved locale and gated on their
  // email-notifications setting (sendNotificationEmail handles both).
  const {data: person} = await supabase
    .from('visible_persons')
    .select('first_name, last_name')
    .eq('id', result.person_id)
    .maybeSingle();
  await sendNotificationEmail({
    recipientUserId: result.claimed_by,
    fallbackLocale: await getLocale(),
    build: (t) => ({
      subject: t('claimApproved.subject'),
      heading: t('claimApproved.heading'),
      paragraphs: [
        t('claimApproved.body', {
          personName: person ? `${person.first_name} ${person.last_name}` : ''
        })
      ],
      cta: {label: t('claimApproved.cta'), url: `${appUrl()}/dashboard`}
    })
  });

  revalidatePath('/dashboard');
  return {error: null, ok: true};
}

export async function rejectClaimAction(
  _prev: {error: string | null; ok?: boolean},
  formData: FormData
): Promise<{error: string | null; ok?: boolean}> {
  const invitationId = String(formData.get('invitationId') ?? '');
  if (!invitationId) return {error: 'errors.unexpected'};

  const supabase = await createClient();
  const {error} = await supabase.rpc('reject_claim', {p_invitation_id: invitationId});
  if (error) return {error: dbErrorKey(error)};
  revalidatePath('/dashboard');
  return {error: null, ok: true};
}
