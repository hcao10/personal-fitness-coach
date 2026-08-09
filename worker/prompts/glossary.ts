import type { Locale } from "../../packages/i18n/src";

/**
 * Terms whose translation the product fixes rather than leaving to the model.
 *
 * Scope matters: a glossary pasted into every prompt is mostly noise, and noise
 * in a system prompt costs both tokens and instruction-following. Each task
 * declares the terms it can actually emit, and only those reach the model.
 *
 * A locale appears here only for terms it renders differently from the English
 * source. English needs no entries, which is why its map is empty rather than a
 * list of words mapped to themselves.
 */
const GLOSSARY: Record<Locale, Record<string, string>> = {
  zh: {
    // Autoregulation vocabulary. Left to the model these drift between
    // 储备次数/剩余次数/保留次数 within a single reply, and a user who learned
    // one of them cannot tell they are the same thing.
    RIR: "RIR（储备次数）",
    RPE: "RPE（自觉用力程度）",
    deload: "减载周",
    e1RM: "预估最大重量 e1RM",
    "progressive overload": "渐进超负荷",
    set: "组",
    rep: "次",
    superset: "超级组",
    tempo: "动作节奏",
    // Nutrition vocabulary.
    macros: "三大营养素",
    TDEE: "每日总消耗 TDEE",
    BMR: "基础代谢 BMR",
  },
  en: {},
};

/** Renders the glossary block for a task, or an empty string when it adds nothing. */
export function glossaryBlock(locale: Locale, terms: readonly string[]): string {
  const entries = terms
    .map((term) => [term, GLOSSARY[locale][term]] as const)
    .filter((entry): entry is readonly [string, string] => Boolean(entry[1]));
  if (!entries.length) return "";
  return [
    "TERMINOLOGY — use exactly these renderings, and do not paraphrase them:",
    ...entries.map(([term, rendering]) => `- ${term} -> ${rendering}`),
  ].join("\n");
}

export const GLOSSARY_TERMS = {
  training: ["RIR", "RPE", "deload", "e1RM", "progressive overload", "set", "rep", "superset", "tempo"],
  nutrition: ["macros", "TDEE", "BMR"],
} as const;
