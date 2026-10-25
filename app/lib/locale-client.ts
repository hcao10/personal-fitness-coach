"use client";

import { DEFAULT_LOCALE, isShippableLocale, type Locale } from "../../packages/i18n/src";

export const LOCALE_COOKIE = "cmine_fit_locale";

export function readLocale(): Locale {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const match = document.cookie.split("; ").find((part) => part.startsWith(`${LOCALE_COOKIE}=`));
  const value = match?.slice(LOCALE_COOKIE.length + 1);
  return isShippableLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * Persists the choice in three places, each for a different reason:
 *  - the cookie, so the next server render emits the right <html lang> and
 *    metadata on the first byte;
 *  - users.locale, so LLM replies, push notifications and the weekly coach
 *    letter follow the same choice (they run without a browser);
 *  - a reload, because most of the product still renders from server data.
 */
export async function persistLocale(locale: Locale): Promise<void> {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${365 * 24 * 3600}; samesite=lax`;
  await fetch("/api/v1/me/locale", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ locale }),
  }).catch(() => undefined);
  // Server-produced briefs, saved-plan prose and metadata are locale-bound.
  // Reload only after persistence finishes so the new render and every
  // background API request observe the same language.
  window.location.reload();
}
