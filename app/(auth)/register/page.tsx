import {getTranslations} from 'next-intl/server';
import {Card} from '@/components/ui';
import {RegisterForm} from '@/components/auth/AuthForms';

export default async function RegisterPage({
  searchParams
}: {
  searchParams: Promise<{next?: string}>;
}) {
  const {next} = await searchParams;
  const t = await getTranslations();
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';

  return (
    <Card>
      <h1 className="font-heading mb-1 text-2xl">{t('auth.registerTitle')}</h1>
      <p className="mb-4 text-sm text-ink-muted">{t('auth.registerSubtitle')}</p>
      <RegisterForm next={safeNext} />
    </Card>
  );
}
