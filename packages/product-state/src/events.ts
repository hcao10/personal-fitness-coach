/**
 * Product events for the core funnel.
 *
 * An internal typed sink, not an analytics vendor: the point is that the funnel
 * `profile_completed → plan_accepted → workout_started → workout_completed →
 * workout_feedback_submitted` can be measured at all, and that adding an event
 * is a compile-time change rather than a free-form string.
 *
 * What is deliberately absent: no question text, no limitations text, no name,
 * no email. `coach_question_sent` carries the intent and which context fields
 * were present, never what was typed.
 */

import type { CoachIntent } from "./coach.ts";
import type { PlanSource } from "./capability.ts";

export type ProductEvent =
  | { name: "profile_started"; mode: "guest" | "account" }
  | { name: "profile_completed"; mode: "guest" | "account"; steps: number }
  | { name: "plan_generated"; source: PlanSource; mode: "guest" | "account" }
  | { name: "plan_accepted"; source: PlanSource; mode: "guest" | "account" }
  | { name: "exercise_viewed"; surface: "plan" | "today" | "library" | "coach"; hasMedia: boolean }
  | { name: "workout_started"; mode: "guest" | "account"; variant: "standard" | "short" | "recovery" }
  | { name: "workout_completed"; mode: "guest" | "account"; setsLogged: number }
  | { name: "workout_feedback_submitted"; advice: string; painFlagged: boolean }
  | { name: "coach_opened"; surface: "dock" | "page" | "exercise" }
  | { name: "coach_question_sent"; intent: CoachIntent; source: "ai" | "rules"; hasExerciseContext: boolean }
  | { name: "coach_action_accepted"; actionType: string }
  | { name: "coach_action_rejected"; actionType: string };

export type ProductEventName = ProductEvent["name"];

export const FUNNEL: ProductEventName[] = [
  "profile_completed", "plan_accepted", "workout_started", "workout_completed", "workout_feedback_submitted",
];

export type EventSink = (event: ProductEvent & { at: string }) => void;

/**
 * A bounded in-memory sink.
 *
 * Bounded because an unbounded array in a long-lived tab is a leak, and because
 * nothing downstream needs more than the recent tail — the funnel is counted,
 * not replayed.
 */
export function createEventSink(limit = 200): { emit: (event: ProductEvent) => void; drain: () => Array<ProductEvent & { at: string }>; peek: () => Array<ProductEvent & { at: string }> } {
  const buffer: Array<ProductEvent & { at: string }> = [];
  return {
    emit(event) {
      buffer.push({ ...event, at: new Date().toISOString() });
      if (buffer.length > limit) buffer.splice(0, buffer.length - limit);
    },
    drain() { return buffer.splice(0, buffer.length); },
    peek() { return [...buffer]; },
  };
}

/** Counts one pass of the funnel, in order, from a recorded event stream. */
export function funnelCounts(events: Array<{ name: ProductEventName }>): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(FUNNEL.map((name) => [name, 0]));
  for (const event of events) {
    if (event.name in counts) counts[event.name] += 1;
  }
  return counts;
}
