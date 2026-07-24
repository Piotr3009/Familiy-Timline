import Link from 'next/link';
import {redirect} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {createClient} from '@/lib/supabase/server';
import {Button} from '@/components/ui';

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: {user}
  } = await supabase.auth.getUser();
  if (user) redirect('/dashboard');

  const t = await getTranslations();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <span aria-hidden className="text-5xl">
        🌳
      </span>
      <h1 className="font-heading mt-4 text-4xl text-ink sm:text-5xl">{t('app.name')}</h1>
      <p className="mt-3 max-w-md text-ink-muted">{t('landing.pitch')}</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/register">
          <Button className="w-48">{t('auth.createAccount')}</Button>
        </Link>
        <Link href="/login">
          <Button variant="secondary" className="w-48">
            {t('auth.signIn')}
          </Button>
        </Link>
      </div>
      <p className="mt-10 max-w-sm text-xs text-ink-faint">{t('landing.inviteOnlyNote')}</p>
    </main>
  );
}
