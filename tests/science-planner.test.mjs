import assert from "node:assert/strict";
import test from "node:test";
import { defaultProfile, evidencePrescription, generatePlan } from "../packages/coach-core/src/index.ts";
import { calculateWeeklyReview } from "../packages/domain/src/index.ts";

test("evidence prescription scales dose by experience without prescribing failure", () => {
  const beginner = evidencePrescription({ ...defaultProfile, experience: "beginner", days: 6 });
  const advanced = evidencePrescription({ ...defaultProfile, experience: "advanced", goal: "muscle", days: 6 });
  assert.deepEqual(beginner.weeklySetsPerMajorMuscle, { min: 6, max: 10 });
  assert.deepEqual(advanced.weeklySetsPerMajorMuscle, { min: 10, max: 16 });
  assert.equal(beginner.weeklyStrengthDays, 4);
  assert.equal(advanced.weeklyStrengthDays, 5);
  assert.ok(beginner.targetRir >= 2);
  assert.ok(advanced.targetRir >= 1);
});

test("muscle-gain calories respect the user's weight-gain consent", () => {
  const maintenance = generatePlan({ ...defaultProfile, goal: "muscle", acceptsWeightGain: false });
  const surplus = generatePlan({ ...defaultProfile, goal: "muscle", acceptsWeightGain: true });
  assert.ok(Math.abs(maintenance.calorieDelta) <= 5);
  assert.ok(surplus.calorieDelta >= 150 && surplus.calorieDelta <= 300);
  assert.equal(maintenance.prescription.version, "evidence-v2");
});

test("fat-loss deficit is proportional and capped rather than a fixed calorie subtraction", () => {
  const lighter = generatePlan({ ...defaultProfile, weight: 50, targetWeight: 45, goal: "fat_loss" });
  const heavier = generatePlan({ ...defaultProfile, weight: 100, targetWeight: 90, goal: "fat_loss" });
  assert.ok(Math.abs(heavier.calorieDelta) > Math.abs(lighter.calorieDelta));
  assert.ok(Math.abs(heavier.calorieDelta) <= 750);
  assert.ok(Math.abs(heavier.calorieDelta) <= heavier.tdee * .25 + 10);
});

test("weekly nutrition review penalizes both substantial under- and over-eating", () => {
  const base = { plannedSessions: 3, sessions: [], measurements: [], consecutiveEligibleWeeks: 1, calorieTarget: 2000, proteinTarget: 120 };
  const near = calculateWeeklyReview({ ...base, nutritionDays: Array.from({ length: 4 }, () => ({ calories: 2020, proteinG: 120 })) }, "fat_loss");
  const over = calculateWeeklyReview({ ...base, nutritionDays: Array.from({ length: 4 }, () => ({ calories: 2600, proteinG: 120 })) }, "fat_loss");
  const under = calculateWeeklyReview({ ...base, nutritionDays: Array.from({ length: 4 }, () => ({ calories: 1400, proteinG: 120 })) }, "fat_loss");
  assert.ok(near.calorieAdherencePct > 90);
  assert.ok(over.calorieAdherencePct < near.calorieAdherencePct);
  assert.ok(under.calorieAdherencePct < near.calorieAdherencePct);
});

test("weight trend uses a median slope so one noisy measurement does not dominate", () => {
  const metrics = calculateWeeklyReview({
    plannedSessions: 3, sessions: [], consecutiveEligibleWeeks: 1,
    measurements: [
      { weightKg: 80, measuredAt: "2026-08-01T08:00:00Z" },
      { weightKg: 95, measuredAt: "2026-08-02T08:00:00Z" },
      { weightKg: 79.5, measuredAt: "2026-08-08T08:00:00Z" },
      { weightKg: 79, measuredAt: "2026-08-15T08:00:00Z" },
    ],
  }, "fat_loss");
  assert.ok(metrics.weightTrendKgPerWeek < 0);
  assert.ok(metrics.weightTrendKgPerWeek > -2);
});
