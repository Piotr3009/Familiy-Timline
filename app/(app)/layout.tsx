import Link from 'next/link';
import {redirect} from 'next/navigation';
import {getFamilyContext} from '@/lib/family';
import {AppNav} from '@/components/AppNav';

export default async function AppLayout({children}: {children: React.ReactNode}) {
  const ctx = await getFamilyContext();
  if (ctx === 'no-user') redirect('/login');
  if (ctx === 'no-family') redirect('/onboarding');

  return (
    <div className="min-h-dvh pb-20 sm:pb-0">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/dashboard" className="min-w-0">
            <span className="font-heading block truncate text-lg text-amber sm:text-xl">
              {ctx.family.name}
            </span>
          </Link>
          <AppNav />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
