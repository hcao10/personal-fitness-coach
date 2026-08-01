import type { CoachPlan, Profile } from "../../coach-core/src";

export type OnboardingStatus = "not_started" | "in_progress" | "completed" | "skipped";
export type OnboardingDraft = Partial<Profile> & {
  sessionMinutes?: number;
  dietaryPreference?: string;
  exclusions?: string;
};

export type CoachActionType = "plan_adjustment" | "log_workout" | "log_measurement" | "create_meal_draft" | "schedule_review";
export type CoachAction = { id: string; type: CoachActionType; status: "pending" | "accepted" | "rejected"; payload: Record<string, unknown> };
export type CoachMessage = { id: string; role: "user" | "assistant"; content: string; createdAt: string; actions?: CoachAction[] };
export type CoachConversation = { id: string; title: string; status: string; updatedAt: string };

export type ReviewMetrics = {
  eligible: boolean;
  completedSessions: number;
  adherencePct: number;
  averageRpe: number | null;
  maxPain: number;
  weightTrendKgPerWeek: number | null;
  completedSets: number;
  trainingVolumeKg: number;
  averageRir: number | null;
  volumeTrendPct: number | null;
  nutritionDays: number;
  calorieAdherencePct: number | null;
  proteinAdherencePct: number | null;
  consecutiveEligibleWeeks: number;
  plateau: boolean;
};
export type ReviewRecommendation = {
  kind: "hold" | "deload" | "progress" | "collect_more_data";
  title: string;
  explanation: string;
  changes: string[];
  volumeMultiplier: number;
  loadMultiplier: number;
};

export type PlanVersion = {
  id: string;
  cycleId: string;
  planId: string;
  versionNumber: number;
  status: "draft" | "active" | "archived";
  plan: CoachPlan;
  profile: Profile;
  changeSummary: string[];
  createdAt: string;
};

export type SyncMutation = {
  mutationId: string;
  deviceId: string;
  entityType: "workout_session" | "workout_set" | "measurement" | "meal_draft" | "coach_draft";
  entityId: string;
  operation: "upsert" | "delete";
  baseVersion?: number;
  occurredAt: string;
  payload: Record<string, unknown>;
};

export type SyncEvent = Omit<SyncMutation, "mutationId" | "deviceId" | "occurredAt"> & { cursor: number; createdAt: string };

export type HealthObservationInput = {
  sourceRecordId: string;
  type: "steps" | "active_energy" | "workout" | "heart_rate_summary" | "resting_heart_rate" | "weight" | "body_fat";
  value: number;
  unit: string;
  observedAt: string;
  sourceName?: string;
};
