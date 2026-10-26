// Locale registry and message catalog live in packages/i18n so the web app, the
// worker and the Expo app share one source of truth. This module is the thin
// web-side adapter.
import { LOCALE_META, SHIPPABLE_LOCALES, type Locale } from "../../packages/i18n/src";

export type { Locale };
export type DisplayLanguage = Locale;
export { translator, type MessageKey } from "../../packages/i18n/src";

// Only locales that passed the launch gate are offered. A locale that merely
// compiles is deliberately not shown — that gap is what let a nine-language
// picker ship with seven of them rendering English.
export const languageOptions: { value: Locale; label: string }[] =
  SHIPPABLE_LOCALES.map((locale) => ({ value: locale, label: LOCALE_META[locale].nativeLabel }));
