import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  INTAKE_STEPS, PROFILE_RANGES, completedSteps, draftFromProfile, emptyDraft, firstIncompleteStep,
  intakeImpact, mergeDrafts, profileState, toProfile, validateStep,
} from "../packages/product-state/src/profile.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const answered = () => ({
  ...emptyDraft(),
  goal: "fat_loss", experience: "beginner",
  sex: "female", age: 31, height: 168, weight: 64, targetWeight: 60,
  activity: "light", days: 3, sessionMinutes: 30, trainingLocation: "home", equipment: "bodyweight",
  limitations: "", safetyAcknowledged: true,
});

test("an untouched draft is empty, not silently valid", () => {
  const draft = emptyDraft();
  assert.deepEqual(profileState(draft), { status: "empty" });
  assert.equal(toProfile(draft), null);
  assert.equal(firstIncompleteStep(draft), "goal");
});

test("intake asks four things, and diet preference is not one of them", () => {
  assert.deepEqual([...INTAKE_STEPS], ["goal", "body", "schedule", "safety"]);
  const withoutDiet = { ...answered(), dietaryPreference: undefined, exclusions: undefined };
  assert.equal(profileState(withoutDiet).status, "valid");
});

test("every step reports its own missing fields rather than one blanket error", () => {
  const draft = emptyDraft();
  assert.deepEqual(validateStep("goal", draft).map((issue) => issue.field), ["goal", "experience"]);
  // Daily activity sits with the body questions: it is what turns a resting
  // metabolic rate into an expenditure, so the body step cannot show a calorie
  // target without it.
  assert.deepEqual(validateStep("body", draft).map((issue) => issue.field), ["sex", "age", "height", "weight", "activity"]);
  assert.deepEqual(validateStep("schedule", draft).map((issue) => issue.field), ["days", "sessionMinutes", "equipment", "trainingLocation"]);
  assert.deepEqual(validateStep("safety", draft).map((issue) => issue.field), ["safetyAcknowledged"]);
});

test("an out-of-range answer is a range issue carrying the bounds the UI must show", () => {
  const issue = validateStep("body", { ...answered(), age: 9 })[0];
  assert.deepEqual(issue, { field: "age", code: "range", min: 16, max: 85 });
});

test("target weight is optional but not exempt from the range check", () => {
  assert.deepEqual(validateStep("body", { ...answered(), targetWeight: null }), []);
  assert.equal(validateStep("body", { ...answered(), targetWeight: 12 })[0].code, "range");
  // Omitting it means "keep me here", not "assume a default body".
  assert.equal(toProfile({ ...answered(), targetWeight: null }).targetWeight, 64);
});

// The client must not let a user finish four steps only to be refused by
// profileFrom(). The ranges are duplicated deliberately; this keeps them equal.
test("client ranges match the ranges worker/api.ts actually enforces", () => {
  const source = readFileSync(join(root, "worker", "api.ts"), "utf8");
  const guard = source.split("\n").find((line) => line.includes("profile.age < ") && line.includes("profile.height < "));
  assert.ok(guard, "could not find the profileFrom range guard in worker/api.ts");
  const expected = [
    ["age", PROFILE_RANGES.age], ["height", PROFILE_RANGES.height],
    ["weight", PROFILE_RANGES.weight], ["targetWeight", PROFILE_RANGES.targetWeight], ["days", PROFILE_RANGES.days],
  ];
  for (const [field, range] of expected) {
    assert.ok(guard.includes(`profile.${field} < ${range.min}`), `${field} minimum drifted from the server`);
    assert.ok(guard.includes(`profile.${field} > ${range.max}`), `${field} maximum drifted from the server`);
  }
  assert.ok(guard.includes(`Number(profile.sessionMinutes) < ${PROFILE_RANGES.sessionMinutes.min}`));
  assert.ok(guard.includes(`Number(profile.sessionMinutes) > ${PROFILE_RANGES.sessionMinutes.max}`));
});

test("the client applies the same track normalization the server does", () => {
  const profile = toProfile({ ...answered(), trainingTrack: "beginner_fat_loss", days: 6 });
  assert.equal(profile.days, 4);
  const hypertrophy = toProfile({ ...answered(), trainingTrack: "intermediate_hypertrophy", days: 2, experience: "beginner" });
  assert.equal(hypertrophy.goal, "muscle");
  assert.equal(hypertrophy.experience, "intermediate");
  assert.equal(hypertrophy.days, 3);
});

test("signing in after an anonymous intake never asks the same question twice", () => {
  const local = { goal: "muscle", experience: "intermediate", weight: 78, safetyAcknowledged: true };
  const remote = { goal: "fat_loss", sex: "male", age: 40, height: 180, weight: 90 };
  const merged = mergeDrafts(remote, local);
  // A local answer wins; a field the anonymous user never touched survives.
  assert.equal(merged.goal, "muscle");
  assert.equal(merged.weight, 78);
  assert.equal(merged.age, 40);
  assert.equal(merged.sex, "male");
});

test("merging never invents an answer from a blank", () => {
  const merged = mergeDrafts({ age: 44 }, { age: null, limitations: "" });
  assert.equal(merged.age, 44);
  assert.equal(merged.limitations, "");
});

test("a saved profile round-trips into an editable draft", () => {
  const profile = toProfile(answered());
  const draft = draftFromProfile(profile);
  assert.equal(profileState(draft, "account").status, "saved_account");
  assert.deepEqual(toProfile(draft), profile);
});

test("persistence is what separates valid from saved", () => {
  const draft = answered();
  assert.equal(profileState(draft, "none").status, "valid");
  assert.equal(profileState(draft, "local").status, "saved_local");
  assert.equal(profileState(draft, "account").status, "saved_account");
});

test("a partially answered draft reports which steps are done and where to resume", () => {
  const draft = { ...emptyDraft(), goal: "muscle", experience: "beginner" };
  const state = profileState(draft);
  assert.equal(state.status, "drafting");
  assert.equal(state.step, "body");
  assert.deepEqual(state.completed, ["goal"]);
  assert.deepEqual(completedSteps(draft), ["goal"]);
});

// Progressive profiling only earns the question if the next screen pays it back.
test("a step shows its effect as soon as the answers it reads are in", () => {
  // The point of progressive profiling is that the next screen pays for the
  // question. Waiting until the whole draft validates would show nothing until
  // the very last step.
  const goalOnly = { ...emptyDraft(), goal: "muscle", experience: "intermediate" };
  const early = intakeImpact("goal", goalOnly);
  assert.equal(early.kind, "goal");
  assert.ok(early.weeklySetsMax > early.weeklySetsMin);
  // ...and nothing is shown for a step whose inputs are still blank.
  assert.deepEqual(intakeImpact("body", goalOnly), { kind: "none" });
  assert.deepEqual(intakeImpact("schedule", goalOnly), { kind: "none" });
});

test("each step can show what the answers just bought", () => {
  const draft = answered();
  const goal = intakeImpact("goal", draft);
  assert.equal(goal.kind, "goal");
  assert.ok(goal.weeklySetsMax > goal.weeklySetsMin);

  const body = intakeImpact("body", draft);
  assert.equal(body.kind, "body");
  assert.ok(body.calories >= 1200, "a female profile must never be shown a target below the floor");
  assert.ok(body.protein > 0 && body.weeks > 0);

  const schedule = intakeImpact("schedule", draft);
  assert.equal(schedule.kind, "schedule");
  assert.equal(schedule.trainingDays, 3);
  assert.ok(schedule.exercisesPerSession > 0);

  const safety = intakeImpact("safety", { ...draft, limitations: "右肩前侧疼痛" });
  assert.equal(safety.kind, "safety");
  assert.equal(safety.confidence, "medium");
});

test("impact is honest about an incomplete draft instead of inventing numbers", () => {
  assert.deepEqual(intakeImpact("body", { ...emptyDraft(), goal: "muscle" }), { kind: "none" });
});
