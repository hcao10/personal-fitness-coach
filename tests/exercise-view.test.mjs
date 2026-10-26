import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { EXERCISE_POOL, EXERCISES, generatePlan } from "../packages/coach-core/src/index.ts";
import { LOCALES } from "../packages/i18n/src/locales.ts";
import {
  GUIDED_PATTERNS, exerciseGuidance, fromCatalogRow, fromExercise, fromPlannedExercise,
  mediaFor, resolveAsset, substitutesFor,
} from "../packages/exercise-catalog/src/index.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(readFileSync(join(root, "public", "exercise-catalog.json"), "utf8"));

const profile = {
  sex: "male", age: 34, height: 178, weight: 82, targetWeight: 82, activity: "moderate",
  goal: "muscle", experience: "intermediate", days: 4, equipment: "gym", limitations: "",
  sessionMinutes: 60, trainingLocation: "gym", trainingTrack: "intermediate_hypertrophy",
};
const plan = generatePlan(profile);
const planned = plan.schedule.find((day) => !day.restDay).exercises[0];

test("every plannable movement produces a view with media in both languages", () => {
  for (const day of plan.schedule) {
    for (const exercise of day.exercises) {
      const view = fromPlannedExercise(exercise);
      assert.ok(view.asset, `${view.id} has no asset`);
      for (const locale of LOCALES) {
        assert.ok(view.name[locale]?.trim(), `${view.id} has no name in ${locale}`);
        assert.ok(view.cue[locale]?.trim(), `${view.id} has no cue in ${locale}`);
      }
      assert.ok(view.prescription.sets > 0 && view.prescription.reps);
    }
  }
});

// The library page showed a placeholder letter for 150 movements whose GIF and
// JPG are both shipped, because the catalog JSON records asset: null for
// anything outside the curated seventeen.
test("a catalog row recovers the media the pool knows about", () => {
  const pooled = EXERCISE_POOL[0];
  const datasetId = pooled.id.slice(2);
  const row = catalog.exercises.find((item) => item.id === datasetId);
  assert.ok(row, `dataset row ${datasetId} is missing from the shipped catalog`);
  assert.equal(row.asset, null, "this test is only meaningful while the catalog leaves the asset null");
  const view = fromCatalogRow(row);
  assert.equal(view.asset, pooled.asset);
  assert.equal(mediaFor(view.asset).animated, `/exercises/${pooled.asset}.gif`);
});

test("a movement with no shipped media reports null rather than a broken path", () => {
  const orphan = catalog.exercises.find((item) => !item.asset && !resolveAsset(item.id, item.asset));
  assert.ok(orphan, "expected at least one catalog entry with no reviewed media");
  const view = fromCatalogRow(orphan);
  assert.equal(view.asset, null);
  assert.deepEqual(mediaFor(view.asset), { still: null, animated: null });
});

test("a catalog row keeps the reviewed Chinese name when the pool has one", () => {
  const pooled = EXERCISE_POOL[0];
  const row = catalog.exercises.find((item) => item.id === pooled.id.slice(2));
  assert.equal(fromCatalogRow(row).name.zh, pooled.name.zh);
});

test("guidance exists for every movement pattern in every shippable language", () => {
  const patterns = new Set(EXERCISE_POOL.map((exercise) => exercise.pattern));
  for (const pattern of patterns) {
    assert.ok(GUIDED_PATTERNS.includes(pattern), `pattern ${pattern} has no reviewed guidance`);
  }
  for (const exercise of EXERCISE_POOL) {
    for (const locale of LOCALES) {
      const guidance = exerciseGuidance(fromExercise(exercise), locale);
      assert.ok(guidance.steps.length > 0, `${exercise.id} has no steps in ${locale}`);
      assert.ok(guidance.breathing.trim(), `${exercise.id} has no breathing cue in ${locale}`);
      assert.ok(guidance.mistakes.length >= 1, `${exercise.id} has no common mistakes in ${locale}`);
      assert.ok(guidance.stopConditions.length >= 3, `${exercise.id} has too few stop conditions in ${locale}`);
    }
  }
});

test("English guidance is English and Chinese guidance is Chinese", () => {
  const HAN = /\p{Script=Han}/u;
  const view = fromExercise(EXERCISES.squat);
  const english = exerciseGuidance(view, "en");
  for (const line of [english.breathing, ...english.mistakes, ...english.stopConditions]) {
    assert.equal(HAN.test(line), false, `English guidance leaks Chinese: ${line}`);
  }
  const chinese = exerciseGuidance(view, "zh");
  assert.ok(HAN.test(chinese.breathing));
});

test("dataset steps are preferred, and the source is stated rather than implied", () => {
  const row = catalog.exercises.find((item) => item.instructions?.zh?.length > 2);
  const withSteps = exerciseGuidance(fromCatalogRow(row), "zh");
  assert.equal(withSteps.stepsSource, "dataset");
  assert.ok(withSteps.steps.length > 1);

  const fromCue = exerciseGuidance(fromPlannedExercise(planned), "zh");
  assert.equal(fromCue.stepsSource, "cue");
  assert.equal(fromCue.steps.length, 1);
});

test("substitutes share the movement pattern and respect the equipment the user has", () => {
  const view = fromPlannedExercise(planned);
  const bodyweight = substitutesFor(view, "bodyweight");
  for (const candidate of bodyweight) {
    assert.equal(candidate.pattern, view.pattern);
    assert.equal(candidate.equipment, "bodyweight");
    assert.notEqual(candidate.id, view.id);
  }
  assert.ok(substitutesFor(view, "gym").length >= bodyweight.length);
});

test("stop conditions always quote the pain threshold the server enforces", () => {
  for (const locale of LOCALES) {
    const guidance = exerciseGuidance(fromExercise(EXERCISES.squat), locale);
    assert.ok(guidance.stopConditions.some((line) => line.includes("4/10")), `${locale} stop conditions omit the threshold`);
  }
});
