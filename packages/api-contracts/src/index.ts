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

/**
 * A food row as the nutrition API returns it. `per100g` is the only field every
 * source guarantees; the rest describe provenance, which the UI must surface
 * because a community-submitted label and a USDA record are not equal evidence.
 */
export type FoodReference = {
  ref: string;
  source: "usda" | "open_food_facts" | "user" | "canonical";
  sourceRef: string;
  name: string;
  brand: string | null;
  servingSize: string | null;
  per100g: { calories: number; proteinG: number; carbsG: number; fatG: number };
  sourceKind?: "official" | "brand_label" | "community" | "user";
  dataQuality?: number;
  attribution?: string;
  region?: string | null;
};

/**
 * One dish the vision model believes it saw. Ranges rather than point estimates
 * are deliberate: a photo cannot support a single gram figure, and pretending
 * otherwise is the kind of claim this product does not make.
 *
 * `nameZh`/`nameEn` encode a language in the field name, which the per-locale
 * LLM design forbids — they become `name` + `contentLocale` when meal_vision
 * goes single-locale. Defined here exactly once so that is one edit, not three:
 * the worker, the web dashboard and the Expo app each used to declare their own
 * copy of this shape, free to drift apart without the compiler noticing.
 */
export type MealCandidate = {
  nameZh: string;
  nameEn: string;
  preparation: string;
  estimatedMinG: number;
  estimatedMaxG: number;
  confidence: number;
  uncertainty: string;
};

/** What `POST /api/v1/meals/:id/analyze` returns: candidates after food matching. */
export type MealCandidateMatch = MealCandidate & { suggestedFood: FoodReference | null };

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
