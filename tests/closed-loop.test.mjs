import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { calculateBmi, bmiCategory } from "../packages/coach-core/src/body-metrics.ts";

test("body metrics calculate BMI once and keep its screening categories explicit", () => {
  assert.equal(calculateBmi(70, 175), 22.9);
  assert.equal(calculateBmi(0, 175), null);
  assert.equal(bmiCategory(17.9), "underweight");
  assert.equal(bmiCategory(22.9), "reference_range");
  assert.equal(bmiCategory(27), "above_reference");
  assert.equal(bmiCategory(31), "high");
});

test("closed-loop migration persists semantic summaries, embeddings and reviewed knowledge", async () => {
  const migration = await readFile(new URL("../drizzle/0014_closed_loop_semantic_knowledge.sql", import.meta.url), "utf8");
  assert.match(migration, /method TEXT NOT NULL DEFAULT 'legacy_excerpt'/);
  assert.match(migration, /CREATE TABLE knowledge_embeddings/);
  assert.match(migration, /kb-bmi-screening/);
  assert.match(migration, /kb-protein-exercise/);
});

test("measurement drafts expose review, confirmation and rejection endpoints", async () => {
  const api = await readFile(new URL("../worker/api.ts", import.meta.url), "utf8");
  const draftModule = await readFile(new URL("../worker/modules/record-drafts.ts", import.meta.url), "utf8");
  assert.match(api, /record-drafts\?type=measurement|record-drafts/);
  assert.match(api, /\(confirm\|complete\|reject\)/);
  assert.match(draftModule, /status='confirmed'/);
  assert.match(draftModule, /status='rejected'/);
});

test("conversation summaries use a dedicated semantic schema with deterministic outage fallback", async () => {
  const llm = await readFile(new URL("../worker/llm.ts", import.meta.url), "utf8");
  const orchestrator = await readFile(new URL("../worker/modules/coach-orchestrator.ts", import.meta.url), "utf8");
  assert.match(llm, /cmine_fit_conversation_summary/);
  assert.match(orchestrator, /method = "ai_semantic"/);
  assert.match(orchestrator, /deterministic_fallback/);
});
