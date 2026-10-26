import assert from "node:assert/strict";
import test from "node:test";
import {
  DisabledAnybiteAdapter, consentActive, idempotencyKeyFor, pairwiseSubjectId, shouldApplyOutcome,
} from "../packages/integrations/anybite/src/index.ts";

const adapter = new DisabledAnybiteAdapter();

const goal = {
  schemaVersion: "1", subjectId: "abc", effectiveFrom: "2026-08-30", goal: "fat_loss",
  calorieTargetRange: { min: 1600, max: 1800 }, proteinTargetG: 104,
  locale: "zh", timezone: "Asia/Shanghai", sourcePlanVersion: "plan-v3",
};

// anyBite has planning documents and no deployed service. Anything that looks
// like a connection here would be a lie the UI would then repeat.
test("the shipped adapter reports unsupported rather than disconnected-but-ready", async () => {
  assert.deepEqual(await adapter.status(), { status: "unsupported", reason: "no_peer_service" });
  assert.deepEqual(await adapter.consents(), []);
  assert.deepEqual(await adapter.grant("nutrition_goal_share"), { status: "unsupported", reason: "no_peer_service" });
  assert.deepEqual(await adapter.revoke("meal_outcome_import"), { status: "unsupported", reason: "no_peer_service" });
});

test("pushing and pulling refuse without queueing, and say the refusal is final", async () => {
  const push = await adapter.pushNutritionGoal(goal, "k1");
  assert.deepEqual(push, { ok: false, code: "unsupported", retryable: false });
  const pull = await adapter.pullMealOutcomes("abc", "2026-08-01");
  assert.deepEqual(pull, { ok: false, code: "unsupported", retryable: false });
});

test("a refused push never reports a sync time", async () => {
  const status = await adapter.status();
  assert.equal("lastSyncedAt" in status, false);
});

test("the nutrition payload carries no body measurements", () => {
  const forbidden = ["height", "weight", "age", "sex", "bodyFat", "limitations", "injuries"];
  for (const field of forbidden) assert.equal(field in goal, false, `${field} must not cross the boundary`);
});

test("a pairwise subject id is derived from a salt, not from the account id", async () => {
  const a = await pairwiseSubjectId("user-1", "salt-a");
  const b = await pairwiseSubjectId("user-1", "salt-b");
  const again = await pairwiseSubjectId("user-1", "salt-a");
  assert.equal(a, again, "the pseudonym must be stable for one deployment");
  assert.notEqual(a, b, "a different salt must not produce a joinable id");
  assert.equal(a.length, 32);
  assert.equal(a.includes("user-1"), false);
});

test("consent is a granted-and-not-revoked pair, so revoking is not just a missing row", () => {
  assert.equal(consentActive({ purpose: "nutrition_goal_share", grantedAt: "2026-08-01T00:00:00Z", revokedAt: null }), true);
  assert.equal(consentActive({ purpose: "nutrition_goal_share", grantedAt: "2026-08-01T00:00:00Z", revokedAt: "2026-08-20T00:00:00Z" }), false);
  assert.equal(consentActive({ purpose: "meal_outcome_import", grantedAt: null, revokedAt: null }), false);
  assert.equal(consentActive(null), false);
});

test("an older revision is dropped rather than overwriting a newer one", () => {
  const existing = { schemaVersion: "1", subjectId: "abc", localDate: "2026-08-29", mealsRecorded: 3, sourceRevision: "2026-08-29T18:00:00Z" };
  const older = { ...existing, mealsRecorded: 1, sourceRevision: "2026-08-29T09:00:00Z" };
  const newer = { ...existing, mealsRecorded: 4, sourceRevision: "2026-08-29T21:00:00Z" };
  assert.equal(shouldApplyOutcome(older, existing), false);
  assert.equal(shouldApplyOutcome(newer, existing), true);
  assert.equal(shouldApplyOutcome(existing, null), true);
  // A different day is a different row, not a conflict.
  assert.equal(shouldApplyOutcome({ ...older, localDate: "2026-08-30" }, existing), true);
});

test("idempotency keys are stable for the same subject and effective date", () => {
  assert.equal(idempotencyKeyFor("nutrition_goal", "abc", "2026-08-30"), idempotencyKeyFor("nutrition_goal", "abc", "2026-08-30"));
  assert.notEqual(idempotencyKeyFor("nutrition_goal", "abc", "2026-08-30"), idempotencyKeyFor("nutrition_goal", "abc", "2026-08-31"));
});
