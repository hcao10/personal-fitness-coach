import assert from "node:assert/strict";
import test from "node:test";
import { actionsAllowedUnderRisk, assessSafety, coachSafetyFlags, safetyGuidance, INTENSITY_RAISING_ACTIONS, PAIN_THRESHOLD, SAFETY_PATTERNS, SAFETY_GUIDANCE } from "../packages/domain/src/safety.ts";
import { SHIPPABLE_LOCALES } from "../packages/i18n/src/locales.ts";
import { INTENSITY_RAISING_ACTIONS as ACTIONS_FROM_INDEX } from "../packages/domain/src/index.ts";

// Layer one of the coach safety gate. Layer two is the model's safety_flag in
// worker/llm.ts, which catches paraphrase this screen cannot match.

// ---------------------------------------------------------------------------
// The launch gate: a locale may not be offered to users until the safety screen
// can read it. This is the test that makes "we support language X" mean
// something — the previous screen matched Chinese plus three fixed English
// phrases, so a Spanish user reporting chest pain was simply invisible.
// ---------------------------------------------------------------------------

const CANONICAL_EMERGENCIES = {
  zh: ["训练时胸痛", "我快晕厥了", "呼吸困难，喘不上气", "腿无法承重", "小腿麻木没有知觉", "听到咔的一声，可能骨折"],
  en: ["I have chest pain", "I feel like I'm going to faint", "I can't breathe properly", "I cannot bear weight on it", "my foot is numb", "I heard a pop in my knee"],
};

const CANONICAL_PAIN_SCORES = {
  zh: ["疼痛 7", "疼痛程度是 6", "膝盖 8 分的疼", "疼痛感 5"],
  en: ["pain is 7", "pain level 6", "my knee is 8/10", "it hurts 5 out of 10"],
};

const CANONICAL_SAFE = {
  zh: ["今天状态不错", "训练完有点累但很好", "想增加卧推重量"],
  en: ["feeling great today", "a bit tired after training but good", "I want to add weight to my bench"],
};

test("every shippable locale has safety patterns registered", () => {
  for (const locale of SHIPPABLE_LOCALES) {
    assert.ok(SAFETY_PATTERNS[locale], `${locale} is shippable but has no safety patterns`);
    assert.ok(SAFETY_PATTERNS[locale].redFlags.length > 0, `${locale} registers no red-flag patterns`);
    assert.ok(SAFETY_GUIDANCE[locale], `${locale} has no safety guidance text`);
  }
});

test("every shippable locale detects its canonical emergency phrases", () => {
  for (const locale of SHIPPABLE_LOCALES) {
    const phrases = CANONICAL_EMERGENCIES[locale];
    assert.ok(phrases, `${locale} has no canonical emergency phrases in this test — add them before shipping the locale`);
    for (const phrase of phrases) {
      assert.equal(assessSafety(phrase).level, "emergency", `${locale}: "${phrase}" was not treated as an emergency`);
    }
  }
});

test("every shippable locale reads an explicit pain score", () => {
  for (const locale of SHIPPABLE_LOCALES) {
    for (const phrase of CANONICAL_PAIN_SCORES[locale]) {
      const assessment = assessSafety(phrase);
      assert.ok(assessment.pain !== null, `${locale}: no score parsed from "${phrase}"`);
      assert.ok(assessment.pain >= PAIN_THRESHOLD, `${locale}: "${phrase}" parsed as ${assessment.pain}, below the threshold`);
      assert.equal(assessment.level, "caution", `${locale}: "${phrase}" should be caution, not ${assessment.level}`);
    }
  }
});

test("ordinary training talk is not flagged in any shippable locale", () => {
  for (const locale of SHIPPABLE_LOCALES) {
    for (const phrase of CANONICAL_SAFE[locale]) {
      assert.equal(assessSafety(phrase).level, "none", `${locale}: "${phrase}" was falsely flagged`);
    }
  }
});

// ---------------------------------------------------------------------------
// Cross-language behavior: patterns are never filtered by the user's interface
// language, because people type in whatever language they think in.
// ---------------------------------------------------------------------------

test("a message is screened against every language, not just the user's own", () => {
  assert.equal(assessSafety("chest pain during squats").level, "emergency");
  assert.equal(assessSafety("深蹲时 chest pain").level, "emergency");
  assert.equal(assessSafety("I felt 胸痛 today").level, "emergency");
});

test("numeric pain forms work even in a language with no patterns registered", () => {
  // "8/10" carries across languages, so an untranslated locale still catches a
  // stated score rather than reading it as ordinary text.
  assert.equal(assessSafety("dolor 8/10 en la rodilla").pain, 8);
  assert.equal(assessSafety("dolor 8/10 en la rodilla").level, "caution");
});

test("the worst score in a message decides the verdict", () => {
  const assessment = assessSafety("shoulder pain is 2 but my knee is 9/10");
  assert.equal(assessment.pain, 9);
  assert.equal(assessment.level, "caution");
});

test("scores below the threshold do not raise a flag", () => {
  assert.equal(assessSafety("疼痛 2 分").level, "none");
  assert.equal(assessSafety("pain is 3").level, "none");
  assert.equal(assessSafety("疼痛 4 分").level, "caution");
});

// ---------------------------------------------------------------------------
// Severity split: an emergency stops the conversation; a pain score does not.
// Refusing to answer someone with a sore knee sends them to guess alone.
// ---------------------------------------------------------------------------

test("emergency and caution are distinguished, and both withhold intensity", () => {
  assert.equal(assessSafety("胸痛").level, "emergency");
  assert.equal(assessSafety("膝盖 6/10 的疼，今天该练什么").level, "caution");
  for (const phrase of ["胸痛", "膝盖 6/10 的疼"]) assert.equal(assessSafety(phrase).highRisk, true);
});

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
  assert.equal(ACTIONS_FROM_INDEX, INTENSITY_RAISING_ACTIONS, "the index re-export must be the same set");
});

// ---------------------------------------------------------------------------
// Guidance text and the backwards-compatible wrapper.
// ---------------------------------------------------------------------------

test("guidance is returned in the caller's locale and falls back rather than blanking", () => {
  assert.match(safetyGuidance("zh"), /医疗/);
  assert.match(safetyGuidance("en"), /medical/i);
  assert.equal(safetyGuidance("xx"), SAFETY_GUIDANCE.zh);
});

test("coachSafetyFlags keeps its old shape and now carries a level", () => {
  const emergency = coachSafetyFlags("胸痛", "en");
  assert.equal(emergency.highRisk, true);
  assert.equal(emergency.level, "emergency");
  assert.match(emergency.message, /medical/i);
  const safe = coachSafetyFlags("今天状态不错");
  assert.equal(safe.highRisk, false);
  assert.equal(safe.message, undefined);
});

// ---------------------------------------------------------------------------
// Known limits, recorded so they stay visible rather than assumed away.
// ---------------------------------------------------------------------------

test("fully paraphrased risk still escapes the keyword screen — this is why the model layer exists", () => {
  // No score, no red-flag term: only the model's safety_flag can catch these.
  assert.equal(assessSafety("something in my shoulder feels really wrong when I press").level, "none");
  assert.equal(assessSafety("肩膀那里感觉不太对劲，一推就别扭").level, "none");
});
