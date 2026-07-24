import {getTranslations} from 'next-intl/server';
import {Card} from '@/components/ui';

export default async function VerifyEmailPage({
  searchParams
}: {
  searchParams: Promise<{email?: string}>;
}) {
  const {email} = await searchParams;
  const t = await getTranslations('auth');

  return (
    <Card className="text-center">
      <span aria-hidden className="text-4xl">
        📬
      </span>
      <h1 className="font-heading mt-3 text-2xl">{t('verifyTitle')}</h1>
      <p className="mt-2 text-sm text-ink-muted">
        {email ? t('verifyBodyWithEmail', {email}) : t('verifyBody')}
      </p>
      <p className="mt-4 text-xs text-ink-faint">{t('verifyHint')}</p>
    </Card>
  );
}
