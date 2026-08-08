import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

// Data-quality gate for the generated exercise pool: every plannable entry
// must be complete, bilingual, correctly categorized, and have shipped media.
const poolSource = readFileSync(new URL("../packages/coach-core/src/exercise-pool.ts", import.meta.url), "utf8");
const entries = poolSource.split("\n").filter((line) => line.startsWith("  {")).map((line) => JSON.parse(line.trim().replace(/,$/, "")));

const EQUIPMENT = new Set(["bodyweight", "dumbbell", "barbell", "cable", "gym"]);
const PATTERNS = new Set(["push_h", "push_v", "pull_h", "pull_v", "squat", "hinge", "lunge", "core", "iso_biceps", "iso_triceps", "iso_shoulder", "iso_legs"]);
const DIFFICULTY = new Set(["beginner", "intermediate", "advanced"]);

test("exercise pool is large enough to back the plannable-library claim", () => {
  assert.ok(entries.length >= 120, `expected >=120 reviewed exercises, found ${entries.length}`);
});

test("every pool entry is complete, bilingual, and correctly categorized", () => {
  const ids = new Set();
  for (const entry of entries) {
    assert.match(entry.id, /^ex\d{4}$/);
    assert.ok(!ids.has(entry.id), `duplicate id ${entry.id}`);
    ids.add(entry.id);
    assert.ok(entry.name.zh.length >= 2 && !/[a-z]/i.test(entry.name.zh), `untranslated zh name for ${entry.id}: ${entry.name.zh}`);
    assert.ok(entry.name.en.length >= 3);
    assert.ok(entry.cue.zh.length >= 6 && entry.cue.en.length >= 10, `missing cue for ${entry.id}`);
    assert.ok(EQUIPMENT.has(entry.equipment), `bad equipment for ${entry.id}: ${entry.equipment}`);
    assert.ok(PATTERNS.has(entry.pattern), `bad pattern for ${entry.id}: ${entry.pattern}`);
    assert.ok(DIFFICULTY.has(entry.difficulty), `bad difficulty for ${entry.id}`);
  }
});

test("every pool entry ships both media files", () => {
  for (const entry of entries) {
    for (const extension of ["jpg", "gif"]) {
      assert.ok(existsSync(new URL(`../public/exercises/${entry.asset}.${extension}`, import.meta.url)), `missing ${entry.asset}.${extension}`);
    }
  }
});

test("risky movement families stay excluded from the pool", () => {
  const banned = /behind neck|good morning|jump|pistol|snatch|clean|jerk|upright row|nordic|muscle up/i;
  for (const entry of entries) assert.ok(!banned.test(entry.name.en), `risk-excluded movement present: ${entry.name.en}`);
});
