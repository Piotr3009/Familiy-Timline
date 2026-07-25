'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useTranslations} from 'next-intl';

const NAV_ITEMS = [
  {href: '/dashboard', key: 'dashboard', icon: '🏠'},
  {href: '/tree', key: 'tree', icon: '🌳'},
  {href: '/timeline', key: 'timeline', icon: '🕰️'},
  {href: '/photos', key: 'photos', icon: '🖼️'},
  {href: '/events', key: 'events', icon: '📅'},
  {href: '/settings', key: 'settings', icon: '⚙️'}
] as const;

function cx(...parts: Array<string | false>): string {
  return parts.filter(Boolean).join(' ');
}

/** Top nav on desktop, bottom tab bar on mobile (mobile-first). */
export function AppNav() {
  const t = useTranslations('nav');
  const pathname = usePathname();

  return (
    <>
      <nav className="hidden items-center gap-1 sm:flex">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cx(
                'relative px-3 py-2 text-sm transition-colors',
                active
                  ? 'font-medium text-amber-strong after:absolute after:inset-x-3 after:-bottom-[13px] after:h-[3px] after:rounded-t-[3px] after:bg-amber'
                  : 'text-ink-muted hover:text-ink'
              )}
            >
              {t(item.key)}
            </Link>
          );
        })}
      </nav>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface-raised/95 backdrop-blur sm:hidden">
        <div className="mx-auto flex max-w-lg items-stretch justify-between px-2 pb-[env(safe-area-inset-bottom)]">
          {NAV_ITEMS.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cx(
                  'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]',
                  active ? 'font-medium text-amber-strong' : 'text-ink-muted'
                )}
              >
                <span aria-hidden className="text-lg leading-none">
                  {item.icon}
                </span>
                {t(item.key)}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
