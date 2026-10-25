import assert from "node:assert/strict";
import test from "node:test";
import { generatePlan } from "../packages/coach-core/src/index.ts";
import { exerciseGuidance, fromPlannedExercise, mediaFor } from "../packages/exercise-catalog/src/index.ts";
import {
  FUNNEL, INTAKE_STEPS, acceptPlan, coachRulesAnswer, createEventSink, emptyDraft, funnelCounts,
  generatedPlan, nextStepAdvice, profileState, requiredSets, resolveEntry, toProfile, validateStep,
  workoutState,
} from "../packages/product-state/src/index.ts";

/**
 * The whole guest loop, in order, on a deployment with no Cmine ID and no model:
 *
 *   intake → rules plan → accept → exercise media → session → feedback → next step
 *
 * This is the acceptance criterion the product had failed: signed out, with
 * nothing configured, the three entry points sat on a spinner forever and the
 * first plan was gated behind a sign-in that did not exist.
 *
 * It runs over the pure state machines rather than a rendered DOM, so it needs
 * no browser and can run in CI. The rendered walkthrough of the same path is
 * documented in docs/E2E_GUEST_FUNNEL.zh-CN.md.
 */

const NOTHING_CONFIGURED = { accounts: false, ai: false, schemaReady: false, rewardAds: false };
const SIGNED_OUT = { signedIn: false };

test("the guest funnel completes end to end with nothing configured", () => {
  const events = createEventSink();

  // --- Entry -------------------------------------------------------------
  const entry = resolveEntry({ session: SIGNED_OUT, capabilities: NOTHING_CONFIGURED, guestSupported: true });
  assert.deepEqual(entry, { status: "guest", reason: "accounts_not_configured" });

  // --- Intake ------------------------------------------------------------
  events.emit({ name: "profile_started", mode: "guest" });
  let draft = emptyDraft();
  assert.equal(profileState(draft).status, "empty");

  const answers = [
    { goal: "muscle", experience: "intermediate" },
    { sex: "male", age: 34, height: 178, weight: 82, activity: "moderate" },
    { days: 4, sessionMinutes: 45, equipment: "dumbbell", trainingLocation: "home" },
    { limitations: "右肩前侧疼痛", safetyAcknowledged: true },
  ];
  answers.forEach((patch, index) => {
    draft = { ...draft, ...patch };
    // Each step must actually be satisfied by the answers given for it, or the
    // four-step intake is really a longer one with a hidden dependency.
    assert.deepEqual(validateStep(INTAKE_STEPS[index], draft), [], `step ${INTAKE_STEPS[index]} is not satisfied by its own answers`);
  });

  const state = profileState(draft, "local");
  assert.equal(state.status, "saved_local");
  const profile = toProfile(draft);
  assert.ok(profile);
  events.emit({ name: "profile_completed", mode: "guest", steps: INTAKE_STEPS.length });

  // --- Plan --------------------------------------------------------------
  const record = {
    id: "local:1", plan: generatePlan(profile), profile,
    // Never called AI. On this deployment there is no model to call.
    source: "rules", startDate: "2026-08-30", createdAt: "2026-08-30T00:00:00.000Z",
  };
  let planState = generatedPlan(record);
  assert.equal(planState.status, "draft", "a generated plan is a draft until the user accepts it");
  events.emit({ name: "plan_generated", source: "rules", mode: "guest" });

  planState = acceptPlan(planState);
  assert.equal(planState.status, "active");
  events.emit({ name: "plan_accepted", source: "rules", mode: "guest" });

  // --- Exercise media and guidance ---------------------------------------
  const dayIndex = record.plan.schedule.findIndex((day) => !day.restDay);
  const day = record.plan.schedule[dayIndex];
  const views = day.exercises.map(fromPlannedExercise);
  assert.ok(views.length > 0);
  for (const view of views) {
    const media = mediaFor(view.asset);
    assert.ok(media.animated?.endsWith(".gif"), `${view.id} has no animated demo`);
    assert.ok(media.still?.endsWith(".jpg"), `${view.id} has no still`);
    const guidance = exerciseGuidance(view, "zh");
    assert.ok(guidance.steps.length > 0 && guidance.breathing && guidance.stopConditions.length >= 3);
  }
  events.emit({ name: "exercise_viewed", surface: "plan", hasMedia: true });

  // --- Session -----------------------------------------------------------
  events.emit({ name: "workout_started", mode: "guest", variant: "standard" });
  assert.equal(workoutState(day, "standard", []).status, "scheduled");
  const sets = day.exercises.flatMap((exercise) =>
    Array.from({ length: exercise.sets }, (_, setIndex) => ({
      exerciseId: exercise.id, setIndex, setType: "working", targetReps: exercise.reps,
      weightKg: 20, reps: 10, rir: 2, completed: true,
    })));
  assert.equal(sets.length, requiredSets(day, "standard"));
  assert.equal(workoutState(day, "standard", sets).status, "completed");
  events.emit({ name: "workout_completed", mode: "guest", setsLogged: sets.length });

  // --- Feedback and the deterministic next step --------------------------
  const feedback = { difficulty: "right", pain: 0, completedSession: true };
  const finished = workoutState(day, "standard", sets, feedback);
  assert.equal(finished.status, "feedback_recorded");
  assert.equal(finished.advice.kind, "add_reps");
  assert.ok(finished.advice.volumeMultiplier <= 1.1 && finished.advice.loadMultiplier <= 1.05);
  events.emit({ name: "workout_feedback_submitted", advice: finished.advice.kind, painFlagged: finished.advice.urgent });

  // --- The coach still answers, with no model ----------------------------
  const answer = coachRulesAnswer({ intent: "how_to_perform", locale: "zh", plan: record, dayIndex, exerciseId: views[0].id });
  assert.equal(answer.source, "rules");
  assert.ok(answer.bullets.length > 0);

  // --- The funnel was actually walked ------------------------------------
  const counts = funnelCounts(events.peek());
  for (const step of FUNNEL) assert.equal(counts[step], 1, `${step} did not fire exactly once`);
});

test("a painful session cannot end in a progression, even on a perfect log", () => {
  const profile = toProfile({
    ...emptyDraft(), goal: "fat_loss", experience: "beginner", sex: "female", age: 29,
    height: 164, weight: 58, targetWeight: 55, activity: "light", days: 3,
    sessionMinutes: 30, trainingLocation: "home", equipment: "bodyweight", safetyAcknowledged: true,
  });
  const plan = generatePlan(profile);
  const day = plan.schedule.find((entry) => !entry.restDay);
  const advice = nextStepAdvice({ difficulty: "easy", pain: 5, completedSession: true }, day, "standard");
  assert.equal(advice.kind, "recover");
  assert.equal(advice.urgent, true);
  assert.ok(advice.loadMultiplier <= 1);
});

test("the same funnel with an account configured routes to the account, not to guest", () => {
  const entry = resolveEntry({
    session: { signedIn: true },
    capabilities: { accounts: true, ai: true, schemaReady: true, rewardAds: false },
    guestSupported: true,
  });
  assert.deepEqual(entry, { status: "account" });
});
