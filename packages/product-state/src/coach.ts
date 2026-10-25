/**
 * Coach turn state and the structured context a question carries.
 *
 * Two things were wrong before. The composer could be enabled with no
 * conversation behind it, so `send()` returned silently and the user saw a
 * button that did nothing. And "ask the coach about this exercise" was a natural
 * language sentence stuffed into `?prompt=`, which meant the server received
 * prose and had to guess which plan, day and movement were meant.
 */

import type { CoachAnswerSource } from "./capability.ts";

/** What the user is asking, independent of the words they used. */
export type CoachIntent =
  | "how_to_perform"
  | "common_mistakes"
  | "stop_conditions"
  | "substitute_exercise"
  | "why_this_exercise"
  | "why_this_plan"
  | "not_enough_time"
  | "free_text";

/**
 * Structured, not prose. Every field is an id the server can resolve; nothing
 * here is user-authored text, so it is safe to put in a URL.
 */
export type CoachContext = {
  intent: CoachIntent;
  planId?: string;
  baseVersionId?: string;
  occurrenceId?: string;
  exerciseInstanceId?: string;
  dayIndex?: number;
  exerciseId?: string;
  /** Minutes actually available, for `not_enough_time`. */
  availableMinutes?: number;
};

export const COACH_CONTEXT_PARAMS = ["intent", "planId", "dayIndex", "exerciseId", "availableMinutes", "baseVersionId", "occurrenceId", "exerciseInstanceId"] as const;

const INTENTS = new Set<CoachIntent>([
  "how_to_perform", "common_mistakes", "stop_conditions", "substitute_exercise",
  "why_this_exercise", "why_this_plan", "not_enough_time", "free_text",
]);

export function encodeCoachContext(context: CoachContext): string {
  const params = new URLSearchParams();
  params.set("intent", context.intent);
  if (context.planId) params.set("planId", context.planId);
  for (const key of ["baseVersionId", "occurrenceId", "exerciseInstanceId"] as const) if (context[key]) params.set(key, context[key]);
  if (context.dayIndex !== undefined) params.set("dayIndex", String(context.dayIndex));
  if (context.exerciseId) params.set("exerciseId", context.exerciseId);
  if (context.availableMinutes !== undefined) params.set("availableMinutes", String(context.availableMinutes));
  return params.toString();
}

/** Tolerant of anything: an unknown intent degrades to free text, never throws. */
export function decodeCoachContext(search: string | URLSearchParams): CoachContext | null {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const raw = params.get("intent");
  if (!raw) return null;
  const intent = INTENTS.has(raw as CoachIntent) ? raw as CoachIntent : "free_text";
  const dayIndex = params.has("dayIndex") ? Number(params.get("dayIndex")) : NaN;
  const availableMinutes = Number(params.get("availableMinutes"));
  return {
    intent,
    planId: params.get("planId") || undefined,
    ...(params.get("baseVersionId") ? { baseVersionId: params.get("baseVersionId")! } : {}),
    ...(params.get("occurrenceId") ? { occurrenceId: params.get("occurrenceId")! } : {}),
    ...(params.get("exerciseInstanceId") ? { exerciseInstanceId: params.get("exerciseInstanceId")! } : {}),
    dayIndex: Number.isInteger(dayIndex) && dayIndex >= 0 && dayIndex <= 6 ? dayIndex : undefined,
    exerciseId: params.get("exerciseId") || undefined,
    availableMinutes: Number.isFinite(availableMinutes) && availableMinutes > 0 ? Math.min(600, availableMinutes) : undefined,
  };
}

export type CoachProposedAction = { id: string; type: string; status: "pending" | "accepted" | "rejected" | "expired" | "failed" };

export type CoachTurnState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "streaming"; text: string }
  | { status: "answered"; source: CoachAnswerSource; text: string; actions: CoachProposedAction[] }
  | { status: "error"; code: string; retryable: boolean };

/**
 * Whether the composer may send.
 *
 * The old check was `!active || !content || sending`, evaluated inside `send()`
 * — so the button rendered enabled and then did nothing. Here the same decision
 * produces a reason, which the button uses to disable itself and the UI uses to
 * explain why.
 */
export type ComposerReadiness =
  | { canSend: true }
  | { canSend: false; reason: "empty" | "busy" | "no_conversation" | "sign_in_required" | "not_configured" };

export function composerReadiness(input: {
  text: string;
  turn: CoachTurnState;
  /** Null when no conversation exists yet — server chat needs one, rules mode does not. */
  conversationId: string | null;
  mode: "ai" | "rules";
  signedIn: boolean;
  accountsConfigured: boolean;
}): ComposerReadiness {
  if (!input.text.trim()) return { canSend: false, reason: "empty" };
  if (input.turn.status === "sending" || input.turn.status === "streaming") return { canSend: false, reason: "busy" };
  if (input.mode === "rules") return { canSend: true };
  if (!input.signedIn) {
    return { canSend: false, reason: input.accountsConfigured ? "sign_in_required" : "not_configured" };
  }
  if (!input.conversationId) return { canSend: false, reason: "no_conversation" };
  return { canSend: true };
}
