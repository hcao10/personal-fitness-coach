import assert from "node:assert/strict";
import test from "node:test";
import { generatePlan } from "../packages/coach-core/src/index.ts";
import { PAIN_THRESHOLD } from "../packages/domain/src/safety.ts";
import {
  RPE_FOR_DIFFICULTY, durationForMode, exercisesForMode, nextStepAdvice, requiredSets, workoutState,
} from "../packages/product-state/src/workout.ts";

const profile = {
  sex: "female", age: 31, height: 168, weight: 64, targetWeight: 60, activity: "light",
  goal: "fat_loss", experience: "beginner", days: 3, equipment: "dumbbell", limitations: "",
  sessionMinutes: 40, trainingLocation: "home", trainingTrack: "beginner_fat_loss",
};
const plan = generatePlan(profile);
const trainingDay = plan.schedule.find((day) => !day.restDay);
const restDay = plan.schedule.find((day) => day.restDay);
const feedback = (patch) => ({ difficulty: "right", pain: 0, completedSession: true, ...patch });

test("a rest day is its own state, not an empty workout", () => {
  assert.equal(workoutState(restDay, "standard", []).status, "rest_day");
});

test("a session with nothing logged is scheduled, and one set in is in progress", () => {
  assert.equal(workoutState(trainingDay, "standard", []).status, "scheduled");
  const partial = workoutState(trainingDay, "standard", [
    { exerciseId: trainingDay.exercises[0].id, setIndex: 0, setType: "working", targetReps: null, weightKg: null, reps: 10, rir: null, completed: true },
  ]);
  assert.equal(partial.status, "in_progress");
  assert.equal(partial.completedSets, 1);
});

test("logging every prescribed set completes the session", () => {
  const sets = exercisesForMode(trainingDay, "standard").flatMap((exercise) =>
    Array.from({ length: exercise.sets }, (_, setIndex) => ({
      exerciseId: exercise.id, setIndex, setType: "working", targetReps: exercise.reps,
      weightKg: null, reps: 10, rir: null, completed: true,
    })));
  assert.equal(sets.length, requiredSets(trainingDay, "standard"));
  assert.equal(workoutState(trainingDay, "standard", sets).status, "completed");
});

test("feedback moves the session to its final state and carries the advice with it", () => {
  const state = workoutState(trainingDay, "standard", [], feedback({}));
  assert.equal(state.status, "feedback_recorded");
  assert.equal(state.advice.kind, "add_reps");
});

test("the short and recovery versions are smaller than the standard one", () => {
  const standard = exercisesForMode(trainingDay, "standard").length;
  assert.ok(exercisesForMode(trainingDay, "short").length < standard);
  assert.ok(exercisesForMode(trainingDay, "recovery").length <= exercisesForMode(trainingDay, "short").length);
  assert.ok(durationForMode(trainingDay, "short") <= durationForMode(trainingDay, "standard"));
});

// The safety rules are the whole point of a deterministic next step: they must
// hold for every combination of the other two answers, not just the tidy ones.
test("pain at the threshold never produces a progression, whatever else was reported", () => {
  for (const difficulty of ["easy", "right", "hard"]) {
    for (const completedSession of [true, false]) {
      for (const pain of [PAIN_THRESHOLD, PAIN_THRESHOLD + 1, 10]) {
        const advice = nextStepAdvice(feedback({ difficulty, completedSession, pain }), trainingDay);
        assert.ok(["recover", "stop_and_seek_help"].includes(advice.kind), `pain ${pain} produced ${advice.kind}`);
        assert.ok(advice.volumeMultiplier <= 1, "volume must not rise under pain");
        assert.ok(advice.loadMultiplier <= 1, "load must not rise under pain");
        assert.equal(advice.urgent, true);
      }
    }
  }
});

test("severe pain escalates to stopping and seeking help", () => {
  assert.equal(nextStepAdvice(feedback({ pain: 8 }), trainingDay).kind, "stop_and_seek_help");
});

test("an unfinished session shortens the next one instead of progressing it", () => {
  assert.equal(nextStepAdvice(feedback({ completedSession: false, difficulty: "easy" }), trainingDay).kind, "shorten_next");
});

test("hard holds, about right adds reps, easy earns load — and only on a full session", () => {
  assert.equal(nextStepAdvice(feedback({ difficulty: "hard" }), trainingDay).kind, "hold");
  assert.equal(nextStepAdvice(feedback({ difficulty: "right" }), trainingDay).kind, "add_reps");
  const progressed = nextStepAdvice(feedback({ difficulty: "easy" }), trainingDay, "standard");
  assert.equal(progressed.kind, "progress_load");
  // An easy short session says nothing about the standard one.
  assert.equal(nextStepAdvice(feedback({ difficulty: "easy" }), trainingDay, "short").kind, "hold");
});

test("no advice may exceed the weekly review's own ceilings", () => {
  for (const difficulty of ["easy", "right", "hard"]) {
    for (const pain of [0, 2, 4, 9]) {
      for (const completedSession of [true, false]) {
        const advice = nextStepAdvice(feedback({ difficulty, pain, completedSession }), trainingDay);
        assert.ok(advice.volumeMultiplier <= 1.1, "weekly volume ceiling is +10%");
        assert.ok(advice.loadMultiplier <= 1.05, "weekly load ceiling is +5%");
      }
    }
  }
});

test("difficulty maps onto the RPE the server already stores", () => {
  assert.deepEqual(RPE_FOR_DIFFICULTY, { easy: 5, right: 7, hard: 9 });
  for (const value of Object.values(RPE_FOR_DIFFICULTY)) assert.ok(value >= 1 && value <= 10);
});
