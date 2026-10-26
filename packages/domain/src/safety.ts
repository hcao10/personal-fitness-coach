// Per-language safety triage for coach conversations.
//
// This module is deliberately dependency-free so the published open-source
// package stays standalone; locale codes are plain strings that match the
// registry in packages/i18n.
//
// Two design rules, both learned from the version this replaces:
//
// 1. EVERY language's patterns are applied to EVERY message, regardless of the
//    user's interface locale. Someone whose UI is English can still type "胸痛",
//    and someone whose UI is Chinese can type "chest pain". Filtering patterns
//    by the declared locale would create exactly the blind spot this rewrite
//    exists to close: the previous screen matched Chinese plus three fixed
//    English phrases, so a Spanish user reporting chest pain was invisible.
//
// 2. Severity is split. A red-flag symptom means the only correct answer is
//    "stop and get help", so it short-circuits. A high pain score does not: a
//    lifter saying "my knee is 5/10, what should I do?" deserves a real answer
//    about swapping the movement, and refusing to answer pushes them to guess
//    alone. Caution-level messages proceed to the coach with guidance appended
//    and every intensity-raising action withheld.

// Coach actions that would raise training stress. Withheld whenever either
// safety layer — this keyword screen or the model's own classification —
// reports risk, at caution level as well as emergency.
export const INTENSITY_RAISING_ACTIONS = new Set(["adjust_load", "plan_adjustment"]);

export function actionsAllowedUnderRisk<T extends { type: string }>(actions: T[], highRisk: boolean): T[] {
  return highRisk ? actions.filter((action) => !INTENSITY_RAISING_ACTIONS.has(action.type)) : actions;
}

export type SafetyLevel = "none" | "caution" | "emergency";

export type SafetyAssessment = {
  level: SafetyLevel;
  /** True for caution and emergency alike — gates intensity-raising actions. */
  highRisk: boolean;
  /** Reported pain on a 0–10 scale when the message states one. */
  pain: number | null;
  /** Which pattern groups fired, for evaluation records and debugging. */
  matched: string[];
};

/** Pain at or above this level must never lead to more intensity. */
export const PAIN_THRESHOLD = 4;

type PatternSet = {
  /** Explicit pain ratings. Capture group 1 must be the 0–10 number. */
  painScore: RegExp[];
  /** Symptoms that require stopping and seeking help, with or without a score. */
  redFlags: RegExp[];
};

// Numeric forms carry across languages: "7/10", "7 out of 10" shares the digits
// with "7 分". Registering them once means a language that has not been
// translated yet still catches a stated score.
const LANGUAGE_AGNOSTIC: PatternSet = {
  painScore: [
    /(\d{1,2})\s*\/\s*10/,
    /(\d{1,2})\s*(?:分|點|点)\s*(?:的)?\s*(?:疼|痛)/,
  ],
  redFlags: [],
};

const ZH: PatternSet = {
  painScore: [
    /(?:疼痛|疼|痛)(?:感|程度|等级)?\s*(?:为|是|大概|约|到|达)?\s*[:：]?\s*(\d{1,2})/,
    /(\d{1,2})\s*(?:分|级)\s*(?:的)?\s*(?:疼痛|疼|痛)/,
  ],
  redFlags: [
    /胸痛|胸闷|胸口(?:痛|闷|压)/,
    /晕厥|昏厥|昏倒|失去意识|眩晕|头晕目眩/,
    /呼吸困难|喘不(?:过|上)气|无法呼吸/,
    /无法承重|不能负重|站不住|腿软/,
    /麻木|发麻|刺痛感|失去知觉/,
    /关节(?:错位|脱臼)|脱臼|骨折|听到(?:响|咔)/,
    /心悸|心跳(?:异常|过快|不规律)/,
    /持续(?:加重|恶化)的?(?:疼痛|疼|痛)/,
  ],
};

const EN: PatternSet = {
  painScore: [
    /(?:pain|hurt(?:s|ing)?|sore(?:ness)?)\s*(?:level|score|is|at|of|rated)?\s*[:=]?\s*(\d{1,2})\b/i,
    /(\d{1,2})\s*(?:out of|\/)\s*10\b/i,
    /\b(?:pain|hurts?)\b[^.!?]{0,24}\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+out of\s+ten\b/i,
  ],
  redFlags: [
    /chest\s*(?:pain|pressure|tightness|discomfort)/i,
    /\b(?:faint(?:ed|ing)?|pass(?:ed)? out|black(?:ed)? out|lightheaded|dizzy|dizziness)\b/i,
    /(?:can(?:no|')?t|unable to|trouble|difficulty)\s+breath(?:e|ing)|short(?:ness)? of breath/i,
    /(?:can(?:no|')?t|unable to)\s+(?:bear weight|put weight|stand|walk)/i,
    /\b(?:numb(?:ness)?|tingling|no feeling|lost feeling)\b/i,
    /\b(?:dislocat\w*|fractur\w*|broken bone|heard a (?:pop|crack|snap))\b/i,
    /\b(?:heart (?:racing|palpitations)|palpitations|irregular heartbeat)\b/i,
    /pain (?:keeps? )?(?:getting worse|worsening)|worsening pain/i,
  ],
};

/**
 * Locale-keyed registry. A locale may not be added to SHIPPABLE_LOCALES until
 * it appears here AND its entries pass the coverage test — that gate is what
 * stops a language shipping with a safety screen that cannot read it.
 */
export const SAFETY_PATTERNS: Record<string, PatternSet> = {
  any: LANGUAGE_AGNOSTIC,
  zh: ZH,
  en: EN,
};

/** Written guidance per locale. Falls back to Chinese, the authored source. */
export const SAFETY_GUIDANCE: Record<string, string> = {
  zh: "请停止引发不适的动作。若出现胸痛、晕厥、呼吸困难、无法承重或持续加重的疼痛，请及时寻求医疗帮助。以上内容不是医疗诊断。",
  en: "Stop any movement that causes discomfort. Seek medical help promptly for chest pain, fainting, difficulty breathing, inability to bear weight, or pain that keeps worsening. This is not a medical diagnosis.",
};

export const safetyGuidance = (locale: string): string => SAFETY_GUIDANCE[locale] ?? SAFETY_GUIDANCE.zh;

/**
 * Attached to every emergency reply as its stated limitation. Deterministic
 * product copy, so it is rendered in the reader's language rather than frozen
 * in the language it happened to be authored in — the opposite rule from
 * model-written text, and for the opposite reason: this string was reviewed by
 * a human in each language.
 */
export const MEDICAL_DISCLAIMER: Record<string, string> = {
  zh: "这不是医疗诊断。",
  en: "This is not a medical diagnosis.",
};

export const medicalDisclaimer = (locale: string): string => MEDICAL_DISCLAIMER[locale] ?? MEDICAL_DISCLAIMER.zh;

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

function highestPain(text: string): number | null {
  let highest: number | null = null;
  for (const [language, patterns] of Object.entries(SAFETY_PATTERNS)) {
    void language;
    for (const pattern of patterns.painScore) {
      // Patterns are authored without /g; scan repeatedly so a message stating
      // several scores is judged on the worst one.
      const scanner = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
      for (const match of text.matchAll(scanner)) {
        const raw = match[1];
        const value = WORD_NUMBERS[raw?.toLowerCase()] ?? Number(raw);
        if (!Number.isFinite(value) || value < 0 || value > 10) continue;
        highest = highest === null ? value : Math.max(highest, value);
      }
    }
  }
  return highest;
}

export function assessSafety(text: string): SafetyAssessment {
  const matched: string[] = [];
  for (const [language, patterns] of Object.entries(SAFETY_PATTERNS)) {
    for (const pattern of patterns.redFlags) {
      if (pattern.test(text)) matched.push(`${language}:redflag`);
    }
  }
  const pain = highestPain(text);
  if (matched.length) return { level: "emergency", highRisk: true, pain, matched: [...new Set(matched)] };
  if (pain !== null && pain >= PAIN_THRESHOLD) {
    return { level: "caution", highRisk: true, pain, matched: ["pain:threshold"] };
  }
  return { level: "none", highRisk: false, pain, matched: [] };
}

/**
 * Backwards-compatible wrapper. `message` is the Chinese guidance by default;
 * callers that know the user's locale should use assessSafety + safetyGuidance.
 */
export function coachSafetyFlags(text: string, locale = "zh"): { highRisk: boolean; pain: number | null; message?: string; level: SafetyLevel } {
  const assessment = assessSafety(text);
  return assessment.highRisk
    ? { highRisk: true, pain: assessment.pain, level: assessment.level, message: safetyGuidance(locale) }
    : { highRisk: false, pain: assessment.pain, level: assessment.level };
}
