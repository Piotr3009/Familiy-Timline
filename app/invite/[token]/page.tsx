import Link from 'next/link';
import {headers} from 'next/headers';
import {getTranslations} from 'next-intl/server';
import {createClient} from '@/lib/supabase/server';
import {isPlausibleToken} from '@/lib/invitations/token';
import {Alert, Button, Card} from '@/components/ui';
import {ClaimCard} from '@/components/invite/ClaimCard';

type InviteLookup = {
  invitation_id: string;
  status: 'pending' | 'opened' | 'claimed' | 'expired' | 'revoked';
  claim_status: 'pending_approval' | 'approved' | 'rejected' | null;
  expires_at: string;
  person_first_name: string;
  person_last_name: string;
  person_already_claimed: boolean;
  family_name: string;
  claimed_by_me: boolean;
};

export default async function InvitePage({params}: {params: Promise<{token: string}>}) {
  const {token} = await params;
  const t = await getTranslations('invite');
  const supabase = await createClient();

  const shell = (content: React.ReactNode) => (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <Card>{content}</Card>
    </main>
  );

  if (!isPlausibleToken(token)) {
    return shell(<Alert tone="error">{t('invalid')}</Alert>);
  }

  const headerList = await headers();
  const rateKey =
    headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  const {data, error} = await supabase.rpc('get_invitation_by_token', {
    p_token: token,
    p_rate_key: rateKey
  });

  if (error) {
    const rateLimited = String(error.message).includes('rate_limit_exceeded');
    return shell(
      <Alert tone="error">{rateLimited ? t('rateLimited') : t('invalid')}</Alert>
    );
  }
  if (!data) {
    return shell(<Alert tone="error">{t('invalid')}</Alert>);
  }

  const invite = data as InviteLookup;
  const personName = `${invite.person_first_name} ${invite.person_last_name}`;

  if (invite.status === 'expired') {
    return shell(<Alert tone="error">{t('expired')}</Alert>);
  }
  if (invite.status === 'revoked') {
    return shell(<Alert tone="error">{t('revoked')}</Alert>);
  }
  if (invite.status === 'claimed' || invite.person_already_claimed) {
    return shell(<Alert tone="info">{t('alreadyConnected', {name: personName})}</Alert>);
  }
  if (invite.claim_status === 'pending_approval') {
    return shell(
      <Alert tone="info">
        {invite.claimed_by_me ? t('waitingForApproval') : t('claimedBySomeone')}
      </Alert>
    );
  }

  const {
    data: {user}
  } = await supabase.auth.getUser();

  return shell(
    <div className="space-y-4 text-center">
      <span aria-hidden className="text-4xl">
        💌
      </span>
      <h1 className="font-heading text-2xl">{t('title', {familyName: invite.family_name})}</h1>
      <p className="text-sm text-ink-muted">
        {t('profileCreatedForYou', {name: personName})}
      </p>
      {user ? (
        <ClaimCard token={token} personName={personName} />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">{t('signInToClaim')}</p>
          <Link href={`/register?next=${encodeURIComponent(`/invite/${token}`)}`} className="block">
            <Button className="w-full">{t('registerToClaim')}</Button>
          </Link>
          <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} className="block">
            <Button variant="secondary" className="w-full">
              {t('loginToClaim')}
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
