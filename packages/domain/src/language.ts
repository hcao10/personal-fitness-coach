import { LOCALE_META, type Locale } from "../../i18n/src/index.ts";

/**
 * Verifies what language a model actually wrote in.
 *
 * The model is also asked to echo the locale it used, but a field the model
 * fills in is a claim, not evidence: a model that ignored the output directive
 * will just as happily echo the locale it was told to use. Script ratio is
 * measured from the text itself, so the two disagree exactly when something went
 * wrong — which is the signal worth recording.
 *
 * What this deliberately does NOT do is guess between languages that share a
 * script. Distinguishing English from Spanish needs an n-gram model, and a
 * wrong answer there is worse than no answer: it would raise mismatch alarms on
 * correct output and teach everyone to ignore them. Those pairs return null
 * with an explicit reason instead.
 */

type Script = "han" | "latin";

/**
 * Script each locale is written in. Typed against Locale so that adding a
 * language to the registry without deciding its script fails to compile —
 * an unregistered locale must never fall through as "its own unique script",
 * which would make the detector confidently name the wrong language.
 */
const LOCALE_SCRIPT: Record<Locale, Script> = {
  zh: "han",
  en: "latin",
};

export type ScriptCounts = { han: number; latin: number; other: number; total: number };

const HAN = /\p{Script=Han}/u;
const LATIN = /\p{Script=Latin}/u;
// Digits, punctuation, whitespace, emoji and units carry no language signal.
const NEUTRAL = /[\s\d\p{P}\p{S}]/u;

export function countScripts(text: string): ScriptCounts {
  let han = 0, latin = 0, other = 0;
  for (const char of text) {
    if (NEUTRAL.test(char)) continue;
    if (HAN.test(char)) han += 1;
    else if (LATIN.test(char)) latin += 1;
    else other += 1;
  }
  return { han, latin, other, total: han + latin + other };
}

/**
 * Chinese prose legitimately carries Latin characters — RIR, RPE, e1RM, kg —
 * so the test cannot be "any Latin means English". It is a ratio, and this is
 * where it sits: a 20-character Chinese sentence containing "RIR" is 0.87 Han,
 * while a 100-letter English sentence containing 深蹲 is 0.02.
 */
const HAN_RATIO_THRESHOLD = 0.2;

/** Below this there is not enough text to measure anything. */
const MIN_CHARS = 8;

export type LanguageVerdict = {
  locale: Locale | null;
  /** Why no locale was returned. Null when one was. */
  reason: "too_short" | "unknown_script" | "script_ambiguous" | "no_candidate_matched" | null;
  counts: ScriptCounts;
};

/**
 * @param candidates the locales the call could legitimately have produced —
 *   normally the shippable set. Narrowing it does not make the answer more
 *   confident, it only limits what the answer may be.
 */
export function detectContentLocale(text: string, candidates: readonly Locale[]): LanguageVerdict {
  const counts = countScripts(text || "");
  if (counts.total < MIN_CHARS) return { locale: null, reason: "too_short", counts };

  // A candidate whose script was never declared makes the whole comparison
  // meaningless: it would be excluded from every script bucket and the answer
  // would be some other locale, stated with full confidence.
  if (candidates.some((locale) => !LOCALE_SCRIPT[locale])) return { locale: null, reason: "unknown_script", counts };
  // Two candidates in one script: an honest detector stops here.
  const scripts = new Set(candidates.map((locale) => LOCALE_SCRIPT[locale]));
  if (scripts.size < candidates.length) return { locale: null, reason: "script_ambiguous", counts };

  const hanRatio = counts.han / (counts.han + counts.latin || 1);
  const script = hanRatio >= HAN_RATIO_THRESHOLD ? "han" : "latin";
  const match = candidates.find((locale) => LOCALE_SCRIPT[locale] === script);
  return match ? { locale: match, reason: null, counts } : { locale: null, reason: "no_candidate_matched", counts };
}

/**
 * Compares what was asked for, what the model claimed, and what it wrote.
 *
 * Report-only by design at this stage: the first thing to learn is how often
 * models drift at all, and on which routes. Acting on a signal whose false
 * positive rate is unmeasured would mean retrying good generations, which costs
 * money and latency to fix a problem that may not exist.
 */
export type LocaleAudit = {
  requested: Locale;
  claimed: Locale | null;
  detected: Locale | null;
  /** True only when detection succeeded and disagrees with the request. */
  mismatch: boolean;
  reason: LanguageVerdict["reason"];
};

export function auditContentLocale(input: {
  requested: Locale;
  claimed?: string | null;
  text: string;
  candidates: readonly Locale[];
}): LocaleAudit {
  const verdict = detectContentLocale(input.text, input.candidates);
  const claimed = input.claimed && input.claimed in LOCALE_META ? input.claimed as Locale : null;
  return {
    requested: input.requested,
    claimed,
    detected: verdict.locale,
    mismatch: verdict.locale !== null && verdict.locale !== input.requested,
    reason: verdict.reason,
  };
}
