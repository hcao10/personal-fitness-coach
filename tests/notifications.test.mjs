import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import test from "node:test";
import worker from "../dist/server/index.js";

// Push follows the same capability-gating contract as Stripe, RevenueCat and
// reward ads: an unconfigured deployment never reaches out to users, and the
// hourly cron reports the skip rather than appearing to have delivered.

const SECRET = "maint-secret";
const PATH = "/api/internal/notifications/run";

function signedRequest(path = PATH) {
  const timestamp = String(Date.now());
  const nonce = randomUUID();
  const signature = createHmac("sha256", SECRET).update(`${timestamp}.${nonce}.${path}`).digest("hex");
  return new Request(`https://local.test${path}`, {
    method: "POST",
    headers: { "x-cmine-timestamp": timestamp, "x-cmine-nonce": nonce, "x-cmine-signature": signature },
  });
}

test("notification dispatch reports a missing database whether or not push is configured", async () => {
  // The database is checked first: milestone persistence and the habit pass run
  // regardless of push configuration, so a missing DB is a real error either way.
  for (const env of [{ MAINTENANCE_SECRET: SECRET }, { MAINTENANCE_SECRET: SECRET, EXPO_ACCESS_TOKEN: "expo-test" }]) {
    const response = await worker.fetch(signedRequest(), env, {});
    assert.equal(response.status, 500);
    assert.equal((await response.json()).error, "DATABASE_NOT_CONFIGURED");
  }
});

test("the maintenance job stays independent of push configuration", async () => {
  const response = await worker.fetch(signedRequest("/api/internal/maintenance/run"), { MAINTENANCE_SECRET: SECRET }, {});
  assert.equal((await response.json()).error, "DATABASE_NOT_CONFIGURED");
});
