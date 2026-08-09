"use client";

import { DEFAULT_LOCALE, errorMessage, type Locale } from "../../packages/i18n/src";

export type ApiErrorBody = { error?: string; message?: string };

/**
 * Renders a server error in the user's language.
 *
 * The API returns a stable machine code alongside its authored text. Translation
 * happens here rather than on the server because a Worker isolate serves
 * concurrent requests — a per-request locale held server-side would be a race —
 * and because the browser knows the user's chosen language directly.
 *
 * The resolution order matters, and the obvious order is wrong. `body.message`
 * is authored in ONE language (Chinese, the language this product was written
 * in), so handing it to an English reader for want of a catalog entry shows them
 * Chinese while a perfectly good English fallback sits unused. That is not a
 * hypothetical: it was live on five pages, and it made every English fallback
 * string in those files dead code, because the server always sends `message`.
 *
 * So: the catalog first, then the caller's own fallback, and the server's text
 * only for a reader who reads the language it was written in.
 */
export function localizeApiError(body: ApiErrorBody | null | undefined, locale: Locale, fallback: string): string {
  if (!body) return fallback;
  const translated = body.error ? errorMessage(body.error, locale) : null;
  if (translated) return translated;
  if (locale === DEFAULT_LOCALE && body.message) return body.message;
  return fallback;
}
