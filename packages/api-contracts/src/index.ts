import type { CoachPlan, Profile } from "../../coach-core/src";

export type OnboardingStatus = "not_started" | "in_progress" | "completed" | "skipped";
export type OnboardingDraft = Partial<Profile> & {
  sessionMinutes?: number;
  dietaryPreference?: string;
  exclusions?: string;
};

export type CoachActionType = "replace_exercise" | "shorten_session" | "adjust_load" | "reschedule_workout" | "plan_adjustment" | "log_workout" | "log_measurement" | "create_meal_draft" | "schedule_review";
export type CoachAction = {
  id: string;
  type: CoachActionType;
  status: "pending" | "accepted" | "rejected" | "expired" | "failed";
  payload: {
    title?: string; description?: string; before?: string; after?: string; reason?: string;
    impact?: string[]; reversible?: boolean; [key: string]: unknown;
  };
  baseVersionId?: string | null;
  expiresAt?: string | null;
};
export type CoachEvidence = { label: string; value: string; observedAt?: string | null; source?: string | null };
export type CoachSource = { id: string; title: string; publisher: string; url: string };
export type CoachMessage = {
  id: string; role: "user" | "assistant"; content: string; createdAt: string; actions?: CoachAction[];
  intent?: string; basis?: CoachEvidence[]; sources?: CoachSource[]; limitations?: string[];
};
export type CoachConversation = { id: string; title: string; status: string; updatedAt: string };

export type CoachDailyBrief = {
  localDate: string;
  headline: string;
  summary: string;
  priorities: string[];
  primaryAction: { label: string; href: string; kind: "train" | "walk" | "recover" };
  basis: CoachEvidence[];
  dataState: "plan_only" | "partial" | "personalized";
};

export type CoachCheckin = {
  id: string;
  energy: number;
  soreness: number;
  pain: number;
  availableMinutes: number;
  recommendation: {
    mode: "standard" | "short" | "recovery" | "reschedule";
    title: string;
    explanation: string;
    stopConditions: string[];
  };
  createdAt: string;
};

export type CoachMemory = {
  id: string;
  type: "declared" | "profile" | "observed";
  key: string;
  value: string;
  source: "user" | "profile" | "system";
  confidence: number;
  updatedAt: string;
};

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
