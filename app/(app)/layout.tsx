import Link from 'next/link';
import {redirect} from 'next/navigation';
import {getFamilyContext} from '@/lib/family';
import {AppNav} from '@/components/AppNav';
import {BackgroundDecor} from '@/components/BackgroundDecor';
import {NotificationsBell} from '@/components/notifications/NotificationsBell';
import {PersonAvatar} from '@/components/ui';
import {personName} from '@/lib/persons/relations';
import {createClient} from '@/lib/supabase/server';
import {createSignedUrls} from '@/lib/media';

export default async function AppLayout({children}: {children: React.ReactNode}) {
  const ctx = await getFamilyContext();
  if (ctx === 'no-user') redirect('/login');
  if (ctx === 'no-family') redirect('/onboarding');
  let headerAvatarUrl: string | null = null;
  if (ctx.person?.avatar_url) {
    const supabase = await createClient();
    const urls = await createSignedUrls(supabase, 'avatars', [ctx.person.avatar_url]);
    headerAvatarUrl = urls.get(ctx.person.avatar_url) ?? null;
  }

  return (
    <div className="min-h-dvh pb-20 sm:pb-0">
      <BackgroundDecor />
      <header className="sticky top-0 z-30 bg-surface-raised/95 shadow-[0_4px_22px_rgba(78,55,28,0.05)] backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/dashboard" className="min-w-0">
            <span className="font-logo block truncate text-xl text-[#cc5d00] sm:text-2xl">
              {ctx.family.name}
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <AppNav />
            <NotificationsBell userId={ctx.user.id} />
            {ctx.person ? (
              <Link
                href={`/people/${ctx.person.id}`}
                className="ml-1 hidden items-center gap-2 rounded-full border border-border bg-surface-raised py-1 pl-1 pr-3 sm:flex"
              >
                <PersonAvatar
                  name={personName(ctx.person)}
                  src={headerAvatarUrl}
                  size="sm"
                />
                <span className="max-w-32 truncate text-sm text-ink">
                  {personName(ctx.person)}
                </span>
              </Link>
            ) : null}
          </div>
        </div>
      </header>
      <main className="app-content mx-auto w-full max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
