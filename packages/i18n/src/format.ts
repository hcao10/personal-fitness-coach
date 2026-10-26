import { DEFAULT_LOCALE, LOCALE_META, type Locale } from "./locales.ts";

/**
 * Interpolates `{name}` placeholders. Deliberately tiny: an ICU compiler would
 * add a build dependency for the handful of messages that need more than this,
 * and the parity test already asserts that every locale uses the same
 * placeholder set, which is the failure mode interpolation actually has.
 */
export function format(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    (key in params ? String(params[key]) : match));
}

/** Placeholder names used by a message, for the catalog parity test. */
export function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

/**
 * Plural selection backed by Intl.PluralRules, so a locale with more than the
 * two English categories (Russian has four) is a catalog change rather than a
 * code change.
 */
export function plural(locale: Locale, count: number, forms: Partial<Record<Intl.LDMLPluralRule, string>>): string {
  const rule = new Intl.PluralRules(LOCALE_META[locale].tag).select(count);
  const template = forms[rule] ?? forms.other ?? "";
  return format(template, { count });
}

export const dateFormatter = (locale: Locale, options?: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(LOCALE_META[locale]?.tag || LOCALE_META[DEFAULT_LOCALE].tag, options);

export const numberFormatter = (locale: Locale, options?: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat(LOCALE_META[locale]?.tag || LOCALE_META[DEFAULT_LOCALE].tag, options);
