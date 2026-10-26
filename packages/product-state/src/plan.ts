/**
 * Plan lifecycle: none → generating → draft → accepted(active) → superseded.
 *
 * The homepage used to express this with four booleans (`generating`,
 * `planReady`, `anonymousPreview`, `planStatus`) plus a nullable `planSource`,
 * which allowed combinations that mean nothing — `planReady` with no plan,
 * `anonymousPreview` while signed in, a draft with `source: null`. A union makes
 * those unrepresentable, and gives every state exactly one screen.
 */

import type { CoachPlan, Profile } from "../../coach-core/src/index.ts";
import type { PlanSource } from "./capability.ts";

/** A plan plus the facts a reader needs to judge it. Identical in both modes. */
export type PlanRecord = {
  /** Server plan id, or a locally minted `local:<timestamp>` for guest plans. */
  id: string;
  plan: CoachPlan;
  profile: Profile;
  source: PlanSource;
  /** ISO date the first scheduled day falls on. */
  startDate: string;
  createdAt: string;
};

export type PlanState =
  | { status: "none" }
  | { status: "generating"; source: PlanSource }
  | { status: "draft"; record: PlanRecord }
  | { status: "active"; record: PlanRecord }
  | { status: "superseded"; record: PlanRecord; replacedBy: string }
  | { status: "error"; code: string; retryable: boolean };

export const planRecord = (state: PlanState): PlanRecord | null =>
  state.status === "draft" || state.status === "active" || state.status === "superseded" ? state.record : null;

/** A newly generated plan is always a draft: the user accepts it, we do not. */
export const generatedPlan = (record: PlanRecord): PlanState => ({ status: "draft", record });

export function acceptPlan(state: PlanState): PlanState {
  if (state.status !== "draft") return state;
  return { status: "active", record: state.record };
}

export function supersedePlan(state: PlanState, replacedBy: string): PlanState {
  const record = planRecord(state);
  return record ? { status: "superseded", record, replacedBy } : state;
}

/**
 * The two to four checkable reasons the plan looks the way it does.
 *
 * Deliberately derived from the profile and the deterministic prescription
 * rather than from model prose: an AI plan may add its own rationale, but a
 * rules plan must still be able to explain itself, and both must be verifiable
 * against numbers the reader can see elsewhere on the page.
 */
export type PlanReason =
  | { kind: "training_days"; days: number; requested: number }
  | { kind: "session_length"; minutes: number; exercises: number }
  | { kind: "weekly_sets"; min: number; max: number; experience: Profile["experience"] }
  | { kind: "calorie_delta"; delta: number; goal: Profile["goal"]; floor: number }
  | { kind: "equipment"; equipment: Profile["equipment"]; location: NonNullable<Profile["trainingLocation"]> }
  | { kind: "limitations"; text: string };

export function planReasons(record: PlanRecord): PlanReason[] {
  const { plan, profile } = record;
  const training = plan.schedule.filter((day) => !day.restDay);
  const reasons: PlanReason[] = [
    { kind: "training_days", days: training.length, requested: profile.days },
    { kind: "session_length", minutes: training[0]?.duration ?? Number(profile.sessionMinutes || 0), exercises: training[0]?.exercises.length ?? 0 },
  ];
  if (plan.prescription) {
    reasons.push({
      kind: "weekly_sets",
      min: plan.prescription.weeklySetsPerMajorMuscle.min,
      max: plan.prescription.weeklySetsPerMajorMuscle.max,
      experience: profile.experience,
    });
  }
  reasons.push({
    kind: "calorie_delta", delta: plan.calorieDelta, goal: profile.goal,
    // The floor is a hard safety rule, so it is quoted rather than implied.
    floor: profile.sex === "female" ? 1200 : 1500,
  });
  reasons.push({ kind: "equipment", equipment: profile.equipment, location: profile.trainingLocation ?? "mixed" });
  if (profile.limitations.trim()) reasons.push({ kind: "limitations", text: profile.limitations.trim() });
  return reasons;
}

/** Local dates in the user's own timezone; `toISOString` would shift the day. */
export const localDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const shiftDate = (start: string, days: number): string => {
  const value = new Date(`${start}T12:00:00`);
  value.setDate(value.getDate() + days);
  return localDate(value);
};

/**
 * Which scheduled day "today" is.
 *
 * Returns null before the plan starts, so the UI can say "starts on Friday"
 * instead of silently showing day 1 as if it were due now. Cycles weekly after
 * the first seven days, which is what the seven-day schedule actually describes.
 */
export function dayIndexFor(record: PlanRecord, today: string): number | null {
  const start = new Date(`${record.startDate}T12:00:00`).getTime();
  const now = new Date(`${today}T12:00:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(now)) return null;
  const days = Math.round((now - start) / 86_400_000);
  if (days < 0) return null;
  return days % 7;
}
