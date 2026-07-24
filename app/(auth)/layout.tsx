import {getTranslations} from 'next-intl/server';
import Link from 'next/link';

export default async function AuthLayout({children}: {children: React.ReactNode}) {
  const t = await getTranslations('app');
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="mb-8 text-center">
        <span className="font-heading text-3xl text-amber">{t('name')}</span>
        <p className="mt-1 text-sm text-ink-muted">{t('tagline')}</p>
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
