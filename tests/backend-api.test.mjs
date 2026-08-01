import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
  assert.deepEqual(status.providers, { cloudflare: false, openai: false, compatible: false });
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

test("AI router supports low-cost Cloudflare, OpenAI, and compatible providers", async () => {
  const llm = await readFile(new URL("../worker/llm.ts", import.meta.url), "utf8");
  assert.match(llm, /provider === "cloudflare"/);
  assert.match(llm, /provider === "openai"/);
  assert.match(llm, /AI_COMPAT_BASE_URL/);
  assert.match(llm, /AI_BUDGET_EXHAUSTED/);
  assert.match(llm, /llama-3\.2-11b-vision-instruct/);
  assert.match(llm, /kimi-k2\.6/);
});

test("D1 migration contains every long-term product record", async () => {
  const sql = await readFile(new URL("../drizzle/0000_cmine_fit_core.sql", import.meta.url), "utf8");
  for (const table of ["users", "sessions", "profiles", "plans", "consents", "point_ledger"]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  const completionSql = await readFile(new URL("../drizzle/0001_workout_completions.sql", import.meta.url), "utf8");
  assert.match(completionSql, /CREATE TABLE IF NOT EXISTS workout_completions/);
  const productSql = await readFile(new URL("../drizzle/0002_product_web_v1.sql", import.meta.url), "utf8");
  for (const table of ["measurements", "workout_sessions", "generation_runs", "site_settings", "admin_audit_events"]) {
    assert.match(productSql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  const adminRoleSql = await readFile(new URL("../drizzle/0003_cmine_admin_roles.sql", import.meta.url), "utf8");
  assert.match(adminRoleSql, /ADD COLUMN role TEXT NOT NULL DEFAULT 'user'/);
  assert.match(adminRoleSql, /ADD COLUMN cmine_role TEXT NOT NULL DEFAULT 'user'/);
  const productizationSql = await readFile(new URL("../drizzle/0004_commerce_nutrition_ai.sql", import.meta.url), "utf8");
  for (const table of ["billing_customers", "subscriptions", "entitlements", "feature_usage", "meal_logs", "meal_images", "meal_items", "meal_analysis_runs", "nutrition_cache", "ai_routes", "reward_events", "point_redemptions"]) {
    assert.match(productizationSql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
});

test("payments and nutrition enforce signed events and user confirmation", async () => {
  const billing = await readFile(new URL("../worker/billing.ts", import.meta.url), "utf8");
  const nutrition = await readFile(new URL("../worker/nutrition.ts", import.meta.url), "utf8");
  assert.match(billing, /verifyStripeWebhook/);
  assert.match(billing, /timingSafeEqual/);
  assert.match(billing, /ON CONFLICT\(external_subscription_id\)/);
  assert.match(nutrition, /NUTRITION_REFERENCE_REQUIRED/);
  assert.match(nutrition, /world\.openfoodfacts\.org/);
  assert.match(nutrition, /FoodData Central|api\.nal\.usda\.gov/);
});

test("dual-track training records real sets and food provenance", async () => {
  const migration = await readFile(new URL("../drizzle/0006_dual_track_training_food_search.sql", import.meta.url), "utf8");
  for (const table of ["workout_sets", "coach_record_drafts", "canonical_foods", "food_source_records", "food_aliases", "food_nutrients", "food_source_licenses", "food_corrections", "food_search_events", "recipes", "recipe_items", "meal_templates"]) {
    assert.match(migration, new RegExp(`CREATE TABLE ${table}`));
  }
  const core = await readFile(new URL("../packages/coach-core/src/index.ts", import.meta.url), "utf8");
  assert.match(core, /beginner_fat_loss/);
  assert.match(core, /intermediate_hypertrophy/);
  assert.match(core, /suggestedLoadMultiplier/);
  const api = await readFile(new URL("../worker/api.ts", import.meta.url), "utf8");
  assert.match(api, /workoutSetsMatch/);
  assert.match(api, /\/api\/v1\/foods\/custom/);
  assert.match(api, /\/api\/v1\/recipes/);
  assert.match(api, /\/api\/v1\/meal-templates/);
});

test("AI Coach closed loop stores real dates, memory, briefs, feedback, and idempotent actions", async () => {
  const migration = await readFile(new URL("../drizzle/0007_ai_coach_closed_loop.sql", import.meta.url), "utf8");
  for (const table of ["workout_occurrences", "workout_occurrence_sessions", "workout_occurrence_sets", "coach_action_executions", "coach_memories", "coach_preferences", "coach_conversation_summaries", "coach_daily_briefs", "coach_checkins", "coach_feedback", "knowledge_sources", "knowledge_articles", "coach_evaluation_runs"]) {
    assert.match(migration, new RegExp(`CREATE TABLE ${table}`));
  }
  assert.match(migration, /free_coach_message_limit','10'/);
  const api = await readFile(new URL("../worker/api.ts", import.meta.url), "utf8");
  assert.match(api, /\/api\/v1\/coach\/home/);
  assert.match(api, /\/api\/v1\/coach\/check-ins/);
  assert.match(api, /\/api\/v1\/coach\/memory/);
  assert.match(api, /occurrenceRescheduleMatch/);
  assert.match(api, /message\.delta/);
});

test("Coach uses provider streaming, reviewed knowledge, and user-confirmed versioned changes", async () => {
  const llm = await readFile(new URL("../worker/llm.ts", import.meta.url), "utf8");
  const coach = await readFile(new URL("../worker/modules/coach.ts", import.meta.url), "utf8");
  const core = await readFile(new URL("../packages/coach-core/src/index.ts", import.meta.url), "utf8");
  assert.match(llm, /runProviderStream/);
  assert.match(llm, /onDelta/);
  assert.match(llm, /source_ids/);
  assert.match(coach, /base_version_id/);
  assert.match(coach, /coach_action_executions/);
  assert.match(coach, /status: "draft"/);
  assert.match(core, /habit_foundation/);
  assert.match(core, /hypertrophy_build/);
  assert.match(core, /variants/);
  assert.match(core, /stopConditions/);
});

test("today experience follows the selected start date and records each weekly occurrence separately", async () => {
  const today = await readFile(new URL("../app/today/today-client.tsx", import.meta.url), "utf8");
  const onboarding = await readFile(new URL("../app/onboarding/onboarding-client.tsx", import.meta.url), "utf8");
  assert.match(today, /occurrenceId/);
  assert.match(today, /30 秒状态检查/);
  assert.match(today, /恢复版/);
  assert.match(today, /动作要点与注意事项/);
  assert.match(today, /exercise-media-modal/);
  assert.match(onboarding, /计划从哪天开始/);
  assert.match(onboarding, /startDate, timezone/);
});

test("food search avoids LLM nutrition values and labels source quality", async () => {
  const nutrition = await readFile(new URL("../worker/nutrition.ts", import.meta.url), "utf8");
  assert.match(nutrition, /sourceKind/);
  assert.match(nutrition, /Open Food Facts contributors/);
  assert.match(nutrition, /USDA FoodData Central/);
  assert.match(nutrition, /food_search_events/);
  assert.doesNotMatch(nutrition, /generateCoachChat/);
});

test("admin authentication uses Cmine roles and contains no GPT identity dependency", async () => {
  const api = await readFile(new URL("../worker/api.ts", import.meta.url), "utf8");
  const adminPage = await readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
  const adminDashboard = await readFile(new URL("../app/admin/admin-dashboard.tsx", import.meta.url), "utf8");
  assert.match(api, /const admin = await getSessionUser\(request, env\)/);
  assert.match(api, /admin\.role !== "admin"/);
  assert.doesNotMatch(api, /oai-authenticated-user-email/);
  assert.doesNotMatch(adminPage, /ChatGPT|chatGPT|signin-with-chatgpt/);
  assert.match(adminDashboard, /beginCmineLogin\("\/admin"\)/);
});

test("homepage product copy matches the approved Chinese positioning", async () => {
  const i18n = await readFile(new URL("../app/lib/i18n.ts", import.meta.url), "utf8");
  assert.match(i18n, /titleA: "低效盲目训练"/);
  assert.match(i18n, /titleB: "为您定制的专属计划如下："/);
});
