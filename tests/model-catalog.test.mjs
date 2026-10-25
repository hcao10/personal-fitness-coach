import assert from "node:assert/strict";
import test from "node:test";
import { modelCatalogSnapshot, testProviderKey } from "../worker/model-catalog.ts";

test("model catalog intersects open-source metadata with models available to the configured key", async () => {
  const originalFetch = globalThis.fetch;
  const seenAuthorization = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url === "https://models.dev/api.json") {
      return Response.json({
        openai: {
          name: "OpenAI", npm: "@ai-sdk/openai", doc: "https://example.test/openai",
          models: {
            "gpt-live": { name: "GPT Live", reasoning: true, reasoning_options: { type: "effort", values: ["low", "medium"] }, structured_output: true, modalities: { input: ["text"], output: ["text"] }, cost: { input: 1, output: 2 }, limit: { context: 1000 } },
            "gpt-unavailable": { name: "GPT Unavailable", reasoning: true, structured_output: true, modalities: { input: ["text"], output: ["text"] } },
          },
        },
      });
    }
    if (url === "https://api.openai.com/v1/models") {
      seenAuthorization.push(init.headers?.authorization);
      return Response.json({ data: [{ id: "gpt-live" }] });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  try {
    const snapshot = await modelCatalogSnapshot({ OPENAI_API_KEY: "sk-private" }, "openai");
    assert.equal(snapshot.connection.ok, true);
    assert.equal(snapshot.models.find((model) => model.id === "gpt-live")?.selectable, true);
    assert.equal(snapshot.models.find((model) => model.id === "gpt-unavailable")?.selectable, false);
    assert.deepEqual(seenAuthorization, ["Bearer sk-private"]);
    assert.equal(JSON.stringify(snapshot).includes("sk-private"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("key test reports provider authentication failure without returning provider payloads", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: "secret provider detail" } }), { status: 401, headers: { "content-type": "application/json" } });
  try {
    const result = await testProviderKey({ OPENAI_API_KEY: "sk-private" }, "openai");
    assert.equal(result.ok, false);
    assert.match(result.message, /API Key 无效/);
    assert.equal(JSON.stringify(result).includes("secret provider detail"), false);
    assert.equal(JSON.stringify(result).includes("sk-private"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
