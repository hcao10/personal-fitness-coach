/**
 * Workout lifecycle and the deterministic next step that follows feedback.
 *
 * `scheduled → started → in_progress → completed → feedback_recorded`.
 *
 * The advice below is the same rule set the weekly review and the coach's
 * intensity guard use, applied to a single session: pain at or above the
 * threshold never produces a progression, and no branch raises volume by more
 * than 10% or load by more than 5%. Keeping it here — pure, no network — is what
 * lets a signed-out user finish a session and still be told what to do next.
 */

import { PAIN_THRESHOLD } from "../../domain/src/safety.ts";
import type { PlannedExercise, WorkoutDay } from "../../coach-core/src/index.ts";

export type WorkoutMode = "standard" | "short" | "recovery";

/** One logged set. Identical shape in guest storage and in the D1 table. */
export type WorkoutSet = {
  exerciseId: string;
  setIndex: number;
  setType: "warmup" | "working" | "dropset" | "failure";
  targetReps: string | null;
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  completed: boolean;
};

/**
 * The minimum a session needs on completion.
 *
 * Three answers, one optional note. The previous form asked for duration, RPE
 * and pain on three sliders before it would accept anything, which is a survey,
 * not a log. `difficulty` is mapped to an RPE for the server rather than asked
 * as a number, because "how hard was that" is a question people can answer and
 * "rate that 1–10" is not.
 */
export type WorkoutFeedback = {
  difficulty: "easy" | "right" | "hard";
  pain: number;
  completedSession: boolean;
  note?: string;
  durationMinutes?: number;
};

export const RPE_FOR_DIFFICULTY: Record<WorkoutFeedback["difficulty"], number> = { easy: 5, right: 7, hard: 9 };

export type WorkoutState =
  | { status: "rest_day"; day: WorkoutDay }
  | { status: "scheduled"; day: WorkoutDay; mode: WorkoutMode }
  | { status: "started"; day: WorkoutDay; mode: WorkoutMode; exerciseIndex: number }
  | { status: "in_progress"; day: WorkoutDay; mode: WorkoutMode; exerciseIndex: number; completedSets: number }
  | { status: "completed"; day: WorkoutDay; mode: WorkoutMode; completedSets: number }
  | { status: "feedback_recorded"; day: WorkoutDay; feedback: WorkoutFeedback; advice: NextStepAdvice };

/** Exercises actually shown for a mode. Falls back to a proportional slice when the plan carries no variants. */
export function exercisesForMode(day: WorkoutDay, mode: WorkoutMode): PlannedExercise[] {
  if (mode === "standard" || day.restDay) return day.exercises;
  const ids = mode === "short" ? day.variants?.short.exerciseIds : day.variants?.recovery.exerciseIds;
  if (ids?.length) return day.exercises.filter((exercise) => ids.includes(exercise.id));
  return day.exercises.slice(0, Math.max(1, Math.ceil(day.exercises.length * (mode === "short" ? 0.6 : 0.4))));
}

export const durationForMode = (day: WorkoutDay, mode: WorkoutMode): number =>
  (mode === "short" ? day.variants?.short.duration : mode === "recovery" ? day.variants?.recovery.duration : day.duration) ?? day.duration;

export const requiredSets = (day: WorkoutDay, mode: WorkoutMode): number =>
  exercisesForMode(day, mode).reduce((sum, exercise) => sum + exercise.sets, 0);

export function workoutState(day: WorkoutDay, mode: WorkoutMode, sets: WorkoutSet[], feedback?: WorkoutFeedback | null): WorkoutState {
  if (day.restDay) return { status: "rest_day", day };
  if (feedback) return { status: "feedback_recorded", day, feedback, advice: nextStepAdvice(feedback, day, mode) };
  const completedSets = sets.filter((set) => set.completed).length;
  const target = requiredSets(day, mode);
  if (completedSets === 0) return { status: "scheduled", day, mode };
  if (target > 0 && completedSets >= target) return { status: "completed", day, mode, completedSets };
  const exercises = exercisesForMode(day, mode);
  const lastLogged = sets.filter((set) => set.completed).map((set) => exercises.findIndex((exercise) => exercise.id === set.exerciseId));
  const exerciseIndex = Math.max(0, Math.min(exercises.length - 1, Math.max(...lastLogged, 0)));
  return { status: "in_progress", day, mode, exerciseIndex, completedSets };
}

/**
 * What to do next, decided by rules rather than a model.
 *
 * `stop_and_seek_help` is the only branch that can fire regardless of the other
 * answers, and no branch reachable from pain at or above the threshold raises
 * intensity. `volumeMultiplier` and `loadMultiplier` are capped at the same
 * +10% / +5% the weekly review uses, so a session-level suggestion can never
 * exceed what the review would allow across a whole week.
 */
export type NextStepAdvice = {
  kind: "stop_and_seek_help" | "recover" | "hold" | "add_reps" | "progress_load" | "shorten_next";
  volumeMultiplier: number;
  loadMultiplier: number;
  /** True when the advice must be shown as a warning rather than a suggestion. */
  urgent: boolean;
};

export function nextStepAdvice(feedback: WorkoutFeedback, day: WorkoutDay, mode: WorkoutMode = "standard"): NextStepAdvice {
  if (feedback.pain >= PAIN_THRESHOLD + 3) return { kind: "stop_and_seek_help", volumeMultiplier: 1, loadMultiplier: 1, urgent: true };
  if (feedback.pain >= PAIN_THRESHOLD) return { kind: "recover", volumeMultiplier: 0.9, loadMultiplier: 1, urgent: true };
  if (!feedback.completedSession) return { kind: "shorten_next", volumeMultiplier: 1, loadMultiplier: 1, urgent: false };
  if (feedback.difficulty === "hard") return { kind: "hold", volumeMultiplier: 1, loadMultiplier: 1, urgent: false };
  if (feedback.difficulty === "right") return { kind: "add_reps", volumeMultiplier: 1, loadMultiplier: 1, urgent: false };
  // "Easy" only earns a load increase on a full session; a shortened or recovery
  // version being easy says nothing about the standard one.
  if (mode !== "standard" || day.restDay) return { kind: "hold", volumeMultiplier: 1, loadMultiplier: 1, urgent: false };
  return { kind: "progress_load", volumeMultiplier: 1.1, loadMultiplier: 1.05, urgent: false };
}
