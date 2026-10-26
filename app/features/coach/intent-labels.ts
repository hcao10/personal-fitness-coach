import type { CoachIntent } from "../../../packages/product-state/src";
import type { MessageKey } from "../../lib/i18n";

/**
 * One label per coach intent.
 *
 * Shared by the dock and the full page so a refused free-text question can list
 * what it *can* answer in the reader's language rather than printing the raw
 * `how_to_perform` slugs the union is built from.
 *
 * `needsExercise` / `needsDay` are what stop the dock offering a question the
 * current context cannot answer — an exercise question with no exercise open
 * would only ever produce "pick a movement first".
 */
export const COACH_INTENT_LABELS: Array<{ intent: CoachIntent; key: MessageKey; needsExercise: boolean; needsDay: boolean }> = [
  { intent: "how_to_perform", key: "product.coach.quickHowTo", needsExercise: true, needsDay: false },
  { intent: "common_mistakes", key: "product.coach.quickMistakes", needsExercise: true, needsDay: false },
  { intent: "stop_conditions", key: "product.coach.quickStop", needsExercise: true, needsDay: false },
  { intent: "substitute_exercise", key: "product.coach.quickSwap", needsExercise: true, needsDay: false },
  { intent: "why_this_exercise", key: "product.coach.quickWhy", needsExercise: true, needsDay: false },
  { intent: "not_enough_time", key: "product.coach.quickShort", needsExercise: false, needsDay: true },
  { intent: "why_this_plan", key: "product.coach.quickWhyPlan", needsExercise: false, needsDay: false },
];

export const coachIntentLabelKey = (intent: CoachIntent): MessageKey | null =>
  COACH_INTENT_LABELS.find((entry) => entry.intent === intent)?.key ?? null;
