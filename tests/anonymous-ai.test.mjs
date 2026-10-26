import assert from "node:assert/strict";
import test from "node:test";
import worker from "../dist/server/index.js";
import { fixture, profile } from "./helpers/coach-harness.mjs";

test("configured AI endpoints reject missing and invalid sessions before inference or account writes", async () => {
  const f = await fixture({ OPENAI_API_KEY: "test-never-call-provider", OPENAI_MODEL: "gpt-4.1-mini",
    CMINE_CLIENT_ID: "test-client", CMINE_CLIENT_SECRET: "test-secret", SESSION_SECRET: "test-session-secret",
    R2: {}, IMAGES: {} });
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async () => { upstreamCalls++; throw new Error("Anonymous request reached an upstream service"); };
  const tables = ["plans", "generation_runs", "feature_usage", "coach_messages", "coach_action_proposals", "meal_logs", "meal_analysis_runs"];
  const counts = () => tables.map(table => f.DB.sql.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n);
  const before = counts();
  try {
    const requests = [
      ["/api/plans", { profile, consent: true }],
      ["/api/v1/plans", { profile, consent: true }],
      ["/api/v1/coach/conversations", { title: "Anonymous AI attempt" }],
      [`/api/v1/coach/conversations/${f.conversation.id}/messages`, { message: "Change my workout", clientMutationId: "anonymous-attempt" }],
      ["/api/v1/meals/upload", {}],
      ["/api/v1/meals/analyze", { mealId: "someone-elses-meal" }],
      ["/api/v1/reviews/any-review/generate", {}],
      ["/api/v1/coach/actions/any-action/accept", {}],
    ];
    for (const cookie of [undefined, "cmine_fit_session=forged-session"]) {
      for (const [path, body] of requests) {
        const response = await worker.fetch(new Request(`https://local.test${path}`, {
          method: "POST", headers: { origin: "https://local.test", "content-type": "application/json", ...(cookie ? { cookie } : {}) },
          body: JSON.stringify({ ...body, userId: "alice" }),
        }), f.env, {});
        assert.equal(response.status, 401, path);
        assert.equal((await response.json()).error, "AUTH_REQUIRED", path);
      }
    }
    assert.equal(upstreamCalls, 0, "Anonymous and forged sessions must never invoke a model or identity service");
    assert.deepEqual(counts(), before, "Rejected requests must not consume account quota or create records");
  } finally { globalThis.fetch = originalFetch; f.close(); }
});
