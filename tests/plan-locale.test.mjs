import assert from "node:assert/strict";
import test from "node:test";
import { describeSession, readPlanInsights } from "../packages/coach-core/src/index.ts";

// Day titles used to be written by the model, one field per language, for text
// that is entirely formulaic — seven pairs per plan whose two halves nobody
// could verify matched. Derived from the movements instead.
test("a session is named after the movements it contains", () => {
  const push = describeSession(["bench", "shoulder", "pushdown"]);
  assert.equal(push.title.en, "Push session");
  assert.equal(push.title.zh, "推力训练");

  const pull = describeSession(["pulldown", "row", "curl"]);
  assert.equal(pull.title.en, "Pull session");

  const lower = describeSession(["squat", "deadlift", "lunge"]);
  assert.equal(lower.title.en, "Lower body");
});

test("a mixed session says what it actually contains rather than guessing a name", () => {
  const mixed = describeSession(["squat", "bench", "row", "deadBug"]);
  assert.equal(mixed.title.en, "Full body");
  assert.ok(mixed.focus.en.length > 0, "focus should list the patterns present");
  assert.ok(mixed.focus.zh.length > 0);
  assert.notEqual(mixed.focus.zh, mixed.focus.en, "each language uses its own reviewed labels");
});

test("every derived label exists in every language", () => {
  for (const ids of [[], ["bench"], ["deadBug"], ["squat", "curl"], ["unknown-id"]]) {
    const described = describeSession(ids);
    for (const field of [described.title, described.focus]) {
      assert.ok(field.zh && field.en, `${JSON.stringify(ids)} produced an empty label`);
    }
  }
});

// Plans written before the migration are still in the database and are not
// rewritten, because users.locale is mutable and nothing records which of the
// two stored variants was the authoritative one.
test("insights read back from either plan vintage", () => {
  const modern = readPlanInsights({
    contentLocale: "en", summary: "Three sessions a week.",
    planRationale: ["a"], coachNotes: ["b"], dietGuidance: ["c"],
  }, "zh");
  assert.equal(modern.summary, "Three sessions a week.");
  assert.equal(modern.contentLocale, "en", "a plan written in English stays English for a Chinese reader");

  const legacy = readPlanInsights({
    summary: { zh: "每周三练。", en: "Three sessions a week." },
    planRationale: { zh: ["甲"], en: ["a"] },
    coachNotes: { zh: ["乙"], en: ["b"] },
    dietGuidance: { zh: ["丙"], en: ["c"] },
  }, "en");
  assert.equal(legacy.summary, "Three sessions a week.");
  assert.equal(legacy.contentLocale, "en");
  assert.deepEqual(legacy.planRationale, ["a"]);
});

test("reading a plan with no insights yields null rather than empty strings", () => {
  assert.equal(readPlanInsights(undefined, "zh"), null);
  assert.equal(readPlanInsights(null, "en"), null);
});
