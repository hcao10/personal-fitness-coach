"use client";

import { errorMessage, type Locale } from "../../packages/i18n/src";

export type ApiErrorBody = { error?: string; message?: string };

/**
 * Renders a server error in the user's language.
 *
 * The API returns a stable machine code alongside its authored Chinese text.
 * Translation happens here rather than on the server because a Worker isolate
 * serves concurrent requests — a per-request locale held server-side would be a
 * race — and because the browser knows the user's chosen language directly.
 * Unknown codes fall back to the server's own message rather than to a raw key.
 */
export function localizeApiError(body: ApiErrorBody | null | undefined, locale: Locale, fallback: string): string {
  if (!body) return fallback;
  return (body.error ? errorMessage(body.error, locale) : null) ?? body.message ?? fallback;
}
