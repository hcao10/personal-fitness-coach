import assert from "node:assert/strict";
import test from "node:test";
import { actionsAllowedUnderRisk, coachSafetyFlags, INTENSITY_RAISING_ACTIONS } from "../packages/domain/src/index.ts";

// Layer one: the keyword screen. It is deliberately literal and fast; the
// model classifier (llm.ts safety_flag) covers what it cannot see.
test("keyword screen catches explicit pain scores and cardinal symptoms", () => {
  assert.equal(coachSafetyFlags("疼痛 6 分").highRisk, true);
  assert.equal(coachSafetyFlags("pain 7").highRisk, true);
  assert.equal(coachSafetyFlags("训练时胸痛").highRisk, true);
  assert.equal(coachSafetyFlags("感觉快晕厥了").highRisk, true);
  assert.equal(coachSafetyFlags("今天状态不错").highRisk, false);
});

test("keyword screen does not fire below the pain threshold", () => {
  assert.equal(coachSafetyFlags("疼痛 2 分").highRisk, false);
  assert.equal(coachSafetyFlags("疼痛 4 分").highRisk, true);
});

// This is exactly the gap the second layer exists to close — documented as a
// test so the limitation stays visible rather than being assumed away.
test("paraphrased risk escapes the keyword screen, which is why the model layer exists", () => {
  assert.equal(coachSafetyFlags("my knee is about a seven out of ten today").highRisk, false);
  assert.equal(coachSafetyFlags("膝盖不太舒服，大概十分里的七分").highRisk, false);
});

// Layer two enforcement: whoever raised the flag, no action may increase load.
test("high risk strips intensity-raising actions and keeps supportive ones", () => {
  const actions = [
    { type: "adjust_load" }, { type: "plan_adjustment" },
    { type: "replace_exercise" }, { type: "shorten_session" }, { type: "schedule_review" },
  ];
  assert.deepEqual(actionsAllowedUnderRisk(actions, true).map((action) => action.type),
    ["replace_exercise", "shorten_session", "schedule_review"]);
  assert.equal(actionsAllowedUnderRisk(actions, false).length, 5);
});

test("every blocked action type is a real coach action type", () => {
  const known = new Set(["replace_exercise", "shorten_session", "adjust_load", "reschedule_workout", "plan_adjustment", "log_workout", "log_measurement", "create_meal_draft", "schedule_review"]);
  for (const type of INTENSITY_RAISING_ACTIONS) assert.ok(known.has(type), `unknown action type in safety policy: ${type}`);
});
