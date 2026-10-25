/**
 * The single profile draft and its intake state machine.
 *
 * There used to be two drafts: the homepage form (a fully pre-filled `Profile`
 * in React state, mirrored into `sessionStorage`) and the seven-step onboarding
 * draft (a different type, stored server-side). A user who filled the homepage
 * form and then signed in was asked the same questions again.
 *
 * Two decisions follow from collapsing them into one:
 *
 * 1. Numbers are `number | null`, not pre-filled defaults. A default age of 28
 *    and weight of 60 kg made every field look answered, so "did the user tell
 *    us this?" was unanswerable — and the resulting calorie figure was presented
 *    with the same confidence whether or not anyone had entered a body.
 * 2. Diet preference and exclusions are not part of intake. They change nothing
 *    about a training plan, and asking for them before the first plan is what
 *    turned a four-question intake into seven steps.
 */

import {
  generatePlan, resolveTrainingTrack,
  type Activity, type BeginnerBarrier, type CoachPlan, type DietaryPreference, type Equipment,
  type Experience, type Goal, type Profile, type Sex, type TrainingLocation, type TrainingTrack,
} from "../../coach-core/src/index.ts";

export type ProfileDraft = {
  goal: Goal | null;
  experience: Experience | null;
  sex: Sex | null;
  age: number | null;
  height: number | null;
  weight: number | null;
  /** Optional by design: "I want to train" is a complete answer. */
  targetWeight: number | null;
  activity: Activity | null;
  days: number | null;
  sessionMinutes: number | null;
  trainingLocation: TrainingLocation | null;
  equipment: Equipment | null;
  limitations: string;
  /** The safety acknowledgement is part of the draft, not a separate modal. */
  safetyAcknowledged: boolean;
  // Progressive profiling. Asked after the first plan exists, never before.
  dietaryPreference?: DietaryPreference;
  exclusions?: string;
  trainingTrack?: TrainingTrack;
  beginnerBarrier?: BeginnerBarrier;
  trainingAgeMonths?: number;
  currentSplit?: string;
  weakPoints?: string;
  acceptsWeightGain?: boolean;
};

export const INTAKE_STEPS = ["goal", "body", "schedule", "safety"] as const;
export type IntakeStep = (typeof INTAKE_STEPS)[number];

/**
 * Mirrors the ranges `profileFrom()` enforces in worker/api.ts. Duplicated on
 * purpose rather than imported: the server must never trust the client, and the
 * client must not let a user finish four steps only to be refused by the server.
 * `tests/profile-state.test.mjs` asserts the two agree.
 */
export const PROFILE_RANGES = {
  age: { min: 16, max: 85 },
  height: { min: 130, max: 220 },
  weight: { min: 35, max: 250 },
  targetWeight: { min: 35, max: 250 },
  days: { min: 2, max: 6 },
  sessionMinutes: { min: 20, max: 180 },
} as const;

export type RangeField = keyof typeof PROFILE_RANGES;
export type DraftField = keyof ProfileDraft;
export type FieldIssue = { field: DraftField; code: "required" | "range"; min?: number; max?: number };

export const emptyDraft = (): ProfileDraft => ({
  goal: null, experience: null, sex: null, age: null, height: null, weight: null, targetWeight: null,
  activity: null, days: null, sessionMinutes: null, trainingLocation: null, equipment: null,
  limitations: "", safetyAcknowledged: false,
});

const inRange = (field: RangeField, value: number | null): boolean => {
  if (value === null || !Number.isFinite(value)) return false;
  return value >= PROFILE_RANGES[field].min && value <= PROFILE_RANGES[field].max;
};

const requiredField = (field: DraftField, value: unknown): FieldIssue | null =>
  value === null || value === undefined || value === "" ? { field, code: "required" } : null;

const rangedField = (field: RangeField, value: number | null): FieldIssue | null => {
  if (value === null) return { field, code: "required" };
  return inRange(field, value) ? null : { field, code: "range", ...PROFILE_RANGES[field] };
};

/** Field-level issues for one step. An empty array means the step may advance. */
export function validateStep(step: IntakeStep, draft: ProfileDraft): FieldIssue[] {
  const issues: (FieldIssue | null)[] = [];
  if (step === "goal") {
    issues.push(requiredField("goal", draft.goal), requiredField("experience", draft.experience));
  }
  if (step === "body") {
    issues.push(requiredField("sex", draft.sex), rangedField("age", draft.age),
      rangedField("height", draft.height), rangedField("weight", draft.weight),
      // Daily activity belongs with the body questions rather than the schedule
      // ones: it is what turns a resting metabolic rate into an expenditure, so
      // without it the body step cannot honestly show a calorie target.
      requiredField("activity", draft.activity));
    // Optional, but an out-of-range answer is still an answer that must be fixed.
    if (draft.targetWeight !== null) issues.push(rangedField("targetWeight", draft.targetWeight));
  }
  if (step === "schedule") {
    issues.push(rangedField("days", draft.days), rangedField("sessionMinutes", draft.sessionMinutes),
      requiredField("equipment", draft.equipment), requiredField("trainingLocation", draft.trainingLocation));
  }
  if (step === "safety") {
    issues.push(draft.safetyAcknowledged ? null : { field: "safetyAcknowledged", code: "required" });
  }
  return issues.filter((issue): issue is FieldIssue => issue !== null);
}

export const stepComplete = (step: IntakeStep, draft: ProfileDraft): boolean => validateStep(step, draft).length === 0;

export const completedSteps = (draft: ProfileDraft): IntakeStep[] => INTAKE_STEPS.filter((step) => stepComplete(step, draft));

/** The first step that still has an issue — where "continue" should land. */
export function firstIncompleteStep(draft: ProfileDraft): IntakeStep | null {
  return INTAKE_STEPS.find((step) => !stepComplete(step, draft)) ?? null;
}

export type ProfilePersistence = "none" | "local" | "account";
export type ProfileState =
  | { status: "empty" }
  | { status: "drafting"; step: IntakeStep; completed: IntakeStep[] }
  | { status: "valid"; profile: Profile }
  | { status: "saved_local"; profile: Profile }
  | { status: "saved_account"; profile: Profile };

export function profileState(draft: ProfileDraft, persistence: ProfilePersistence = "none"): ProfileState {
  const completed = completedSteps(draft);
  const pending = firstIncompleteStep(draft);
  if (pending) return completed.length === 0 ? { status: "empty" } : { status: "drafting", step: pending, completed };
  const profile = toProfile(draft);
  // `pending === null` means every step validated, so this cannot be null; the
  // guard exists because the compiler cannot know that, and a silent `!` would
  // hide a future divergence between validateStep and toProfile.
  if (!profile) return { status: "drafting", step: INTAKE_STEPS[0], completed };
  if (persistence === "account") return { status: "saved_account", profile };
  if (persistence === "local") return { status: "saved_local", profile };
  return { status: "valid", profile };
}

/**
 * The draft as a plannable `Profile`, or null when a required answer is missing.
 * Every default applied here is a derivation the user can see explained, not a
 * guess presented back to them as their own answer.
 */
export function toProfile(draft: ProfileDraft): Profile | null {
  const blocking = INTAKE_STEPS.flatMap((step) => validateStep(step, draft));
  if (blocking.length) return null;
  const weight = draft.weight as number;
  const profile: Profile = {
    sex: draft.sex as Sex,
    age: draft.age as number,
    height: draft.height as number,
    weight,
    // No target weight means "keep me where I am" — the honest reading of a
    // question the user was told was optional.
    targetWeight: draft.targetWeight ?? weight,
    activity: draft.activity as Activity,
    goal: draft.goal as Goal,
    experience: draft.experience as Experience,
    days: draft.days as number,
    equipment: draft.equipment as Equipment,
    limitations: draft.limitations.trim().slice(0, 500),
    sessionMinutes: draft.sessionMinutes as number,
    trainingLocation: draft.trainingLocation as TrainingLocation,
    dietaryPreference: draft.dietaryPreference ?? "none",
    exclusions: (draft.exclusions ?? "").trim().slice(0, 500),
    beginnerBarrier: draft.beginnerBarrier,
    trainingAgeMonths: Math.max(0, Math.min(600, Number(draft.trainingAgeMonths ?? 0))),
    currentSplit: (draft.currentSplit ?? "").trim().slice(0, 120),
    weakPoints: (draft.weakPoints ?? "").trim().slice(0, 300),
    acceptsWeightGain: draft.acceptsWeightGain === true,
  };
  profile.trainingTrack = draft.trainingTrack ?? resolveTrainingTrack(profile);
  // The same normalization the server applies, so a draft that passes here is
  // not silently rewritten after it arrives.
  if (profile.trainingTrack === "beginner_fat_loss") profile.days = Math.min(4, profile.days);
  if (profile.trainingTrack === "intermediate_hypertrophy") {
    profile.goal = "muscle";
    if (profile.experience === "beginner") profile.experience = "intermediate";
    profile.days = Math.max(3, profile.days);
  }
  return profile;
}

/** A stored `Profile` back into a draft, so an account user can edit it. */
export function draftFromProfile(profile: Profile): ProfileDraft {
  return {
    goal: profile.goal, experience: profile.experience, sex: profile.sex, age: profile.age,
    height: profile.height, weight: profile.weight,
    targetWeight: profile.targetWeight === profile.weight ? null : profile.targetWeight,
    activity: profile.activity, days: profile.days, sessionMinutes: profile.sessionMinutes ?? 45,
    trainingLocation: profile.trainingLocation ?? "mixed", equipment: profile.equipment,
    limitations: profile.limitations || "",
    // A stored profile only exists because the disclaimer was accepted.
    safetyAcknowledged: true,
    dietaryPreference: profile.dietaryPreference, exclusions: profile.exclusions,
    trainingTrack: profile.trainingTrack, beginnerBarrier: profile.beginnerBarrier,
    trainingAgeMonths: profile.trainingAgeMonths, currentSplit: profile.currentSplit,
    weakPoints: profile.weakPoints, acceptsWeightGain: profile.acceptsWeightGain,
  };
}

const answered = (value: unknown): boolean =>
  value !== null && value !== undefined && value !== "" && value !== false;

/**
 * Merges an anonymous draft into whatever the account already holds.
 *
 * The rule is "an answer beats a blank, and the local answer wins a tie" — a
 * user who filled the homepage form and then signed in must not be asked again,
 * and must not have their fresh answers overwritten by a stale server draft.
 */
export function mergeDrafts(remote: Partial<ProfileDraft> | null, local: Partial<ProfileDraft> | null): ProfileDraft {
  const merged = { ...emptyDraft(), ...(remote || {}) } as ProfileDraft;
  for (const [key, value] of Object.entries(local || {})) {
    if (answered(value)) (merged as Record<string, unknown>)[key] = value;
  }
  return merged;
}

/**
 * What the answers just given changed about the recommendation.
 *
 * Progressive profiling only earns the extra question if the next screen shows
 * what it bought. Numbers, not adjectives — the UI formats them, this decides
 * which ones are honest to show at each step.
 */
export type IntakeImpact =
  | { kind: "none" }
  | { kind: "goal"; track: TrainingTrack; weeklySetsMin: number; weeklySetsMax: number; targetRir: number }
  | { kind: "body"; calories: number; protein: number; bmr: number; weeks: number }
  | { kind: "schedule"; trainingDays: number; sessionMinutes: number; exercisesPerSession: number }
  | { kind: "safety"; adaptedExercises: number; confidence: CoachPlan["confidence"] };

/**
 * Fields whose answers the number shown for a step is actually derived from.
 *
 * Listed rather than inferred so that "can this step show its effect yet" has
 * one answer per step, and so that adding a figure to a screen forces a decision
 * about what it depends on.
 */
const IMPACT_INPUTS: Record<IntakeStep, DraftField[]> = {
  goal: ["goal", "experience"],
  body: ["goal", "experience", "sex", "age", "height", "weight", "activity"],
  schedule: ["goal", "experience", "days", "sessionMinutes", "equipment"],
  safety: ["goal", "experience", "equipment"],
};

/**
 * A plannable profile from a partly answered draft.
 *
 * The fillers below are never shown to the user and never saved: `intakeImpact`
 * only returns a figure once every field that figure depends on has a real
 * answer, so a filler can only ever occupy a slot the displayed number does not
 * read. That is the line between deriving early and inventing.
 */
function provisionalProfile(draft: ProfileDraft): Profile | null {
  const filled: ProfileDraft = {
    ...draft,
    goal: draft.goal ?? "fat_loss",
    experience: draft.experience ?? "beginner",
    sex: draft.sex ?? "female",
    age: draft.age ?? 30,
    height: draft.height ?? 170,
    weight: draft.weight ?? 70,
    activity: draft.activity ?? "light",
    days: draft.days ?? 3,
    sessionMinutes: draft.sessionMinutes ?? 40,
    trainingLocation: draft.trainingLocation ?? "mixed",
    equipment: draft.equipment ?? "bodyweight",
    safetyAcknowledged: true,
  };
  return toProfile(filled);
}

const hasAnswer = (draft: ProfileDraft, field: DraftField): boolean => {
  const value = draft[field];
  return value !== null && value !== undefined && value !== "";
};

export function intakeImpact(step: IntakeStep, draft: ProfileDraft): IntakeImpact {
  // Every input the figure reads must be answered. Anything else is a number
  // the user did not give us, presented back to them as if they had.
  if (!IMPACT_INPUTS[step].every((field) => hasAnswer(draft, field))) return { kind: "none" };
  const profile = provisionalProfile(draft);
  if (!profile) return { kind: "none" };
  const plan = generatePlan(profile);
  if (step === "goal") {
    const prescription = plan.prescription;
    if (!prescription) return { kind: "none" };
    return {
      kind: "goal", track: profile.trainingTrack ?? "general",
      weeklySetsMin: prescription.weeklySetsPerMajorMuscle.min,
      weeklySetsMax: prescription.weeklySetsPerMajorMuscle.max,
      targetRir: prescription.targetRir,
    };
  }
  if (step === "body") return { kind: "body", calories: plan.calories, protein: plan.protein, bmr: plan.bmr, weeks: plan.weeks };
  if (step === "schedule") {
    const training = plan.schedule.filter((day) => !day.restDay);
    return {
      kind: "schedule", trainingDays: training.length,
      sessionMinutes: training[0]?.duration ?? Number(profile.sessionMinutes || 0),
      exercisesPerSession: training[0]?.exercises.length ?? 0,
    };
  }
  // Movements the equipment answer forced away from the gym default: the visible
  // price of what the user just told the planner.
  const adapted = profile.equipment === "gym" ? 0
    : plan.schedule.reduce((count, day) => count + day.exercises.filter((exercise) => exercise.equipment !== "gym").length, 0);
  return { kind: "safety", adaptedExercises: adapted, confidence: plan.confidence };
}
