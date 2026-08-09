// Explicit .ts extensions so Node's type stripping can load these directly in
// tests; the bundler resolves them the same way.
export * from "./locales.ts";
export * from "./format.ts";
export { MESSAGES, type Messages } from "./messages/index.ts";

import { format } from "./format.ts";
import { DEFAULT_LOCALE, type Locale } from "./locales.ts";
import { MESSAGES, type Messages } from "./messages/index.ts";

type Namespace = keyof Messages;
// "home.saveButton" | "error.AUTH_REQUIRED" | ...
export type MessageKey = {
  [N in Namespace]: `${N & string}.${keyof Messages[N] & string}`;
}[Namespace];

/**
 * Returns a translator bound to one locale. Keys are checked at compile time,
 * so a typo or a removed message is a build failure rather than raw key text
 * rendered to a user.
 */
export function translator(locale: Locale) {
  const catalog = MESSAGES[locale] || MESSAGES[DEFAULT_LOCALE];
  return (key: MessageKey, params?: Record<string, string | number>): string => {
    const [namespace, name] = key.split(".") as [Namespace, string];
    const table = catalog[namespace] as Record<string, string>;
    return format(table[name], params);
  };
}

/** Localized message for a server error code, for clients that only get a code. */
export function errorMessage(code: string, locale: Locale): string | null {
  const table = (MESSAGES[locale] || MESSAGES[DEFAULT_LOCALE]).error as Record<string, string>;
  return table[code] ?? null;
}
