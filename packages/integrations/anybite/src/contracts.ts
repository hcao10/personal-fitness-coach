/**
 * Versioned payloads exchanged with anyBite. See docs/adr/0002.
 *
 * Two rules shape everything here:
 *
 * 1. anyBite's own planning documents put height, weight, activity level and
 *    training data outside its S2-A model entirely (04_domain_model_and_state.md
 *    §5.2 — "not a nullable field, the field is not built"), deferred to a V1.x
 *    `HealthProfile` behind a `health_data_use` consent. So Cmine Fit sends an
 *    intent and a target range, never a body.
 * 2. anyBite is explicitly not a calorie-tracking app. What comes back is a
 *    day-level summary with a stated confidence, not a food log.
 *
 * `subjectId` is a pairwise pseudonym, not an email and not the Cmine subject:
 * even if the two products end up behind the same login, that must not by itself
 * make the accounts joinable.
 */

export type NutritionGoalKind = "fat_loss" | "muscle" | "recomp" | "strength" | "general_fitness";
export type Confidence = "low" | "medium" | "high";

export type NutritionGoalSnapshot = {
  schemaVersion: "1";
  subjectId: string;
  effectiveFrom: string;
  goal: NutritionGoalKind;
  calorieTargetRange?: { min: number; max: number };
  proteinTargetG?: number;
  dietaryConstraints?: string[];
  locale: string;
  timezone: string;
  sourcePlanVersion: string;
};

export type MealOutcomeSummary = {
  schemaVersion: "1";
  subjectId: string;
  localDate: string;
  calories?: { value: number; confidence: Confidence };
  proteinG?: { value: number; confidence: Confidence };
  mealsRecorded: number;
  sourceRevision: string;
};

/** Granted and revoked independently of sign-in and of every other consent. */
export type AnybiteConsentPurpose = "nutrition_goal_share" | "meal_outcome_import";
export type AnybiteConsent = {
  purpose: AnybiteConsentPurpose;
  grantedAt: string | null;
  revokedAt: string | null;
};

export const consentActive = (consent: AnybiteConsent | undefined | null): boolean =>
  Boolean(consent?.grantedAt) && !consent?.revokedAt;

export type AnybiteConnectionStatus =
  /** No peer service exists to connect to. The only state this build can be in. */
  | { status: "unsupported"; reason: "no_peer_service" }
  | { status: "disconnected"; reason: "consent_missing" | "not_configured" | "revoked" }
  | { status: "connected"; lastSyncedAt: string | null; lastError: string | null };

export type AnybitePushResult =
  | { ok: true; idempotencyKey: string; replayed: boolean }
  | { ok: false; code: "unsupported" | "consent_missing" | "not_configured" | "transport_failed"; retryable: boolean };

export type AnybitePullResult<T> =
  | { ok: true; items: T[]; fetchedAt: string }
  | { ok: false; code: "unsupported" | "consent_missing" | "not_configured" | "transport_failed"; retryable: boolean };

/**
 * The seam. A real HTTP adapter and the disabled one below implement the same
 * five methods, so nothing above this line has to know which is installed.
 */
export interface AnybiteIntegrationPort {
  status(): Promise<AnybiteConnectionStatus>;
  consents(): Promise<AnybiteConsent[]>;
  grant(purpose: AnybiteConsentPurpose): Promise<AnybiteConnectionStatus>;
  revoke(purpose: AnybiteConsentPurpose): Promise<AnybiteConnectionStatus>;
  pushNutritionGoal(snapshot: NutritionGoalSnapshot, idempotencyKey: string): Promise<AnybitePushResult>;
  pullMealOutcomes(subjectId: string, since: string): Promise<AnybitePullResult<MealOutcomeSummary>>;
}

/**
 * Newer revision wins; equal or older is dropped rather than applied.
 * String comparison because `sourceRevision` is a monotonic string on the
 * producing side — timestamps and counters both order correctly under it.
 */
export function shouldApplyOutcome(incoming: MealOutcomeSummary, existing: MealOutcomeSummary | null): boolean {
  if (!existing) return true;
  if (existing.subjectId !== incoming.subjectId || existing.localDate !== incoming.localDate) return true;
  return incoming.sourceRevision > existing.sourceRevision;
}

/** Stable per (subject, payload kind, effective date) so retries cannot double-write. */
export const idempotencyKeyFor = (kind: "nutrition_goal", subjectId: string, marker: string): string =>
  `${kind}:${subjectId}:${marker}`;
