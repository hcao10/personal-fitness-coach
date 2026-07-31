/* eslint-disable @typescript-eslint/no-explicit-any */
import { EXERCISES, generatePlan, isExerciseAllowed, type CoachPlan, type Profile, type WorkoutDay } from "../app/lib/coach";
import type { WorkerEnv } from "./platform";
import type { ProductTier } from "./product";

type AiExercise = { exercise_id: string; sets: number; reps: string; rest_seconds: number };
type AiDay = {
  day_index: number;
  rest_day: boolean;
  title_zh: string;
  title_en: string;
  focus_zh: string;
  focus_en: string;
  duration_minutes: number;
  exercises: AiExercise[];
};
type AiPlanOutput = {
  summary_zh: string;
  summary_en: string;
  plan_rationale_zh: string[];
  plan_rationale_en: string[];
  coach_notes_zh: string[];
  coach_notes_en: string[];
  diet_guidance_zh: string[];
  diet_guidance_en: string[];
  days: AiDay[];
};

export type MealCandidate = {
  nameZh: string;
  nameEn: string;
  preparation: string;
  estimatedMinG: number;
  estimatedMaxG: number;
  confidence: number;
  uncertainty: string;
};

type AiRoute = { provider: "cloudflare" | "openai" | "compatible"; model: string; priority: number };
type ProviderResult = {
  text: string;
  requestId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

export type PlanGenerationResult = {
  plan: CoachPlan;
  source: "llm";
  provider: string;
  model: string;
  requestId: string | null;
  estimatedCostUsd: number;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    reasoningTokens: number | null;
  };
};

export type MealVisionResult = {
  candidates: MealCandidate[];
  needsReview: boolean;
  provider: string;
  model: string;
  requestId: string | null;
  estimatedCostUsd: number;
  usage: { inputTokens: number | null; outputTokens: number | null };
};

const responseSchema = (exerciseIds: string[]) => ({
  type: "object",
  additionalProperties: false,
  required: [
    "summary_zh", "summary_en", "plan_rationale_zh", "plan_rationale_en",
    "coach_notes_zh", "coach_notes_en", "diet_guidance_zh", "diet_guidance_en", "days",
  ],
  properties: {
    summary_zh: { type: "string", minLength: 8, maxLength: 180 },
    summary_en: { type: "string", minLength: 8, maxLength: 240 },
    plan_rationale_zh: { type: "array", minItems: 3, maxItems: 3, items: { type: "string", minLength: 8, maxLength: 120 } },
    plan_rationale_en: { type: "array", minItems: 3, maxItems: 3, items: { type: "string", minLength: 8, maxLength: 180 } },
    coach_notes_zh: { type: "array", minItems: 3, maxItems: 3, items: { type: "string", minLength: 4, maxLength: 100 } },
    coach_notes_en: { type: "array", minItems: 3, maxItems: 3, items: { type: "string", minLength: 4, maxLength: 140 } },
    diet_guidance_zh: { type: "array", minItems: 3, maxItems: 3, items: { type: "string", minLength: 4, maxLength: 100 } },
    diet_guidance_en: { type: "array", minItems: 3, maxItems: 3, items: { type: "string", minLength: 4, maxLength: 140 } },
    days: {
      type: "array", minItems: 7, maxItems: 7, items: {
        type: "object", additionalProperties: false,
        required: ["day_index", "rest_day", "title_zh", "title_en", "focus_zh", "focus_en", "duration_minutes", "exercises"],
        properties: {
          day_index: { type: "integer", minimum: 0, maximum: 6 },
          rest_day: { type: "boolean" },
          title_zh: { type: "string", maxLength: 30 },
          title_en: { type: "string", maxLength: 50 },
          focus_zh: { type: "string", maxLength: 50 },
          focus_en: { type: "string", maxLength: 80 },
          duration_minutes: { type: "integer", minimum: 20, maximum: 90 },
          exercises: {
            type: "array", maxItems: 6, items: {
              type: "object", additionalProperties: false,
              required: ["exercise_id", "sets", "reps", "rest_seconds"],
              properties: {
                exercise_id: { type: "string", enum: exerciseIds },
                sets: { type: "integer", minimum: 2, maximum: 5 },
                reps: { type: "string", enum: ["5", "6-8", "8-10", "8-12", "10-12", "12-15", "8/side", "10/side", "12/side"] },
                rest_seconds: { type: "integer", minimum: 30, maximum: 180 },
              },
            },
          },
        },
      },
    },
  },
});

const mealSchema = {
  type: "object",
  additionalProperties: false,
  required: ["foods", "needs_review"],
  properties: {
    needs_review: { type: "boolean" },
    foods: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name_zh", "name_en", "preparation", "estimated_min_g", "estimated_max_g", "confidence", "uncertainty"],
        properties: {
          name_zh: { type: "string", minLength: 1, maxLength: 60 },
          name_en: { type: "string", minLength: 1, maxLength: 90 },
          preparation: { type: "string", maxLength: 100 },
          estimated_min_g: { type: "number", minimum: 1, maximum: 3000 },
          estimated_max_g: { type: "number", minimum: 1, maximum: 3000 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          uncertainty: { type: "string", maxLength: 180 },
        },
      },
    },
  },
};

function providerConfigured(env: WorkerEnv, provider: AiRoute["provider"]): boolean {
  if (provider === "cloudflare") {
    return Boolean(
      (env.CLOUDFLARE_AI_GATEWAY_URL && env.CLOUDFLARE_AI_GATEWAY_TOKEN) ||
      (env.CLOUDFLARE_AI_ACCOUNT_ID && env.CLOUDFLARE_AI_TOKEN),
    );
  }
  if (provider === "openai") return Boolean(env.OPENAI_API_KEY);
  return Boolean(env.AI_COMPAT_BASE_URL && env.AI_COMPAT_API_KEY);
}

export function aiServices(env: WorkerEnv) {
  const cloudflare = providerConfigured(env, "cloudflare");
  const openai = providerConfigured(env, "openai");
  const compatible = providerConfigured(env, "compatible");
  return {
    planner: cloudflare || openai || compatible,
    vision: cloudflare || compatible || openai,
    providers: { cloudflare, openai, compatible },
  };
}

async function routesFor(env: WorkerEnv, task: "training_plan" | "meal_vision" | "coach_chat", tier: ProductTier): Promise<AiRoute[]> {
  if (env.DB) {
    const rows = await env.DB.prepare(`SELECT provider, model, priority FROM ai_routes
      WHERE task = ? AND tier IN (?, 'free') AND enabled = 1
      ORDER BY CASE WHEN tier = ? THEN 0 ELSE 1 END, priority LIMIT 3`)
      .bind(task, tier, tier).all<{ provider: AiRoute["provider"]; model: string; priority: number }>();
    const configured = (rows.results || []).filter((route) => providerConfigured(env, route.provider));
    if (configured.length) return configured;
  }
  const fallback: Record<string, AiRoute[]> = {
    training_plan: [
      { provider: "cloudflare", model: tier === "pro" ? "@cf/meta/llama-3.3-70b-instruct-fp8-fast" : "@cf/meta/llama-3.1-8b-instruct-fast", priority: 1 },
      { provider: "openai", model: env.OPENAI_MODEL || "gpt-5.6", priority: 2 },
      { provider: "compatible", model: env.AI_COMPAT_TEXT_MODEL || "qwen3:8b", priority: 3 },
    ],
    meal_vision: [
      { provider: "cloudflare", model: "@cf/meta/llama-3.2-11b-vision-instruct", priority: 1 },
      { provider: "cloudflare", model: "@cf/moonshotai/kimi-k2.6", priority: 2 },
      { provider: "compatible", model: env.AI_COMPAT_VISION_MODEL || "Qwen3-VL-8B-Instruct", priority: 3 },
    ],
    coach_chat: [
      { provider: "cloudflare", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", priority: 1 },
      { provider: "openai", model: env.OPENAI_MODEL || "gpt-5.6", priority: 2 },
    ],
  };
  return fallback[task].filter((route) => providerConfigured(env, route.provider));
}

async function settingNumber(env: WorkerEnv, key: string, fallback: number): Promise<number> {
  if (!env.DB) return fallback;
  const row = await env.DB.prepare("SELECT value_json FROM site_settings WHERE key = ?").bind(key).first<{ value_json: string }>();
  try {
    const value = Number(JSON.parse(row?.value_json || ""));
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export async function assertAiBudget(env: WorkerEnv): Promise<void> {
  if (!env.DB) return;
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const [daily, monthly, dailyLimit, monthlyLimit] = await Promise.all([
    env.DB.prepare("SELECT COALESCE(SUM(estimated_cost_usd), 0) AS cost FROM generation_runs WHERE created_at >= ?")
      .bind(`${today}T00:00:00.000Z`).first<{ cost: number }>(),
    env.DB.prepare("SELECT COALESCE(SUM(estimated_cost_usd), 0) AS cost FROM generation_runs WHERE created_at >= ?")
      .bind(`${month}-01T00:00:00.000Z`).first<{ cost: number }>(),
    settingNumber(env, "ai_daily_hard_usd", 5),
    settingNumber(env, "ai_monthly_hard_usd", 50),
  ]);
  if (Number(daily?.cost || 0) >= dailyLimit || Number(monthly?.cost || 0) >= monthlyLimit) throw new Error("AI_BUDGET_EXHAUSTED");
}

function extractOpenAiText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as { output_text?: unknown; output?: unknown };
  if (typeof body.output_text === "string") return body.output_text;
  if (!Array.isArray(body.output)) return null;
  for (const item of body.output) {
    if (!item || typeof item !== "object" || !Array.isArray((item as { content?: unknown }).content)) continue;
    for (const content of (item as { content: unknown[] }).content) {
      if (content && typeof content === "object" && typeof (content as { text?: unknown }).text === "string") return (content as { text: string }).text;
    }
  }
  return null;
}

function contentFromChat(payload: Record<string, any>): string | null {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const text = content.find((item) => item?.type === "text")?.text;
    return typeof text === "string" ? text : null;
  }
  const cfResponse = payload.result?.response;
  return typeof cfResponse === "string" ? cfResponse : null;
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 40_000);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (response.status !== 429 && response.status < 500) return response;
      lastError = new Error(`AI_RETRYABLE:${response.status}`);
      if (attempt === 1) return response;
    } catch (error) {
      lastError = error;
      if (attempt === 1) throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("AI_REQUEST_FAILED");
}

async function runProvider(env: WorkerEnv, route: AiRoute, options: {
  system: string;
  user: string | Array<Record<string, unknown>>;
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  safetyIdentifier?: string;
}): Promise<ProviderResult> {
  if (route.provider === "openai") {
    const response = await fetchWithRetry(env.OPENAI_BASE_URL || "https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: route.model,
        store: false,
        max_output_tokens: options.maxTokens,
        reasoning: { effort: env.OPENAI_REASONING_EFFORT || "medium" },
        ...(options.safetyIdentifier ? { safety_identifier: options.safetyIdentifier.slice(0, 64) } : {}),
        input: [{ role: "system", content: options.system }, { role: "user", content: options.user }],
        text: { format: { type: "json_schema", name: options.schemaName, strict: true, schema: options.schema } },
      }),
    });
    const payload = await response.json().catch(() => null) as Record<string, any> | null;
    if (!response.ok || !payload) throw new Error(`AI_REQUEST_FAILED:${response.status}:${payload?.error?.message || "unknown"}`);
    const text = extractOpenAiText(payload);
    if (!text) throw new Error("AI_EMPTY_RESPONSE");
    return {
      text,
      requestId: payload.id || response.headers.get("x-request-id"),
      inputTokens: payload.usage?.input_tokens ?? null,
      outputTokens: payload.usage?.output_tokens ?? null,
    };
  }
  const baseUrl = route.provider === "cloudflare"
    ? env.CLOUDFLARE_AI_GATEWAY_URL ||
      `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_AI_ACCOUNT_ID}/ai/v1/chat/completions`
    : `${env.AI_COMPAT_BASE_URL!.replace(/\/$/, "")}/chat/completions`;
  const token = route.provider === "cloudflare"
    ? env.CLOUDFLARE_AI_GATEWAY_TOKEN || env.CLOUDFLARE_AI_TOKEN
    : env.AI_COMPAT_API_KEY;
  const response = await fetchWithRetry(baseUrl, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: route.model,
      messages: [{ role: "system", content: options.system }, { role: "user", content: options.user }],
      max_completion_tokens: options.maxTokens,
      response_format: {
        type: "json_schema",
        json_schema: { name: options.schemaName, strict: true, schema: options.schema },
      },
    }),
  });
  const payload = await response.json().catch(() => null) as Record<string, any> | null;
  if (!response.ok || !payload) throw new Error(`AI_REQUEST_FAILED:${response.status}:${payload?.error?.message || "unknown"}`);
  const text = contentFromChat(payload);
  if (!text) throw new Error("AI_EMPTY_RESPONSE");
  return {
    text,
    requestId: payload.id || response.headers.get("cf-ray") || response.headers.get("x-request-id"),
    inputTokens: payload.usage?.prompt_tokens ?? payload.result?.usage?.prompt_tokens ?? null,
    outputTokens: payload.usage?.completion_tokens ?? payload.result?.usage?.completion_tokens ?? null,
  };
}

function estimatedCost(model: string, inputTokens: number | null, outputTokens: number | null): number {
  const prices: Array<[string, number, number]> = [
    ["llama-3.1-8b", 0.045, 0.335],
    ["llama-3.3-70b", 0.293, 2.253],
    ["llama-3.2-11b", 0.049, 0.676],
    ["kimi-k2.6", 0.95, 4],
  ];
  const price = prices.find(([name]) => model.includes(name));
  if (!price) return 0;
  return Number((((inputTokens || 0) * price[1] + (outputTokens || 0) * price[2]) / 1_000_000).toFixed(6));
}

function parseJson<T>(text: string): T {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error("AI_JSON_INVALID");
  }
}

function applyAiPlan(profile: Profile, base: CoachPlan, output: AiPlanOutput): CoachPlan {
  if (!Array.isArray(output.days) || !Array.isArray(output.plan_rationale_zh) || !Array.isArray(output.plan_rationale_en)) throw new Error("AI_SCHEMA_INVALID");
  const sorted = [...output.days].sort((a, b) => a.day_index - b.day_index);
  if (sorted.length !== 7 || sorted.some((day, index) => day.day_index !== index)) throw new Error("AI_SCHEDULE_INVALID");
  if (sorted.filter((day) => !day.rest_day).length !== profile.days) throw new Error("AI_TRAINING_DAYS_INVALID");
  const expectedTrainingDays = new Set(base.schedule.filter((day) => !day.restDay).map((day) => day.dayIndex));
  if (sorted.some((day) => day.rest_day === expectedTrainingDays.has(day.day_index))) throw new Error("AI_TRAINING_SPACING_INVALID");
  const schedule: WorkoutDay[] = sorted.map((day, index) => {
    if (day.rest_day) {
      return {
        dayIndex: index, title: { zh: day.title_zh, en: day.title_en },
        focus: { zh: day.focus_zh, en: day.focus_en }, duration: Math.max(20, Math.min(90, day.duration_minutes)),
        exercises: [], restDay: true,
      };
    }
    const seen = new Set<string>();
    const exercises = (Array.isArray(day.exercises) ? day.exercises : []).flatMap((item) => {
      const exercise = EXERCISES[item.exercise_id];
      if (!exercise || seen.has(exercise.id) || !isExerciseAllowed(exercise, profile.equipment)) return [];
      seen.add(exercise.id);
      return [{
        ...exercise,
        sets: Math.max(2, Math.min(5, Math.round(item.sets))),
        reps: item.reps,
        rest: `${Math.max(30, Math.min(180, Math.round(item.rest_seconds)))}s`,
      }];
    });
    if (exercises.length < (profile.equipment === "bodyweight" ? 2 : 3)) throw new Error("AI_EXERCISES_INVALID");
    return {
      dayIndex: index, title: { zh: day.title_zh, en: day.title_en },
      focus: { zh: day.focus_zh, en: day.focus_en }, duration: Math.max(20, Math.min(90, day.duration_minutes)), exercises,
    };
  });
  return {
    ...base,
    schedule,
    insights: {
      summary: { zh: output.summary_zh, en: output.summary_en },
      planRationale: { zh: output.plan_rationale_zh.slice(0, 3), en: output.plan_rationale_en.slice(0, 3) },
      coachNotes: { zh: output.coach_notes_zh.slice(0, 3), en: output.coach_notes_en.slice(0, 3) },
      dietGuidance: { zh: output.diet_guidance_zh.slice(0, 3), en: output.diet_guidance_en.slice(0, 3) },
    },
  };
}

export async function generateLlmPlan(env: WorkerEnv, profile: Profile, safetyIdentifier?: string, tier: ProductTier = "free"): Promise<PlanGenerationResult> {
  await assertAiBudget(env);
  const routes = (await routesFor(env, "training_plan", tier)).slice(0, 2);
  if (!routes.length) throw new Error("AI_NOT_CONFIGURED");
  const base = generatePlan(profile);
  const allowed = Object.values(EXERCISES).filter((exercise) => isExerciseAllowed(exercise, profile.equipment));
  const trainingDays = base.schedule.filter((day) => !day.restDay).map((day) => day.dayIndex);
  const system = "You are Cmine Fit's planning engine. Build one safe and realistic training week. This is general fitness guidance, not medical diagnosis or rehabilitation. Never change the fixed metrics or training days. Use only allowed exercise IDs. Respect experience, equipment, limitations and pain. Explain the user-facing rationale without private chain-of-thought. Include clear stop conditions. Return natural Chinese and English.";
  const input = JSON.stringify({
    profile,
    fixed_metrics: {
      bmr: base.bmr, tdee: base.tdee, calories: base.calories, calorie_delta: base.calorieDelta,
      protein: base.protein, carbs: base.carbs, fat: base.fat, weeks: base.weeks,
    },
    required_training_day_indexes: trainingDays,
    allowed_exercises: allowed.map((exercise) => ({ id: exercise.id, zh: exercise.name.zh, en: exercise.name.en, target: exercise.target.en })),
  });
  let lastError: unknown = null;
  for (const route of routes) {
    try {
      const result = await runProvider(env, route, {
        system,
        user: input,
        schemaName: "cmine_fit_plan",
        schema: responseSchema(allowed.map((exercise) => exercise.id)),
        maxTokens: 9000,
        safetyIdentifier,
      });
      const output = parseJson<AiPlanOutput>(result.text);
      return {
        plan: applyAiPlan(profile, base, output),
        source: "llm",
        provider: route.provider,
        model: route.model,
        requestId: result.requestId,
        estimatedCostUsd: estimatedCost(route.model, result.inputTokens, result.outputTokens),
        usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens, reasoningTokens: null },
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("AI_GENERATION_FAILED");
}

export async function generateMealVision(env: WorkerEnv, imageDataUrl: string, tier: ProductTier): Promise<MealVisionResult> {
  await assertAiBudget(env);
  const routes = (await routesFor(env, "meal_vision", tier)).slice(0, 2);
  if (!routes.length) throw new Error("AI_NOT_CONFIGURED");
  const system = "Identify the visible foods in this meal photo. Do not claim exact calories or exact mass from one image. Return conservative mass ranges, preparation clues, confidence, and uncertainty. Mixed dishes, hidden oils, sauces and unclear scale must set needs_review=true. Return Chinese and English food names.";
  let lastError: unknown = null;
  for (const route of routes) {
    try {
      const result = await runProvider(env, route, {
        system,
        user: [
          { type: "text", text: "Analyse this meal. The user will confirm every food and portion before nutrition is calculated." },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
        schemaName: "cmine_fit_meal",
        schema: mealSchema,
        maxTokens: 2200,
      });
      const output = parseJson<{
        needs_review: boolean;
        foods: Array<{
          name_zh: string; name_en: string; preparation: string;
          estimated_min_g: number; estimated_max_g: number; confidence: number; uncertainty: string;
        }>;
      }>(result.text);
      if (!Array.isArray(output.foods) || !output.foods.length) throw new Error("AI_SCHEMA_INVALID");
      const candidates = output.foods.slice(0, 8).map((food) => ({
        nameZh: String(food.name_zh).slice(0, 60),
        nameEn: String(food.name_en).slice(0, 90),
        preparation: String(food.preparation || "").slice(0, 100),
        estimatedMinG: Math.max(1, Math.min(3000, Number(food.estimated_min_g))),
        estimatedMaxG: Math.max(1, Math.min(3000, Number(food.estimated_max_g))),
        confidence: Math.max(0, Math.min(1, Number(food.confidence))),
        uncertainty: String(food.uncertainty || "").slice(0, 180),
      }));
      const average = candidates.reduce((sum, item) => sum + item.confidence, 0) / candidates.length;
      if (average < 0.45 && route !== routes[routes.length - 1]) continue;
      return {
        candidates,
        needsReview: output.needs_review || average < 0.7,
        provider: route.provider,
        model: route.model,
        requestId: result.requestId,
        estimatedCostUsd: estimatedCost(route.model, result.inputTokens, result.outputTokens),
        usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("AI_GENERATION_FAILED");
}
