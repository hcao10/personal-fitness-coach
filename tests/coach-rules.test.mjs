import assert from "node:assert/strict";
import test from "node:test";
import { generatePlan } from "../packages/coach-core/src/index.ts";
import { LOCALES } from "../packages/i18n/src/locales.ts";
import { RULES_ANSWERABLE, coachRulesAnswer } from "../packages/product-state/src/coach-rules.ts";
import { composerReadiness, decodeCoachContext, encodeCoachContext } from "../packages/product-state/src/coach.ts";
import { planReasons } from "../packages/product-state/src/plan.ts";

const profile = {
  sex: "female", age: 29, height: 164, weight: 58, targetWeight: 55, activity: "light",
  goal: "fat_loss", experience: "beginner", days: 3, equipment: "dumbbell", limitations: "右膝旧伤",
  sessionMinutes: 35, trainingLocation: "home", trainingTrack: "beginner_fat_loss",
};
const record = {
  id: "local:1", plan: generatePlan(profile), profile, source: "rules",
  startDate: "2026-08-30", createdAt: "2026-08-30T00:00:00.000Z",
};
const dayIndex = record.plan.schedule.findIndex((day) => !day.restDay);
const exerciseId = record.plan.schedule[dayIndex].exercises[0].id;

test("with no model configured, every exercise question still has a real answer", () => {
  for (const intent of ["how_to_perform", "common_mistakes", "stop_conditions", "substitute_exercise", "why_this_exercise"]) {
    for (const locale of LOCALES) {
      const answer = coachRulesAnswer({ intent, locale, plan: record, dayIndex, exerciseId });
      assert.equal(answer.source, "rules", `${intent} fell through to unavailable`);
      assert.ok(answer.title.trim(), `${intent} has no title in ${locale}`);
      assert.ok(answer.bullets.length + answer.paragraphs.length + answer.substitutes.length > 0, `${intent} answered with nothing`);
    }
  }
});

test("a rules answer always says it is a rules answer", () => {
  const answer = coachRulesAnswer({ intent: "how_to_perform", locale: "zh", plan: record, dayIndex, exerciseId });
  assert.equal(answer.source, "rules");
  assert.ok(answer.limitations.length >= 1);
  assert.ok(answer.limitations.some((line) => line.includes("不是 AI 生成")));
});

test("stop conditions carry the medical caveat rather than implying a diagnosis", () => {
  const answer = coachRulesAnswer({ intent: "stop_conditions", locale: "en", plan: record, dayIndex, exerciseId });
  assert.ok(answer.paragraphs.some((line) => line.includes("not a medical diagnosis")));
  assert.ok(answer.bullets.length >= 3);
});

test("substitutes are same-pattern movements the user's equipment allows", () => {
  const answer = coachRulesAnswer({ intent: "substitute_exercise", locale: "zh", plan: record, dayIndex, exerciseId });
  for (const substitute of answer.substitutes) {
    assert.notEqual(substitute.id, exerciseId);
    assert.ok(["bodyweight", "dumbbell"].includes(substitute.equipment), `${substitute.id} needs equipment the user does not have`);
  }
});

test("why-this-plan lists one checkable line per planner reason", () => {
  const answer = coachRulesAnswer({ intent: "why_this_plan", locale: "zh", plan: record });
  assert.equal(answer.source, "rules");
  assert.equal(answer.bullets.length, planReasons(record).length);
  // The stated limitation the user typed is quoted back, not paraphrased away.
  assert.ok(answer.bullets.some((line) => line.includes("右膝旧伤")));
});

test("a short-on-time answer names the movements to keep and the minutes it takes", () => {
  const answer = coachRulesAnswer({ intent: "not_enough_time", locale: "en", plan: record, dayIndex, availableMinutes: 15 });
  assert.equal(answer.source, "rules");
  assert.ok(answer.title.includes("15"));
  assert.ok(answer.bullets.length >= 1);
  assert.ok(answer.bullets.length < record.plan.schedule[dayIndex].exercises.length);
});

// The refusal has to be a doorway, not a wall: it lists what can be answered.
test("free-form questions refuse honestly and point at what works without a model", () => {
  const answer = coachRulesAnswer({ intent: "free_text", locale: "en", plan: record });
  assert.equal(answer.source, "unavailable");
  assert.deepEqual(answer.answerable, RULES_ANSWERABLE);
  assert.ok(answer.paragraphs.join(" ").includes("no language model"));
});

test("an exercise question with no exercise selected says so instead of guessing", () => {
  const answer = coachRulesAnswer({ intent: "how_to_perform", locale: "zh", plan: record });
  assert.equal(answer.source, "unavailable");
  assert.ok(answer.answerable.includes("why_this_plan"));
});

test("why-this-plan with no plan is a doorway, not a blank", () => {
  const answer = coachRulesAnswer({ intent: "why_this_plan", locale: "en", plan: null });
  assert.equal(answer.source, "unavailable");
  assert.ok(answer.paragraphs.join(" ").includes("intake"));
});

test("coach context survives a round trip through a URL as ids, not prose", () => {
  const context = { intent: "substitute_exercise", planId: "abc", dayIndex: 2, exerciseId: "ex0032", availableMinutes: 20 };
  const decoded = decodeCoachContext(encodeCoachContext(context));
  assert.deepEqual(decoded, context);
});

test("a tampered context degrades to free text rather than throwing", () => {
  const decoded = decodeCoachContext("intent=drop_table&dayIndex=99&availableMinutes=-4");
  assert.equal(decoded.intent, "free_text");
  assert.equal(decoded.dayIndex, undefined);
  assert.equal(decoded.availableMinutes, undefined);
  assert.equal(decodeCoachContext(""), null);
});

// The composer used to render enabled with no conversation behind it, so the
// send button was live and did nothing.
test("the composer can only be enabled when sending would actually do something", () => {
  const base = { text: "怎么做", turn: { status: "idle" }, conversationId: null, mode: "ai", signedIn: false, accountsConfigured: false };
  assert.deepEqual(composerReadiness(base), { canSend: false, reason: "not_configured" });
  assert.deepEqual(composerReadiness({ ...base, accountsConfigured: true }), { canSend: false, reason: "sign_in_required" });
  assert.deepEqual(composerReadiness({ ...base, accountsConfigured: true, signedIn: true }), { canSend: false, reason: "no_conversation" });
  assert.deepEqual(composerReadiness({ ...base, accountsConfigured: true, signedIn: true, conversationId: "c1" }), { canSend: true });
  assert.deepEqual(composerReadiness({ ...base, text: "  " }), { canSend: false, reason: "empty" });
  assert.deepEqual(composerReadiness({ ...base, turn: { status: "streaming", text: "" } }), { canSend: false, reason: "busy" });
  // Rules mode needs no account and no conversation — that is the whole point.
  assert.deepEqual(composerReadiness({ ...base, mode: "rules" }), { canSend: true });
});
