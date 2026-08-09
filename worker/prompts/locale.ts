import { LOCALE_META, type Locale, type Localized } from "../../packages/i18n/src/index.ts";

/**
 * Instructions are written in English for every locale, on purpose.
 *
 * The alternative — a fully translated system prompt per language — is the
 * design that does not survive contact with a fourth or fifth locale: every
 * safety rule then exists in N copies, and a fix to one of them is a fix to one
 * of them. Frontier models follow English instructions at least as well as
 * translated ones, so the language of the instruction and the language of the
 * output are kept as separate concerns. What varies per locale is a directive
 * naming the target language, a short register note, and the glossary.
 */

/** Names the output language. `{tag}` and `{name}` come from the locale registry. */
export function outputDirective(locale: Locale): string {
  const meta = LOCALE_META[locale];
  return [
    `OUTPUT LANGUAGE: write every user-facing string in natural ${meta.englishLabel} (${meta.tag}).`,
    "This applies to every string field in the response, including titles, reasons and limitations.",
    "Do not mix languages, do not append a translation, and do not transliterate proper nouns that the",
    "target language normally keeps in their original script.",
  ].join(" ");
}

/**
 * The transitional directive for tasks whose schema still carries one field per
 * language. Removed by the single-locale migration of each task — until then the
 * reader's language is still named, because when the two variants cannot express
 * the same nuance, one of them has to be the one that is right.
 */
export function bilingualDirective(locale: Locale): string {
  const meta = LOCALE_META[locale];
  return [
    "OUTPUT LANGUAGE: this response schema requires one field per language; fill every one of them.",
    `The reader's language is ${meta.englishLabel} (${meta.tag}) — where the variants cannot carry the`,
    "same nuance, that one is authoritative and the others follow it.",
  ].join(" ");
}

/**
 * Register, not vocabulary. These are the conventions a translator would apply
 * that a model reaching for a dictionary will not.
 */
export const STYLE: Localized<string> = {
  zh: [
    "STYLE: address the reader as 你. Keep sentences short and plain; avoid 四字成语 and marketing register.",
    "Use half-width digits and units (12 次、60 kg、20 分钟). Keep established English abbreviations",
    "(RIR, RPE, e1RM, BMI) in Latin script rather than translating them.",
  ].join(" "),
  en: [
    "STYLE: address the reader as 'you'. Keep sentences short and plain; avoid coaching-industry cliché",
    "and hype. Use metric units, matching the numbers supplied in the input.",
  ].join(" "),
};
