import type {Metadata, Viewport} from 'next';
import {Inter, Kaushan_Script, Playfair_Display} from 'next/font/google';
import {cookies} from 'next/headers';
import {NextIntlClientProvider} from 'next-intl';
import {getLocale, getMessages, getTranslations} from 'next-intl/server';
import {THEME_COOKIE, isTheme, type Theme} from '@/i18n/config';
import './globals.css';

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-inter',
  display: 'swap'
});

const playfair = Playfair_Display({
  subsets: ['latin', 'latin-ext'],
  weight: ['700'],
  variable: '--font-playfair',
  display: 'swap'
});

const kaushan = Kaushan_Script({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-logo',
  display: 'swap'
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return {
    title: {default: t('name'), template: `%s · ${t('name')}`},
    description: t('tagline'),
    manifest: '/manifest.webmanifest',
    appleWebApp: {capable: true, statusBarStyle: 'default', title: t('name')}
  };
}

export const viewport: Viewport = {
  themeColor: [
    {media: '(prefers-color-scheme: light)', color: '#faf5ea'},
    {media: '(prefers-color-scheme: dark)', color: '#201b16'}
  ],
  width: 'device-width',
  initialScale: 1
};

/**
 * Applies the `dark` class before hydration when theme = system,
 * so there is no flash of the wrong theme.
 */
const systemThemeScript = `
(function () {
  try {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}
})();
`;

export default async function RootLayout({children}: {children: React.ReactNode}) {
  const locale = await getLocale();
  const messages = await getMessages();
  const cookieStore = await cookies();
  const rawTheme = cookieStore.get(THEME_COOKIE)?.value ?? 'light';
  const theme: Theme = isTheme(rawTheme) ? rawTheme : 'light';

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${playfair.variable} ${kaushan.variable} ${theme === 'dark' ? 'dark' : ''}`}
      suppressHydrationWarning
    >
      <head>
        {theme === 'system' ? (
          <script dangerouslySetInnerHTML={{__html: systemThemeScript}} />
        ) : null}
      </head>
      <body className="min-h-dvh">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
