export const locales = ['en', 'pl'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

/**
 * Adding a future language = add its code here + create messages/<code>.json.
 * No other code changes are required.
 */
export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export const LOCALE_COOKIE = 'ft_locale';
export const THEME_COOKIE = 'ft_theme';

export type Theme = 'light' | 'dark' | 'system';

export function isTheme(value: string): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}
