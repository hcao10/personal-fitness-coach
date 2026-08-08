import assert from "node:assert/strict";
import test from "node:test";
import { estimateE1rm, parseRepRange, fatigueRatio, detectStagnation, runEngine } from "../services/adaptive-engine/src/index.ts";

const TODAY = "2026-08-08";
const day = (offset) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - offset * 86_400_000).toISOString().slice(0, 10);
const set = (exerciseId, dateOffset, weightKg, reps, rir = 2) => ({ exerciseId, date: day(dateOffset), weightKg, reps, rir, completed: true });
const bench = { exerciseId: "bench", targetReps: "8-12", compound: true, alternatives: ["dumbbellBench", "ex0027", "ex0308"] };

test("estimateE1rm follows Epley and clamps unreliable high-rep sets", () => {
  assert.equal(estimateE1rm(100, 10), 133.33);
  assert.equal(estimateE1rm(100, 30), estimateE1rm(100, 12));
  assert.equal(estimateE1rm(0, 10), 0);
});

test("parseRepRange handles ranges, single targets, and per-side notation", () => {
  assert.deepEqual(parseRepRange("8-12"), { min: 8, max: 12 });
  assert.deepEqual(parseRepRange("10"), { min: 8, max: 10 });
  assert.deepEqual(parseRepRange("8/side"), { min: 6, max: 8 });
});

test("double progression: two top-of-range sessions with reserve earn a load increase", () => {
  // Steady weekly history so the acute:chronic ratio stays normal; the last
  // two sessions both hit the top of the range with reps in reserve.
  const sets = [
    set("bench", 24, 60, 10, 2), set("bench", 17, 60, 11, 2),
    set("bench", 10, 60, 12, 2), set("bench", 3, 60, 12, 2),
  ];
  const report = runEngine({ today: TODAY, experience: "intermediate", sessions: [], sets, exercises: [bench] });
  const adjustment = report.adjustments.find((item) => item.exerciseId === "bench");
  assert.equal(adjustment.kind, "increase_load");
  assert.equal(adjustment.magnitudePct, 5);
  assert.match(adjustment.reason.zh, /5%/);
});

test("repeated RIR 0 sessions trigger a load reduction, not progression", () => {
  const sets = [set("bench", 7, 70, 8, 0), set("bench", 3, 70, 8, 0)];
  const report = runEngine({ today: TODAY, experience: "intermediate", sessions: [], sets, exercises: [bench] });
  const adjustment = report.adjustments.find((item) => item.exerciseId === "bench");
  assert.equal(adjustment.kind, "reduce_load");
  assert.equal(adjustment.magnitudePct, -5);
});

test("mid-range work gets an add-reps prescription", () => {
  const sets = [set("bench", 7, 60, 10, 2), set("bench", 3, 60, 10, 2)];
  const report = runEngine({ today: TODAY, experience: "intermediate", sessions: [], sets, exercises: [bench] });
  assert.equal(report.adjustments.find((item) => item.exerciseId === "bench").kind, "add_reps");
});

test("fewer than two logged sessions holds and asks for data", () => {
  const report = runEngine({ today: TODAY, experience: "beginner", sessions: [], sets: [set("bench", 3, 60, 10)], exercises: [bench] });
  const adjustment = report.adjustments.find((item) => item.exerciseId === "bench");
  assert.equal(adjustment.kind, "hold");
  assert.equal(adjustment.confidence, "low");
});

test("acute load spike above 1.35x chronic average recommends a deload and pauses increases", () => {
  const sets = [];
  for (let age = 27; age >= 7; age -= 3) sets.push(set("bench", age, 60, 10, 2));
  for (let index = 0; index < 14; index += 1) sets.push(set("bench", index % 6, 60, 12, 2));
  const ratio = fatigueRatio(sets, TODAY);
  assert.ok(ratio > 1.35, `expected spike ratio > 1.35, got ${ratio}`);
  const report = runEngine({ today: TODAY, experience: "intermediate", sessions: [], sets, exercises: [bench] });
  assert.equal(report.deloadRecommended, true);
  assert.ok(report.adjustments.every((item) => item.kind !== "increase_load"), "load increases must be withheld during a deload");
});

test("two painful sessions inside a week recommend a deload", () => {
  const sessions = [{ date: day(2), rpe: 8, pain: 5 }, { date: day(4), rpe: 7, pain: 6 }];
  const report = runEngine({ today: TODAY, experience: "beginner", sessions, sets: [], exercises: [] });
  assert.equal(report.deloadRecommended, true);
  assert.match(report.deloadReason.zh, /疼痛/);
});

test("painful exercises are swapped to same-pattern candidates", () => {
  const sets = [set("bench", 7, 60, 12, 2), set("bench", 3, 60, 12, 2)];
  const report = runEngine({ today: TODAY, experience: "intermediate", sessions: [], sets, exercises: [bench], painfulExerciseIds: ["bench"] });
  const adjustment = report.adjustments.find((item) => item.exerciseId === "bench");
  assert.equal(adjustment.kind, "swap_exercise");
  assert.deepEqual(adjustment.replacementCandidates, ["dumbbellBench", "ex0027", "ex0308"]);
  assert.equal(adjustment.confidence, "high");
});

test("a four-week flat e1RM is detected as stagnation and nudges a variation", () => {
  const sets = [];
  for (const age of [27, 24, 21, 17, 13, 10, 6, 2]) sets.push(set("bench", age, 60, 10, 3));
  const stall = detectStagnation(sets, "bench", TODAY);
  assert.ok(stall, "expected stagnation to be detected");
  assert.ok(stall.e1rmChangePct < 1);
  const report = runEngine({ today: TODAY, experience: "intermediate", sessions: [], sets, exercises: [bench] });
  const adjustment = report.adjustments.find((item) => item.exerciseId === "bench");
  assert.equal(adjustment.kind, "swap_exercise");
  assert.equal(report.stagnation.length, 1);
});

test("a genuinely progressing lift is not flagged as stagnated", () => {
  const sets = [];
  let weight = 60;
  for (const age of [27, 24, 21, 17, 13, 10, 6, 2]) { sets.push(set("bench", age, weight, 10, 2)); weight += 2.5; }
  assert.equal(detectStagnation(sets, "bench", TODAY), null);
});
