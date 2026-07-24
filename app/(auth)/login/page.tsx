import {getTranslations} from 'next-intl/server';
import {Alert, Card} from '@/components/ui';
import {LoginForm} from '@/components/auth/AuthForms';

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{next?: string; error?: string}>;
}) {
  const {next, error} = await searchParams;
  const t = await getTranslations();
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';

  return (
    <Card>
      <h1 className="font-heading mb-4 text-2xl">{t('auth.signInTitle')}</h1>
      {error ? <Alert tone="error">{t('auth.errors.callbackFailed')}</Alert> : null}
      <div className={error ? 'mt-4' : undefined}>
        <LoginForm next={safeNext} />
      </div>
    </Card>
  );
}
