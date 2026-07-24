import {cookies} from 'next/headers';
import {getRequestConfig} from 'next-intl/server';
import {defaultLocale, isLocale, LOCALE_COOKIE} from './config';

/**
 * Cookie-based locale resolution (no locale prefix in URLs).
 * The middleware seeds the cookie from Accept-Language on first visit;
 * the settings page overwrites it (and persists the choice on the account).
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = cookieLocale && isLocale(cookieLocale) ? cookieLocale : defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default
  };
});
