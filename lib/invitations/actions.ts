'use server';

import {revalidatePath} from 'next/cache';
import {getLocale, getTranslations} from 'next-intl/server';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {generateInviteToken, hashInviteToken} from '@/lib/invitations/token';
import {dbErrorKey} from '@/lib/errors';
import {renderBrandedEmail} from '@/emails/layout';
import {sendEmail} from '@/emails/send';
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
 * semantics; the raw token never touches the database.
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
  const tokenHash = await hashInviteToken(token);

  const {data, error} = await supabase.rpc('create_invitation', {
    p_person_id: personId,
    p_token_hash: tokenHash,
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
  const tokenHash = await hashInviteToken(token);
  const {error} = await supabase.rpc('claim_invitation', {p_token_hash: tokenHash});
  if (error) return {error: dbErrorKey(error)};
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
  try {
    const admin = createAdminClient();
    const {data: userData} = await admin.auth.admin.getUserById(result.claimed_by);
    const claimerEmail = userData.user?.email;
    if (claimerEmail) {
      const {data: person} = await supabase
        .from('visible_persons')
        .select('first_name, last_name')
        .eq('id', result.person_id)
        .maybeSingle();
      const locale = await getLocale();
      const t = await getTranslations({locale, namespace: 'emails'});
      const tApp = await getTranslations({locale, namespace: 'app'});
      await sendEmail({
        to: claimerEmail,
        subject: t('claimApproved.subject'),
        html: renderBrandedEmail({
          appName: tApp('name'),
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
    }
  } catch {
    // Notification is best effort; the approval itself already succeeded.
  }

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
