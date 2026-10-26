import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import worker from "../dist/server/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = readFileSync(join(root, "public", "exercise-catalog.json"), "utf8");

// The worker reads the exercise catalog through the static asset binding.
const assets = { fetch: async () => new Response(catalog, { headers: { "content-type": "application/json" } }) };

// A D1 binding whose migrations have not been applied. Every statement throws
// the way the real driver does for a missing table — this is the local state
// that used to turn /api/v1/site into a 500 and take the homepage with it.
const unmigratedDb = {
  prepare() {
    const statement = {
      bind: () => statement,
      first: async () => { throw new Error("D1_ERROR: no such table: site_settings"); },
      all: async () => { throw new Error("D1_ERROR: no such table: site_settings"); },
      run: async () => { throw new Error("D1_ERROR: no such table: site_settings"); },
    };
    return statement;
  },
  batch: async () => [],
};

const get = (path, env = {}) => worker.fetch(new Request(`https://local.test${path}`), env, {});

test("health separates a bound database from a ready schema", async () => {
  const response = await get("/api/health");
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.database, false);
  assert.equal(body.schemaReady, false);
  // The missing tables are the local fix instruction, and they are already in
  // the repository, so naming them leaks nothing.
  assert.ok(body.missingTables.includes("site_settings"));
  assert.ok(body.missingTables.includes("users"));
  // Configuration reconnaissance must still stay out of an unauthenticated response.
  assert.equal("providers" in body, false);
  assert.equal("model" in body, false);
});

test("a bound database with no migrations is reported as not ready, not as healthy", async () => {
  const response = await get("/api/health", { DB: unmigratedDb });
  const body = await response.json();
  assert.equal(body.database, true, "the binding exists");
  assert.equal(body.schemaReady, false, "but the schema does not");
});

// The regression this closes: /api/v1/site answered 500 on an un-migrated
// database, so the consent gate and the announcement went down with it — even
// though every value it returns has a shipped default.
test("site metadata degrades to its defaults instead of failing", async () => {
  const response = await get("/api/v1/site", { DB: unmigratedDb });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.disclaimerVersion, "health-v3");
  assert.equal(body.privacyVersion, "privacy-v2");
  assert.equal(body.announcement, "");
  assert.equal(body.schemaReady, false);
});

test("site metadata reports whether accounts are even possible", async () => {
  const response = await get("/api/v1/site");
  const body = await response.json();
  assert.equal(body.capabilities.accounts, false);
  assert.equal(body.capabilities.planner, false);
});

// Guest mode is the first-value path, so movement guidance cannot be behind a
// login: a signed-out user following a demo GIF needs the steps and the stop
// conditions more than a signed-in one does.
test("exercise guidance is readable without an account", async () => {
  const response = await get("/api/v1/exercises/guidance?ids=ex0032,0001", { ASSETS: assets });
  assert.equal(response.status, 200);
  const body = await response.json();
  const ids = body.exercises.map((item) => item.id);
  assert.deepEqual(ids.sort(), ["0001", "ex0032"]);
  const curl = body.exercises.find((item) => item.id === "ex0032");
  assert.ok(curl.instructions.zh.length > 0);
  assert.ok(curl.instructions.en.length > 0);
});

test("guidance requires ids rather than dumping the whole catalog", async () => {
  const response = await get("/api/v1/exercises/guidance", { ASSETS: assets });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "EXERCISE_NOT_FOUND");
});

test("guidance caps how much one request can pull", async () => {
  const ids = Array.from({ length: 60 }, (_, index) => String(index + 1).padStart(4, "0")).join(",");
  const response = await get(`/api/v1/exercises/guidance?ids=${ids}`, { ASSETS: assets });
  const body = await response.json();
  assert.ok(body.exercises.length <= 24, `returned ${body.exercises.length} rows for a 60-id request`);
});

test("a missing catalog is a stated failure, not an empty success", async () => {
  const response = await get("/api/v1/exercises/guidance?ids=0001", { ASSETS: { fetch: async () => new Response("", { status: 404 }) } });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "EXERCISE_CATALOG_UNAVAILABLE");
});
