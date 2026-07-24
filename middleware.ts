import {NextResponse, type NextRequest} from 'next/server';
import {createServerClient} from '@supabase/ssr';
import {
  defaultLocale,
  isLocale,
  isTheme,
  LOCALE_COOKIE,
  locales,
  THEME_COOKIE
} from '@/i18n/config';

/** Routes reachable without a session. */
const PUBLIC_PATHS = [
  '/',
  '/login',
  '/register',
  '/verify-email',
  '/forgot-password',
  '/reset-password'
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname.startsWith('/auth/')) return true;
  if (pathname.startsWith('/invite/')) return true;
  return false;
}

/** Picks the best supported locale from the Accept-Language header. */
function detectLocale(request: NextRequest): string {
  const header = request.headers.get('accept-language');
  if (!header) return defaultLocale;
  for (const part of header.split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase();
    if (!tag) continue;
    const base = tag.split('-')[0];
    if (base && isLocale(base)) return base;
  }
  return defaultLocale;
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({request});

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({name, value}) => request.cookies.set(name, value));
          response = NextResponse.next({request});
          cookiesToSet.forEach(({name, value, options}) =>
            response.cookies.set(name, value, options)
          );
        }
      }
    }
  );

  // IMPORTANT: getUser() revalidates the JWT with Supabase and refreshes
  // the session cookies — do not replace with getSession().
  const {
    data: {user}
  } = await supabase.auth.getUser();

  const {pathname} = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  const cookieOptions = {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax' as const
  };

  // Locale: account setting overrides > existing cookie > browser language.
  const metadataLocale = user?.user_metadata?.locale;
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  if (typeof metadataLocale === 'string' && isLocale(metadataLocale)) {
    if (cookieLocale !== metadataLocale) {
      response.cookies.set(LOCALE_COOKIE, metadataLocale, cookieOptions);
    }
  } else if (!cookieLocale) {
    response.cookies.set(LOCALE_COOKIE, detectLocale(request), cookieOptions);
  } else if (!locales.includes(cookieLocale as (typeof locales)[number])) {
    response.cookies.set(LOCALE_COOKIE, defaultLocale, cookieOptions);
  }

  // Theme: account setting overrides the cookie (light is the default).
  const metadataTheme = user?.user_metadata?.theme;
  const cookieTheme = request.cookies.get(THEME_COOKIE)?.value;
  if (
    typeof metadataTheme === 'string' &&
    isTheme(metadataTheme) &&
    cookieTheme !== metadataTheme
  ) {
    response.cookies.set(THEME_COOKIE, metadataTheme, cookieOptions);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets and images.
     */
    '/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'
  ]
};
