import assert from "node:assert/strict";
import test from "node:test";
import { applyAiPlan } from "../worker/llm.ts";
import { generatePlan, readPlanInsights } from "../packages/coach-core/src/index.ts";
import { SHIPPABLE_LOCALES } from "../packages/i18n/src/index.ts";

// The offline half of the eval suite: a canned model response per locale, run
// through the real acceptance path. It cannot tell you whether a plan is any
// good — that needs live generations against real profiles — but it does lock
// the contract between the schema and the domain, which is where a prompt or
// schema edit silently breaks things. Everything here runs in CI with no keys
// and no network.

const profile = {
  sex: "female", age: 28, height: 165, weight: 60, targetWeight: 56,
  activity: "moderate", goal: "arms", experience: "beginner", days: 3,
  equipment: "gym", limitations: "",
};

const base = generatePlan(profile);
const trainingDays = new Set(base.schedule.filter((day) => !day.restDay).map((day) => day.dayIndex));

const PROSE = {
  zh: {
    summary: "每周三次训练，重点放在手臂线条与全身代谢。",
    plan_rationale: ["初学者从三次训练开始最容易坚持。", "手臂动作安排在推拉之后。", "热量缺口保持温和以保住肌肉。"],
    coach_notes: ["动作节奏比重量重要。", "每组保留两次余力。", "疼痛加重就停下。"],
    diet_guidance: ["每餐补足蛋白质。", "训练日多吃一些碳水。", "每天喝够水。"],
  },
  en: {
    summary: "Three sessions a week, focused on arm definition and whole-body output.",
    plan_rationale: ["Beginners hold three sessions a week more reliably.", "Arm work follows the pressing and pulling.", "The deficit stays mild to protect muscle."],
    coach_notes: ["Tempo matters more than load.", "Leave two reps in reserve.", "Stop if pain worsens."],
    diet_guidance: ["Get protein into every meal.", "Eat more carbohydrate on training days.", "Drink enough water."],
  },
};

function modelPlan(locale, overrides = {}) {
  return {
    content_locale: locale,
    ...PROSE[locale],
    days: Array.from({ length: 7 }, (_, index) => ({
      day_index: index,
      rest_day: !trainingDays.has(index),
      duration_minutes: 45,
      exercises: trainingDays.has(index)
        ? [
          { exercise_id: "bench", sets: 3, reps: "8-12", rest_seconds: 90 },
          { exercise_id: "shoulder", sets: 3, reps: "8-12", rest_seconds: 90 },
          { exercise_id: "pushdown", sets: 3, reps: "10-12", rest_seconds: 60 },
        ]
        : [],
    })),
    ...overrides,
  };
}

test("a plan comes back in the locale it was generated for, in every locale", () => {
  for (const locale of SHIPPABLE_LOCALES) {
    const plan = applyAiPlan(profile, base, modelPlan(locale), locale);
    const insights = readPlanInsights(plan.insights, locale);
    assert.equal(insights.contentLocale, locale, `${locale} plan was not written in ${locale}`);
    assert.equal(insights.summary, PROSE[locale].summary);
    assert.equal(insights.planRationale.length, 3);
  }
});

// The measured language wins over the requested one, so a model that answered
// in the wrong language is recorded as such instead of being relabelled.
test("a plan written in the wrong language records the language it is in", () => {
  const plan = applyAiPlan(profile, base, modelPlan("en"), "zh");
  assert.equal(readPlanInsights(plan.insights, "zh").contentLocale, "en");
});

test("stop conditions stay multilingual — they are reviewed copy, not model output", () => {
  const plan = applyAiPlan(profile, base, modelPlan("en"), "en");
  const stopConditions = plan.insights.stopConditions;
  for (const locale of SHIPPABLE_LOCALES) {
    assert.ok(Array.isArray(stopConditions[locale]) && stopConditions[locale].length,
      `stop conditions missing for ${locale}`);
  }
});

test("day titles are derived, present in every locale, and never model text", () => {
  const plan = applyAiPlan(profile, base, modelPlan("en"), "en");
  for (const day of plan.schedule) {
    for (const locale of SHIPPABLE_LOCALES) {
      assert.ok(day.title[locale], `day ${day.dayIndex} has no ${locale} title`);
      assert.ok(day.focus[locale], `day ${day.dayIndex} has no ${locale} focus`);
    }
  }
  const training = plan.schedule.find((day) => !day.restDay);
  assert.equal(training.title.en, "Push session", "title should come from the movements chosen");
});

// The acceptance checks below are the boundary between "the model suggested"
// and "the product prescribed". None of them had a test before.
test("a plan with the wrong number of training days is rejected", () => {
  const output = modelPlan("zh");
  output.days = output.days.map((day) => ({ ...day, rest_day: false, exercises: day.exercises.length ? day.exercises : output.days[0].exercises }));
  assert.throws(() => applyAiPlan(profile, base, output, "zh"), /AI_TRAINING_DAYS_INVALID/);
});

test("a plan that moves the training days is rejected", () => {
  const output = modelPlan("zh");
  // Same count, mirrored across the week: the user's committed days are not the
  // model's to reschedule.
  output.days = [...output.days].reverse().map((day, index) => ({ ...day, day_index: index }));
  assert.throws(() => applyAiPlan(profile, base, output, "zh"), /AI_TRAINING_SPACING_INVALID/);
});

test("exercises outside the allowed set are dropped, and a thin day fails", () => {
  const output = modelPlan("zh");
  output.days = output.days.map((day) => (day.rest_day ? day : {
    ...day,
    exercises: [{ exercise_id: "not-a-real-exercise", sets: 3, reps: "8-12", rest_seconds: 90 }],
  }));
  assert.throws(() => applyAiPlan(profile, base, output, "zh"), /AI_EXERCISES_INVALID/);
});

test("equipment the user does not have never reaches the plan", () => {
  const bodyweightProfile = { ...profile, equipment: "bodyweight" };
  const bodyweightBase = generatePlan(bodyweightProfile);
  const bodyweightDays = new Set(bodyweightBase.schedule.filter((day) => !day.restDay).map((day) => day.dayIndex));
  const output = modelPlan("zh");
  output.days = output.days.map((day, index) => ({
    ...day, day_index: index, rest_day: !bodyweightDays.has(index),
    // Two barbell/cable lifts and one bodyweight movement: only the last is legal.
    exercises: bodyweightDays.has(index) ? [
      { exercise_id: "bench", sets: 3, reps: "8-12", rest_seconds: 90 },
      { exercise_id: "pushdown", sets: 3, reps: "8-12", rest_seconds: 90 },
      { exercise_id: "deadBug", sets: 3, reps: "10-12", rest_seconds: 60 },
    ] : [],
  }));
  assert.throws(() => applyAiPlan(bodyweightProfile, bodyweightBase, output, "zh"), /AI_EXERCISES_INVALID/);
});

test("computed metrics survive the model untouched", () => {
  const plan = applyAiPlan(profile, base, modelPlan("zh"), "zh");
  for (const field of ["bmr", "tdee", "calories", "protein", "carbs", "fat", "weeks"]) {
    assert.equal(plan[field], base[field], `${field} was changed by the model path`);
  }
});
