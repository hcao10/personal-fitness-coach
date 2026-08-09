// Explicit .ts extensions so Node's type stripping can load these directly in
// tests; the bundler resolves them the same way.
export * from "./locales.ts";
export * from "./format.ts";
export { MESSAGES, type Messages } from "./messages/index.ts";

import { format } from "./format.ts";
import { DEFAULT_LOCALE, type Locale } from "./locales.ts";
import { MESSAGES, type Messages } from "./messages/index.ts";

type Namespace = keyof Messages;

/**
 * Every dotted path that ends at a string, at any depth.
 *
 * This used to stop at two levels, which quietly made grouping a trap: a nested
 * object typechecked as a key and rendered "[object Object]". With a
 * thousand-key catalog, grouping is how the thing stays readable, so it has to
 * work rather than merely compile.
 */
type Path<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Path<T[K]>}`;
}[keyof T & string];

// "home.saveButton" | "error.AUTH_REQUIRED" | "progress.reviewKind.deload.title" | ...
export type MessageKey = { [N in Namespace]: `${N & string}.${Path<Messages[N]>}` }[Namespace];

/**
 * Returns a translator bound to one locale. Keys are checked at compile time,
 * so a typo or a removed message is a build failure rather than raw key text
 * rendered to a user.
 */
export function translator(locale: Locale) {
  const catalog = MESSAGES[locale] || MESSAGES[DEFAULT_LOCALE];
  return (key: MessageKey, params?: Record<string, string | number>): string => {
    let node: unknown = catalog;
    for (const segment of key.split(".")) {
      node = (node as Record<string, unknown> | undefined)?.[segment];
    }
    // A non-string here means the key names a group rather than a message. The
    // type system rules that out, so this only fires for a value crossing a
    // runtime boundary — better a visible key than "[object Object]".
    return typeof node === "string" ? format(node, params) : key;
  };
}

/** Localized message for a server error code, for clients that only get a code. */
export function errorMessage(code: string, locale: Locale): string | null {
  const table = (MESSAGES[locale] || MESSAGES[DEFAULT_LOCALE]).error as Record<string, string>;
  return table[code] ?? null;
}
