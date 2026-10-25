import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import worker from "../dist/server/index.js";

const profile = {
  sex: "female", age: 28, height: 165, weight: 60, targetWeight: 56,
  activity: "moderate", goal: "arms", experience: "beginner", days: 4,
  equipment: "gym", limitations: "",
};

function planRequest(body = { profile, consent: true }) {
  return new Request("https://local.test/api/plans", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("health and auth config report missing external credentials honestly", async () => {
  const health = await worker.fetch(new Request("https://local.test/api/health"), {}, {});
  assert.equal(health.status, 200);
  const status = await health.json();
  assert.equal(status.ok, true);
  assert.equal(status.database, false);
  assert.equal(status.storage, false);
  assert.equal(status.planner, false);
  assert.equal(status.vision, false);
  assert.equal(status.billing, false);
  assert.equal(status.rewardAds, false);
  // Provider/model configuration details must never leak unauthenticated.
  assert.equal("providers" in status, false);
  assert.equal("model" in status, false);
  assert.equal("reasoningEffort" in status, false);
  const auth = await worker.fetch(new Request("https://local.test/api/auth/config"), {}, {});
  assert.deepEqual(await auth.json(), { cmine: false });
});

test("state-changing APIs reject cross-origin browser requests", async () => {
  const response = await worker.fetch(new Request("https://local.test/api/v1/plans", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://evil.test" },
    body: JSON.stringify({ profile, consent: true }),
  }), {}, {});
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "ORIGIN_REJECTED");
});

test("admin APIs require a valid Cmine session", async () => {
  const response = await worker.fetch(new Request("https://local.test/api/v1/admin/overview"), {}, {});
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "AUTH_REQUIRED");
});

test("plan endpoint rejects invalid profiles", async () => {
  const response = await worker.fetch(planRequest({ profile: { ...profile, age: 8 }, consent: true }), {}, {});
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "INVALID_PROFILE");
});

test("real AI plans require a signed-in product account and never return a static fallback", async () => {
  const response = await worker.fetch(planRequest(), {}, {});
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.error, "AUTH_REQUIRED");
  assert.equal("fallbackPlan" in body, false);
});

test("site metadata exposes consent document versions for re-confirmation", async () => {
  const response = await worker.fetch(new Request("https://local.test/api/v1/site"), {}, {});
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.disclaimerVersion, "health-v3");
  assert.equal(body.privacyVersion, "privacy-v2");
});

test("consent records require a configured database instead of silently succeeding", async () => {
  const response = await worker.fetch(new Request("https://local.test/api/consents", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ locale: "zh", timezone: "Asia/Shanghai", productVersion: "web-test" }),
  }), {}, {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "DATABASE_NOT_CONFIGURED");
});

test("health reports meal vision only for providers the vision router can actually use", async () => {
  // An OpenAI-only deployment has no meal_vision route, so advertising vision
  // would show a photo-scan entry that can never succeed.
  const openAiOnly = { OPENAI_API_KEY: "sk-test", OPENAI_MODEL: "some-real-model", R2: {} };
  const status = await (await worker.fetch(new Request("https://local.test/api/health"), openAiOnly, {})).json();
  assert.equal(status.planner, true);
  assert.equal(status.vision, false);
});

test("health reports server push as unconfigured until an Expo token exists", async () => {
  const withoutToken = await (await worker.fetch(new Request("https://local.test/api/health"), {}, {})).json();
  assert.equal(withoutToken.push, false);
  const withToken = await (await worker.fetch(new Request("https://local.test/api/health"), { EXPO_ACCESS_TOKEN: "expo-test" }, {})).json();
  assert.equal(withToken.push, true);
});

test("habit endpoints require a signed-in user", async () => {
  const summary = await worker.fetch(new Request("https://local.test/api/v1/habits"), {}, {});
  assert.equal(summary.status, 401);
  const commitment = await worker.fetch(new Request("https://local.test/api/v1/habits/commitment", {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ cueTime: "18:00" }),
  }), {}, {});
  assert.equal(commitment.status, 401);
});

test("notification dispatch requires a valid maintenance signature", async () => {
  const unconfigured = await worker.fetch(new Request("https://local.test/api/internal/notifications/run", { method: "POST" }), {}, {});
  assert.equal(unconfigured.status, 500);
  assert.equal((await unconfigured.json()).error, "MAINTENANCE_NOT_CONFIGURED");
  const forged = await worker.fetch(new Request("https://local.test/api/internal/notifications/run", {
    method: "POST",
    headers: { "x-cmine-timestamp": String(Date.now()), "x-cmine-nonce": "not-a-valid-nonce", "x-cmine-signature": "deadbeef" },
  }), { MAINTENANCE_SECRET: "maintsecret" }, {});
  assert.equal(forged.status, 401);
});

// --- RevenueCat webhook: authorization is enforced before any processing ---

function revenueCatRequest(authorization, event = { id: "evt-1", type: "TEST", app_user_id: "user-1" }) {
  return new Request("https://local.test/api/webhooks/revenuecat", {
    method: "POST",
    headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) },
    body: JSON.stringify({ event }),
  });
}

test("RevenueCat webhook is unavailable until a secret is configured", async () => {
  const response = await worker.fetch(revenueCatRequest("Bearer anything"), {}, {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "REVENUECAT_NOT_CONFIGURED");
});

test("RevenueCat webhook rejects a wrong or missing bearer token", async () => {
  const env = { REVENUECAT_WEBHOOK_SECRET: "topsecret", REVENUECAT_API_KEY: "rc-api-key" };
  for (const authorization of [undefined, "Bearer wrong", "topsecret"]) {
    const response = await worker.fetch(revenueCatRequest(authorization), env, {});
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, "REVENUECAT_SIGNATURE_INVALID");
  }
});

test("RevenueCat webhook with valid auth still needs the database before granting anything", async () => {
  const env = { REVENUECAT_WEBHOOK_SECRET: "topsecret", REVENUECAT_API_KEY: "rc-api-key" };
  const response = await worker.fetch(revenueCatRequest("Bearer topsecret"), env, {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "DATABASE_NOT_CONFIGURED");
});

// --- Stripe webhook: HMAC signature verification is exercised for real ---

function stripeSignature(secret, body, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

function stripeRequest(body, signatureHeader) {
  return new Request("https://local.test/api/webhooks/stripe", {
    method: "POST",
    headers: { "content-type": "application/json", ...(signatureHeader ? { "stripe-signature": signatureHeader } : {}) },
    body,
  });
}

const stripeEnv = { STRIPE_WEBHOOK_SECRET: "whsec_test" };
const stripeEventBody = JSON.stringify({ id: "evt_1", type: "customer.subscription.updated", created: 1700000000, data: { object: { id: "sub_1", customer: "cus_1", status: "active" } } });

test("Stripe webhook rejects a missing signature header", async () => {
  const response = await worker.fetch(stripeRequest(stripeEventBody, null), stripeEnv, {});
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "STRIPE_SIGNATURE_MISSING");
});

test("Stripe webhook rejects a forged signature", async () => {
  const forged = stripeSignature("whsec_other", stripeEventBody);
  const response = await worker.fetch(stripeRequest(stripeEventBody, forged), stripeEnv, {});
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "STRIPE_SIGNATURE_INVALID");
});

test("Stripe webhook rejects a stale timestamp even with a valid signature", async () => {
  const stale = stripeSignature("whsec_test", stripeEventBody, Math.floor(Date.now() / 1000) - 3600);
  const response = await worker.fetch(stripeRequest(stripeEventBody, stale), stripeEnv, {});
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "STRIPE_SIGNATURE_EXPIRED");
});

test("Stripe webhook rejects a tampered body under a valid signature", async () => {
  const valid = stripeSignature("whsec_test", stripeEventBody);
  const tampered = stripeEventBody.replace("sub_1", "sub_2");
  const response = await worker.fetch(stripeRequest(tampered, valid), stripeEnv, {});
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "STRIPE_SIGNATURE_INVALID");
});

test("Stripe webhook accepts a correctly signed event and then requires the database", async () => {
  const valid = stripeSignature("whsec_test", stripeEventBody);
  const response = await worker.fetch(stripeRequest(stripeEventBody, valid), stripeEnv, {});
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error, "DATABASE_NOT_CONFIGURED");
});
