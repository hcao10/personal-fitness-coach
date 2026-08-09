import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, isShippableLocale, localeFromAcceptLanguage, type Locale } from "../../packages/i18n/src";

export const LOCALE_COOKIE = "cmine_fit_locale";

/**
 * Resolves the locale for a server render, in priority order:
 *   1. the cookie the user's own language choice wrote,
 *   2. the browser's Accept-Language, restricted to locales we actually ship,
 *   3. the default.
 *
 * Reading this server-side is what makes `<html lang>` and the page metadata
 * correct on the first byte, rather than after a client-side correction.
 */
export async function resolveLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const stored = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isShippableLocale(stored)) return stored;
  const requestHeaders = await headers();
  return localeFromAcceptLanguage(requestHeaders.get("accept-language")) || DEFAULT_LOCALE;
}
