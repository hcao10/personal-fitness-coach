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
  assert.deepEqual(await health.json(), { ok: true, database: false, llm: false, cmine: false, rewardAds: false, model: "gpt-5.6" });
  const auth = await worker.fetch(new Request("https://local.test/api/auth/config"), {}, {});
  assert.deepEqual(await auth.json(), { cmine: false });
});

test("plan endpoint rejects invalid profiles", async () => {
  const response = await worker.fetch(planRequest({ profile: { ...profile, age: 8 }, consent: true }), {}, {});
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "INVALID_PROFILE");
});

test("missing LLM key returns explicit fallback with a complete rule plan", async () => {
  const response = await worker.fetch(planRequest(), {}, {});
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.error, "AI_NOT_CONFIGURED");
  assert.equal(body.fallbackPlan.schedule.length, 7);
  assert.equal(body.fallbackPlan.schedule.filter((day) => !day.restDay).length, 4);
});

test("structured LLM output changes the weekly plan and passes server validation", async () => {
  const originalFetch = globalThis.fetch;
  const training = new Set([0, 1, 3, 5]);
  const days = Array.from({ length: 7 }, (_, dayIndex) => ({
    day_index: dayIndex,
    rest_day: !training.has(dayIndex),
    title_zh: training.has(dayIndex) ? `AI 训练 ${dayIndex + 1}` : "主动恢复",
    title_en: training.has(dayIndex) ? `AI session ${dayIndex + 1}` : "Active recovery",
    focus_zh: training.has(dayIndex) ? "个性化训练重点" : "轻松步行与活动度",
    focus_en: training.has(dayIndex) ? "Personalized training focus" : "Easy walk and mobility",
    duration_minutes: training.has(dayIndex) ? 46 : 30,
    exercises: training.has(dayIndex) ? [
      { exercise_id: "dumbbellBench", sets: 3, reps: "8-12", rest_seconds: 75 },
      { exercise_id: "dumbbellRow", sets: 3, reps: "8-12", rest_seconds: 75 },
      { exercise_id: "curl", sets: 3, reps: "10-12", rest_seconds: 60 },
    ] : [],
  }));
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://api.openai.com/v1/responses");
    const requestBody = JSON.parse(init.body);
    assert.equal(requestBody.model, "gpt-5.6");
    assert.equal(requestBody.text.format.type, "json_schema");
    return Response.json({ id: "resp_test", output_text: JSON.stringify({
      summary_zh: "这是一份根据目标、经验和训练条件生成的个性化计划。",
      summary_en: "A personalized plan based on the goal, experience, and available setup.",
      coach_notes_zh: ["动作质量优先", "保留两次余力", "疼痛时立即停止"],
      coach_notes_en: ["Prioritize technique", "Keep two reps in reserve", "Stop when pain appears"],
      diet_guidance_zh: ["每餐安排蛋白质", "训练前补充碳水", "保持充足饮水"],
      diet_guidance_en: ["Include protein each meal", "Use carbs before training", "Stay hydrated"],
      days,
    }) });
  };
  try {
    const response = await worker.fetch(planRequest(), { OPENAI_API_KEY: "test-key" }, {});
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.source, "llm");
    assert.equal(body.requestId, "resp_test");
    assert.equal(body.plan.schedule[0].title.zh, "AI 训练 1");
    assert.equal(body.plan.insights.coachNotes.zh.length, 3);
    assert.equal(body.persisted, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("D1 migration contains every long-term product record", async () => {
  const sql = await readFile(new URL("../drizzle/0000_cmine_fit_core.sql", import.meta.url), "utf8");
  for (const table of ["users", "sessions", "profiles", "plans", "consents", "point_ledger"]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  const completionSql = await readFile(new URL("../drizzle/0001_workout_completions.sql", import.meta.url), "utf8");
  assert.match(completionSql, /CREATE TABLE IF NOT EXISTS workout_completions/);
});
