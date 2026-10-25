/* eslint-disable @typescript-eslint/no-explicit-any */
import { decoratePlanSchedule, describeSession, evidencePrescription, exercisePattern, EXERCISES, generatePlan, isExerciseAllowed, type CoachPlan, type Profile, type WorkoutDay } from "../app/lib/coach.ts";
import { actionsAllowedUnderRisk, auditContentLocale } from "../packages/domain/src/index.ts";
import { modelCatalogSnapshot } from "./model-catalog.ts";
import type { WorkerEnv } from "./platform";
import type { ProductTier } from "./product";

type AiExercise = { exercise_id: string; sets: number; reps: string; rest_seconds: number };
// No title/focus: those are derived from the chosen movements by
// describeSession, which is deterministic and stays multilingual.
type AiDay = {
  day_index: number;
  rest_day: boolean;
  duration_minutes: number;
  exercises: AiExercise[];
};
type AiPlanOutput = {
  content_locale?: string;
  summary: string;
  plan_rationale: string[];
  coach_notes: string[];
  diet_guidance: string[];
  days: AiDay[];
};

import type { MealCandidate } from "../packages/api-contracts/src";
import { DEFAULT_LOCALE, SHIPPABLE_LOCALES, type Locale } from "../packages/i18n/src/index.ts";
import { systemPrompt } from "./prompts/index.ts";
import { outputDirective } from "./prompts/locale.ts";
export type { MealCandidate };

export type AiRoute = { provider: "cloudflare" | "openai" | "compatible" | "model_hub"; model: string; priority: number };
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
  /** Language of every candidate `name`, measured rather than assumed. */
  contentLocale: Locale;
  localeClaimMismatch: boolean;
  needsReview: boolean;
  provider: string;
  model: string;
  requestId: string | null;
  estimatedCostUsd: number;
  usage: { inputTokens: number | null; outputTokens: number | null };
};

export type CoachChatResult = {
  reply: string;
  /**
   * Language of `reply`, decided by the server rather than taken on faith.
   * Measured from the text; the model's own claim only breaks a tie when the
   * text is too short to measure.
   */
  contentLocale: Locale;
  /** True when the model's claim and the measured script disagree. */
  localeClaimMismatch: boolean;
  intent: string;
  safety: { highRisk: boolean; category: string; detail: string };
  basis: Array<{ label: string; value: string; observedAt?: string; source?: string }>;
  limitations: string[];
  sourceIds: string[];
  actions: Array<{
    type: "replace_exercise" | "shorten_session" | "adjust_load" | "reschedule_workout" | "plan_adjustment" | "log_workout" | "log_measurement" | "create_meal_draft" | "schedule_review";
    title: string; description: string; before: string; after: string; reason: string; impact: string[]; reversible: boolean;
    exercise_id?: string; replacement_exercise_id?: string; duration_minutes?: number; target_date?: string;
    load_multiplier?: number; set_multiplier?: number;
  }>;
  provider: string;
  model: string;
  requestId: string | null;
  estimatedCostUsd: number;
  usage: { inputTokens: number | null; outputTokens: number | null };
};

export type ConversationSummaryResult = {
  summary: string; provider: string; model: string; requestId: string | null; estimatedCostUsd: number;
  usage: { inputTokens: number | null; outputTokens: number | null };
};

const responseSchema = (exerciseIds: string[]) => ({
  type: "object",
  additionalProperties: false,
  required: ["summary", "content_locale", "plan_rationale", "coach_notes", "diet_guidance", "days"],
  properties: {
    // One language per plan, named by the caller's locale and echoed back.
    // The maxLengths are the old English ones: a limit tuned to Chinese
    // character counts would truncate every other language mid-sentence.
    content_locale: { type: "string", enum: [...SHIPPABLE_LOCALES] },
    summary: { type: "string", minLength: 8, maxLength: 240 },
    plan_rationale: { type: "array", minItems: 3, maxItems: 3, items: { type: "string", minLength: 8, maxLength: 180 } },
    coach_notes: { type: "array", minItems: 3, maxItems: 3, items: { type: "string", minLength: 4, maxLength: 140 } },
    diet_guidance: { type: "array", minItems: 3, maxItems: 3, items: { type: "string", minLength: 4, maxLength: 140 } },
    days: {
      type: "array", minItems: 7, maxItems: 7, items: {
        type: "object", additionalProperties: false,
        required: ["day_index", "rest_day", "duration_minutes", "exercises"],
        properties: {
          day_index: { type: "integer", minimum: 0, maximum: 6 },
          rest_day: { type: "boolean" },
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
  required: ["foods", "needs_review", "content_locale"],
  properties: {
    needs_review: { type: "boolean" },
    // One language for the whole response, cross-checked against the names.
    content_locale: { type: "string", enum: [...SHIPPABLE_LOCALES] },
    foods: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "search_term_en", "preparation", "estimated_min_g", "estimated_max_g", "confidence", "uncertainty"],
        properties: {
          // What the user reads, in the response's content_locale.
          name: { type: "string", minLength: 1, maxLength: 90 },
          // A lookup key, not a translation. The food databases behind
          // searchFoods (USDA, Open Food Facts) are indexed in English, so
          // matching needs an English term whatever language the user reads.
          // This is never displayed, which is what keeps it from being the
          // bilingual output this migration removes.
          search_term_en: { type: "string", minLength: 1, maxLength: 90 },
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
  if (provider === 'model_hub') return Boolean(env.MODEL_HUB_API_KEY);
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
    chat: env.COACH_RUNTIME_PAUSED !== 'true' && (Boolean(env.MODEL_HUB_API_KEY) || cloudflare || openai || (compatible && Boolean(env.AI_COMPAT_TEXT_MODEL))),
    planner: cloudflare || openai || compatible,
    vision: cloudflare || openai || compatible,
    providers: { cloudflare, openai, compatible },
  };
}

export async function routesFor(env: WorkerEnv, task: "training_plan" | "meal_vision" | "coach_chat", tier: ProductTier): Promise<AiRoute[]> {
  if (task === 'coach_chat' && env.COACH_RUNTIME_PAUSED === 'true') return [];
  // Hub authorization/timeout failures must not silently fall back to another paid provider.
  if (task === 'coach_chat' && env.MODEL_HUB_API_KEY) return [{ provider: 'model_hub', model: env.MODEL_HUB_COACH_MODEL || 'task-default', priority: 0 }];
  if (env.DB) {
    const rows = await env.DB.prepare(`SELECT provider, model, priority FROM ai_routes
      WHERE task = ? AND tier IN (?, 'free') AND enabled = 1
      ORDER BY CASE WHEN tier = ? THEN 0 ELSE 1 END, priority LIMIT 3`)
      .bind(task, tier, tier).all<{ provider: AiRoute["provider"]; model: string; priority: number }>();
    const configured = (rows.results || []).filter((route) => providerConfigured(env, route.provider));
    if (configured.length) return configured;
  }
  let openAiModel = await settingText(env, "openai_model", env.OPENAI_MODEL || "");
  let openAiVisionModel = "";
  if (env.OPENAI_API_KEY && task !== 'coach_chat' && (!openAiModel || task === 'meal_vision')) {
    try {
      const catalog = await modelCatalogSnapshot(env, "openai");
      const selectable = catalog.models.filter((model) => model.selectable);
      if (!openAiModel) openAiModel = selectable[0]?.id || "";
      openAiVisionModel = selectable.find((model) => model.id === openAiModel && model.modalities?.input?.includes("image"))?.id ||
        selectable.find((model) => model.modalities?.input?.includes("image"))?.id || "";
    } catch { /* Explicit admin or environment configuration remains authoritative. */ }
  }
  const fallback: Record<string, AiRoute[]> = {
    training_plan: [
      { provider: "cloudflare", model: tier === "pro" ? "@cf/meta/llama-3.3-70b-instruct-fp8-fast" : "@cf/meta/llama-3.1-8b-instruct-fast", priority: 1 },
      { provider: "openai", model: openAiModel, priority: 2 },
      { provider: "compatible", model: env.AI_COMPAT_TEXT_MODEL || "qwen3:8b", priority: 3 },
    ],
    meal_vision: [
      { provider: "cloudflare", model: "@cf/meta/llama-3.2-11b-vision-instruct", priority: 1 },
      { provider: "openai", model: openAiVisionModel, priority: 2 },
      { provider: "compatible", model: env.AI_COMPAT_VISION_MODEL || "Qwen3-VL-8B-Instruct", priority: 3 },
    ],
    coach_chat: [
      { provider: "cloudflare", model: tier === "pro" ? "@cf/meta/llama-3.3-70b-instruct-fp8-fast" : "@cf/meta/llama-3.1-8b-instruct-fast", priority: 1 },
      { provider: "openai", model: openAiModel, priority: 2 },
      { provider: "compatible", model: env.AI_COMPAT_TEXT_MODEL || "", priority: 3 },
    ],
  };
  return fallback[task].filter((route) => route.model && providerConfigured(env, route.provider));
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

async function settingText(env: WorkerEnv, key: string, fallback: string): Promise<string> {
  if (!env.DB) return fallback;
  const row = await env.DB.prepare("SELECT value_json FROM site_settings WHERE key = ?").bind(key).first<{ value_json: string }>();
  try {
    const value = JSON.parse(row?.value_json || "");
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
  } catch {
    return fallback;
  }
}

// Two layers: a per-user daily ceiling (one abusive account cannot burn the
// site's budget or deny AI to everyone else) and the global circuit breaker.
export async function assertAiBudget(env: WorkerEnv, userId?: string | null): Promise<void> {
  if (!env.DB) return;
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const [daily, monthly, dailyLimit, monthlyLimit, warningLimit, userLimit] = await Promise.all([
    env.DB.prepare("SELECT COALESCE(SUM(estimated_cost_usd), 0) AS cost FROM generation_runs WHERE created_at >= ?")
      .bind(`${today}T00:00:00.000Z`).first<{ cost: number }>(),
    env.DB.prepare("SELECT COALESCE(SUM(estimated_cost_usd), 0) AS cost FROM generation_runs WHERE created_at >= ?")
      .bind(`${month}-01T00:00:00.000Z`).first<{ cost: number }>(),
    settingNumber(env, "ai_daily_hard_usd", 5),
    settingNumber(env, "ai_monthly_hard_usd", 50),
    settingNumber(env, "ai_daily_warning_usd", 3),
    settingNumber(env, "ai_user_daily_hard_usd", 1),
  ]);
  const dailyCost = Number(daily?.cost || 0);
  if (dailyCost >= warningLimit) {
    // Once per day: surface the warning where operators actually look.
    const marker = await env.DB.prepare("SELECT value_json FROM site_settings WHERE key='ai_budget_warning_last'").first<{ value_json: string }>();
    if (marker?.value_json !== JSON.stringify(today)) {
      console.warn("ai_budget_warning", { dailyCost, warningLimit });
      await env.DB.prepare(`INSERT INTO site_settings (key, value_json, updated_by, updated_at) VALUES ('ai_budget_warning_last', ?, 'system', ?)
        ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at`)
        .bind(JSON.stringify(today), new Date().toISOString()).run();
    }
  }
  if (dailyCost >= dailyLimit || Number(monthly?.cost || 0) >= monthlyLimit) throw new Error("AI_BUDGET_EXHAUSTED");
  if (userId && userLimit > 0) {
    const userDaily = await env.DB.prepare("SELECT COALESCE(SUM(estimated_cost_usd), 0) AS cost FROM generation_runs WHERE user_id = ? AND created_at >= ?")
      .bind(userId, `${today}T00:00:00.000Z`).first<{ cost: number }>();
    if (Number(userDaily?.cost || 0) >= userLimit) throw new Error("AI_USER_BUDGET_EXHAUSTED");
  }
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
  if (route.provider === 'model_hub') throw new Error('MODEL_HUB_REGISTERED_TASK_REQUIRED');
  if (route.provider === "openai") {
    const reasoningEffort = await settingText(env, "openai_reasoning_effort", env.OPENAI_REASONING_EFFORT || "medium");
    const response = await fetchWithRetry(env.OPENAI_BASE_URL || "https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: route.model,
        store: false,
        max_output_tokens: options.maxTokens,
        reasoning: { effort: reasoningEffort },
        ...(options.safetyIdentifier ? { safety_identifier: options.safetyIdentifier.slice(0, 64) } : {}),
        input: [{ role: "system", content: options.system }, { role: "user", content: Array.isArray(options.user)
          ? options.user.map((item) => item.type === "text"
            ? { type: "input_text", text: item.text }
            : item.type === "image_url"
              ? { type: "input_image", image_url: (item.image_url as { url?: string } | undefined)?.url }
              : item)
          : options.user }],
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

function decodedReplyPrefix(raw: string): string {
  const match = /"reply"\s*:\s*"/.exec(raw);
  if (!match) return "";
  let index = match.index + match[0].length; let value = "";
  while (index < raw.length) {
    const character = raw[index];
    if (character === '"') break;
    if (character !== "\\") { value += character; index += 1; continue; }
    if (index + 1 >= raw.length) break;
    const escaped = raw[index + 1];
    const simple: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
    if (escaped === "u") {
      const code = raw.slice(index + 2, index + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(code)) break;
      value += String.fromCharCode(Number.parseInt(code, 16)); index += 6; continue;
    }
    value += simple[escaped] ?? escaped; index += 2;
  }
  return value;
}

async function runProviderStream(env: WorkerEnv, route: AiRoute, options: {
  system: string; user: string; schemaName: string; schema: Record<string, unknown>; maxTokens: number; safetyIdentifier?: string;
}, onReplyDelta: (delta: string) => void): Promise<ProviderResult> {
  if (route.provider === 'model_hub') throw new Error('MODEL_HUB_REGISTERED_TASK_REQUIRED');
  const openai = route.provider === "openai";
  const reasoningEffort = openai ? await settingText(env, "openai_reasoning_effort", env.OPENAI_REASONING_EFFORT || "medium") : "medium";
  const url = openai ? env.OPENAI_BASE_URL || "https://api.openai.com/v1/responses" : route.provider === "cloudflare"
    ? env.CLOUDFLARE_AI_GATEWAY_URL || `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_AI_ACCOUNT_ID}/ai/v1/chat/completions`
    : `${env.AI_COMPAT_BASE_URL!.replace(/\/$/, "")}/chat/completions`;
  const token = openai ? env.OPENAI_API_KEY : route.provider === "cloudflare"
    ? env.CLOUDFLARE_AI_GATEWAY_TOKEN || env.CLOUDFLARE_AI_TOKEN : env.AI_COMPAT_API_KEY;
  const body = openai ? {
    model: route.model, store: false, stream: true, max_output_tokens: options.maxTokens,
    reasoning: { effort: reasoningEffort },
    ...(options.safetyIdentifier ? { safety_identifier: options.safetyIdentifier.slice(0, 64) } : {}),
    input: [{ role: "system", content: options.system }, { role: "user", content: options.user }],
    text: { format: { type: "json_schema", name: options.schemaName, strict: true, schema: options.schema } },
  } : {
    model: route.model, stream: true, stream_options: { include_usage: true },
    messages: [{ role: "system", content: options.system }, { role: "user", content: options.user }],
    max_completion_tokens: options.maxTokens,
    response_format: { type: "json_schema", json_schema: { name: options.schemaName, strict: true, schema: options.schema } },
  };
  const response = await fetchWithRetry(url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as Record<string, any> | null;
    throw new Error(`AI_REQUEST_FAILED:${response.status}:${payload?.error?.message || "unknown"}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream") || !response.body) {
    const payload = await response.json().catch(() => null) as Record<string, any> | null;
    const text = payload ? (openai ? extractOpenAiText(payload) : contentFromChat(payload)) : null;
    if (!text) throw new Error("AI_EMPTY_RESPONSE");
    const reply = decodedReplyPrefix(text); if (reply) onReplyDelta(reply);
    return { text, requestId: payload?.id || response.headers.get("x-request-id"), inputTokens: payload?.usage?.input_tokens ?? payload?.usage?.prompt_tokens ?? null, outputTokens: payload?.usage?.output_tokens ?? payload?.usage?.completion_tokens ?? null };
  }
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let rawText = ""; let emitted = "";
  let requestId: string | null = response.headers.get("x-request-id") || response.headers.get("cf-ray"); let inputTokens: number | null = null; let outputTokens: number | null = null;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    buffer += decoder.decode(value, { stream: true }); const blocks = buffer.split("\n\n"); buffer = blocks.pop() || "";
    for (const block of blocks) {
      const data = block.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
      if (!data || data === "[DONE]") continue;
      let payload: Record<string, any>; try { payload = JSON.parse(data); } catch { continue; }
      requestId = payload.response?.id || payload.id || requestId;
      inputTokens = payload.response?.usage?.input_tokens ?? payload.usage?.input_tokens ?? payload.usage?.prompt_tokens ?? inputTokens;
      outputTokens = payload.response?.usage?.output_tokens ?? payload.usage?.output_tokens ?? payload.usage?.completion_tokens ?? outputTokens;
      const chunk = payload.delta ?? payload.choices?.[0]?.delta?.content ?? payload.result?.response ?? "";
      if (typeof chunk !== "string" || !chunk) continue;
      rawText += chunk;
      const decoded = decodedReplyPrefix(rawText);
      if (decoded.length > emitted.length) { onReplyDelta(decoded.slice(emitted.length)); emitted = decoded; }
    }
  }
  if (!rawText) throw new Error("AI_EMPTY_RESPONSE");
  return { text: rawText, requestId, inputTokens, outputTokens };
}

export function estimatedCost(model: string, inputTokens: number | null, outputTokens: number | null): number {
  const prices: Array<[string, number, number]> = [
    ["llama-3.1-8b", 0.045, 0.335],
    ["llama-3.3-70b", 0.293, 2.253],
    ["llama-3.2-11b", 0.049, 0.676],
  ];
  // Unknown models are billed at a conservative high estimate so they consume
  // budget instead of silently bypassing assertAiBudget with a $0 cost.
  const known = prices.find(([name]) => model.includes(name));
  const price = known || ["unknown", 3, 12];
  const estimate = Number((((inputTokens || 0) * price[1] + (outputTokens || 0) * price[2]) / 1_000_000).toFixed(6));
  // Providers that omit usage would otherwise report $0 for a call that was
  // billed — exactly the blind spot the fallback price exists to prevent. Floor
  // an unmeasured call at a nominal cost so repeated calls still accrue budget.
  if (estimate > 0) return estimate;
  return inputTokens === null && outputTokens === null ? (known ? 0.002 : 0.01) : 0;
}

function parseJson<T>(text: string): T {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error("AI_JSON_INVALID");
  }
}

/**
 * Turns a model's plan into a CoachPlan, rejecting anything the rules engine
 * would not have produced.
 *
 * Exported for tests. These checks are the boundary between "the model
 * suggested" and "the product prescribed" — an unknown exercise ID, a training
 * day the user did not ask for, or equipment they do not have all have to die
 * here, and that is worth asserting directly rather than only through a live
 * provider call.
 */
export function applyAiPlan(profile: Profile, base: CoachPlan, output: AiPlanOutput, locale: Locale): CoachPlan {
  if (!Array.isArray(output.days) || !Array.isArray(output.plan_rationale)) throw new Error("AI_SCHEMA_INVALID");
  const prose = [output.summary, ...(output.plan_rationale || []), ...(output.coach_notes || []), ...(output.diet_guidance || [])].join(" ");
  const languageAudit = auditContentLocale({ requested: locale, claimed: output.content_locale, text: prose, candidates: SHIPPABLE_LOCALES });
  // Language is an acceptance rule, not telemetry. A mismatched plan must not
  // be cached or persisted; generateLlmPlan will try the next configured route.
  if ((languageAudit.claimed && languageAudit.claimed !== locale) || (languageAudit.detected && languageAudit.detected !== locale)) {
    throw new Error("AI_LANGUAGE_MISMATCH");
  }
  const sorted = [...output.days].sort((a, b) => a.day_index - b.day_index);
  if (sorted.length !== 7 || sorted.some((day, index) => day.day_index !== index)) throw new Error("AI_SCHEDULE_INVALID");
  if (sorted.filter((day) => !day.rest_day).length !== profile.days) throw new Error("AI_TRAINING_DAYS_INVALID");
  const expectedTrainingDays = new Set(base.schedule.filter((day) => !day.restDay).map((day) => day.dayIndex));
  if (sorted.some((day) => day.rest_day === expectedTrainingDays.has(day.day_index))) throw new Error("AI_TRAINING_SPACING_INVALID");
  const maximumSessionMinutes = Math.max(20, Math.min(180, Number(profile.sessionMinutes || 90)));
  const prescription = evidencePrescription(profile);
  const schedule: WorkoutDay[] = sorted.map((day, index) => {
    if (day.rest_day) {
      return {
        dayIndex: index, title: { zh: "休息日", en: "Rest day" },
        focus: { zh: "恢复 · 轻活动", en: "Recovery · Light activity" }, duration: Math.max(20, Math.min(90, day.duration_minutes)),
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
        restSeconds: Math.max(30, Math.min(180, Math.round(item.rest_seconds))),
        targetRir: prescription.targetRir,
        progression: {
          zh: `先在目标次数区间内增加次数；连续两次达到上限且仍保留约 ${prescription.targetRir} 次余力时，再小幅加重。`,
          en: `Add reps within the target range first; after two sessions at the top with about ${prescription.targetRir} reps in reserve, increase load slightly.`,
        },
      }];
    });
    if (exercises.length < (profile.equipment === "bodyweight" ? 2 : 3)) throw new Error("AI_EXERCISES_INVALID");
    // Named from the movements the model actually chose, not by the model.
    const described = describeSession(exercises.map((exercise) => exercise.id));
    return {
      dayIndex: index, title: described.title, focus: described.focus,
      duration: Math.max(20, Math.min(maximumSessionMinutes, day.duration_minutes)), exercises,
    };
  });
  const coverage = { push: 0, pull: 0, lower: 0 };
  const weeklySets = { push: 0, pull: 0, lower: 0 };
  for (const day of schedule.filter((item) => !item.restDay)) {
    const patterns = new Set(day.exercises.map((exercise) => exercisePattern(exercise.id)));
    if ([...patterns].some((pattern) => pattern === "push_h" || pattern === "push_v")) coverage.push += 1;
    if ([...patterns].some((pattern) => pattern === "pull_h" || pattern === "pull_v")) coverage.pull += 1;
    if ([...patterns].some((pattern) => pattern === "squat" || pattern === "hinge" || pattern === "lunge" || pattern === "iso_legs")) coverage.lower += 1;
    for (const exercise of day.exercises) {
      const pattern = exercisePattern(exercise.id);
      if (pattern === "push_h" || pattern === "push_v") weeklySets.push += exercise.sets;
      if (pattern === "pull_h" || pattern === "pull_v") weeklySets.pull += exercise.sets;
      if (pattern === "squat" || pattern === "hinge" || pattern === "lunge" || pattern === "iso_legs") weeklySets.lower += exercise.sets;
    }
  }
  if (coverage.push < 1 || coverage.pull < 1 || coverage.lower < 1) throw new Error("AI_MOVEMENT_COVERAGE_INVALID");
  const minimumSets = Math.min(6, prescription.weeklySetsPerMajorMuscle.min);
  const maximumSets = prescription.weeklySetsPerMajorMuscle.max + 4;
  if (Object.values(weeklySets).some((sets) => sets < minimumSets || sets > maximumSets)) throw new Error("AI_WEEKLY_DOSE_INVALID");
  const staged = decoratePlanSchedule(profile, schedule);
  return {
    ...base,
    schedule: staged.schedule,
    phase: staged.phase,
    prescription,
    insights: {
      // The measured language of what the model wrote, not the language it was
      // asked for — those differ exactly when something went wrong.
      contentLocale: locale,
      summary: output.summary,
      planRationale: output.plan_rationale.slice(0, 3),
      coachNotes: (output.coach_notes || []).slice(0, 3),
      dietGuidance: (output.diet_guidance || []).slice(0, 3),
      // Reviewed copy, so it stays multilingual and follows the reader.
      stopConditions: {
        zh: ["疼痛达到 4/10 或持续加重时停止相关动作。", "出现胸痛、晕厥、呼吸困难或无法承重时停止训练并及时求助。"],
        en: ["Stop the movement if pain reaches 4/10 or keeps worsening.", "Stop training and seek timely help for chest pain, fainting, breathing difficulty, or inability to bear weight."],
      },
    },
  };
}

async function planningHistory(env: WorkerEnv, userId?: string): Promise<Record<string, unknown> | null> {
  if (!env.DB || !userId) return null;
  const since = new Date(Date.now() - 28 * 86_400_000).toISOString();
  const [sessions, sets, measurement, review, memories] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS completed,AVG(rpe) AS average_rpe,MAX(pain) AS max_pain
      FROM workout_occurrence_sessions WHERE user_id=? AND status='completed' AND updated_at>=?`).bind(userId, since).first<Record<string, unknown>>(),
    env.DB.prepare(`SELECT exercise_id,COUNT(*) AS completed_sets,AVG(rir) AS average_rir,MAX(weight_kg) AS top_weight
      FROM workout_occurrence_sets WHERE user_id=? AND completed=1 AND updated_at>=?
      GROUP BY exercise_id ORDER BY completed_sets DESC LIMIT 20`).bind(userId, since).all<Record<string, unknown>>(),
    env.DB.prepare("SELECT weight_kg,measured_at FROM measurements WHERE user_id=? ORDER BY measured_at DESC LIMIT 1").bind(userId).first<Record<string, unknown>>(),
    env.DB.prepare("SELECT metrics_json,recommendation_json FROM weekly_reviews WHERE user_id=? AND status IN ('generated','accepted') ORDER BY week_start DESC LIMIT 1").bind(userId).first<Record<string, unknown>>(),
    env.DB.prepare("SELECT memory_key,value FROM coach_memories WHERE user_id=? AND status='active' ORDER BY updated_at DESC LIMIT 10").bind(userId).all<Record<string, unknown>>(),
  ]);
  const parse = (value: unknown) => { try { return typeof value === "string" ? JSON.parse(value) : null; } catch { return null; } };
  return {
    window_days: 28,
    completed_sessions: Number(sessions?.completed || 0),
    average_rpe: sessions?.average_rpe == null ? null : Number(Number(sessions.average_rpe).toFixed(1)),
    max_pain: Number(sessions?.max_pain || 0),
    exercise_history: sets.results || [],
    latest_measurement: measurement || null,
    latest_review: review ? { metrics: parse(review.metrics_json), recommendation: parse(review.recommendation_json) } : null,
    user_declared_preferences: memories.results || [],
  };
}

export async function generateLlmPlan(env: WorkerEnv, profile: Profile, safetyIdentifier?: string, tier: ProductTier = "free", locale: Locale = DEFAULT_LOCALE): Promise<PlanGenerationResult> {
  await assertAiBudget(env, safetyIdentifier);
  const routes = (await routesFor(env, "training_plan", tier)).slice(0, 2);
  if (!routes.length) throw new Error("AI_NOT_CONFIGURED");
  const base = generatePlan(profile);
  const allowed = Object.values(EXERCISES).filter((exercise) => isExerciseAllowed(exercise, profile.equipment));
  const trainingDays = base.schedule.filter((day) => !day.restDay).map((day) => day.dayIndex);
  const system = systemPrompt("training_plan", locale);
  const input = JSON.stringify({
    profile,
    fixed_metrics: {
      bmr: base.bmr, tdee: base.tdee, calories: base.calories, calorie_delta: base.calorieDelta,
      protein: base.protein, carbs: base.carbs, fat: base.fat, weeks: base.weeks,
    },
    evidence_prescription: base.prescription,
    observed_history: await planningHistory(env, safetyIdentifier),
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
        plan: applyAiPlan(profile, base, output, locale),
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

export async function generateMealVision(env: WorkerEnv, imageDataUrl: string, tier: ProductTier, userId?: string | null, locale: Locale = DEFAULT_LOCALE): Promise<MealVisionResult> {
  await assertAiBudget(env, userId);
  const routes = (await routesFor(env, "meal_vision", tier)).slice(0, 2);
  if (!routes.length) throw new Error("AI_NOT_CONFIGURED");
  const system = systemPrompt("meal_vision", locale);
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
        content_locale?: string;
        foods: Array<{
          name: string; search_term_en: string; preparation: string;
          estimated_min_g: number; estimated_max_g: number; confidence: number; uncertainty: string;
        }>;
      }>(result.text);
      if (!Array.isArray(output.foods) || !output.foods.length) throw new Error("AI_SCHEMA_INVALID");
      const candidates = output.foods.slice(0, 8).map((food) => ({
        name: String(food.name).slice(0, 90),
        searchTermEn: String(food.search_term_en || food.name).slice(0, 90),
        preparation: String(food.preparation || "").slice(0, 100),
        estimatedMinG: Math.max(1, Math.min(3000, Number(food.estimated_min_g))),
        estimatedMaxG: Math.max(1, Math.min(3000, Number(food.estimated_max_g))),
        confidence: Math.max(0, Math.min(1, Number(food.confidence))),
        uncertainty: String(food.uncertainty || "").slice(0, 180),
      }));
      const average = candidates.reduce((sum, item) => sum + item.confidence, 0) / candidates.length;
      if (average < 0.45 && route !== routes[routes.length - 1]) continue;
      // Detection runs on the display names joined together — individually they
      // are too short to measure, together they are the whole user-facing text.
      const audit = auditContentLocale({ requested: locale, claimed: output.content_locale, text: candidates.map((food) => food.name).join(" "), candidates: SHIPPABLE_LOCALES });
      return {
        candidates,
        contentLocale: audit.detected ?? audit.claimed ?? locale,
        localeClaimMismatch: Boolean(audit.detected && audit.claimed && audit.detected !== audit.claimed),
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

export async function generateCoachChat(env: WorkerEnv, input: {
  message: string;
  locale: Locale;
  context: Record<string, unknown>;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  safetyIdentifier: string;
  knowledge?: Array<{ id: string; title: string; summary: string; publisher: string; url: string }>;
  onDelta?: (delta: string) => void;
}, tier: ProductTier): Promise<CoachChatResult> {
  await assertAiBudget(env, input.safetyIdentifier);
  const routes = (await routesFor(env, "coach_chat", tier)).slice(0, 2);
  if (!routes.length) throw new Error("AI_NOT_CONFIGURED");
  const schema = {
    type: "object", additionalProperties: false, required: ["reply", "content_locale", "intent", "safety_flag", "basis", "limitations", "source_ids", "actions"],
    properties: {
      reply: { type: "string", minLength: 2, maxLength: 1800 },
      // The language the model believes it wrote in. Treated as a claim to be
      // cross-checked against the script actually measured in `reply`, never as
      // the answer: a model that ignored the output directive echoes the locale
      // it was told to use just as readily.
      content_locale: { type: "string", enum: [...SHIPPABLE_LOCALES] },
      intent: { type: "string", enum: ["explain_plan", "adjust_today", "exercise_help", "nutrition", "progress", "general_knowledge", "safety"] },
      // Second safety layer: the keyword screen upstream only catches literal
      // phrasings ("疼痛 7"), so the model must classify paraphrases too
      // ("my knee is a 7 out of 10"). The server, not the model, decides what
      // happens when this fires.
      safety_flag: {
        type: "object", additionalProperties: false, required: ["high_risk", "category", "detail"],
        properties: {
          high_risk: { type: "boolean" },
          category: { type: "string", enum: ["none", "pain", "cardio_symptom", "injury", "eating_disorder", "other_medical"] },
          detail: { type: "string", maxLength: 160 },
        },
      },
      basis: { type: "array", maxItems: 5, items: { type: "object", additionalProperties: false, required: ["label", "value", "observed_at", "source"], properties: {
        label: { type: "string", maxLength: 50 }, value: { type: "string", maxLength: 100 }, observed_at: { type: ["string", "null"], maxLength: 40 }, source: { type: ["string", "null"], maxLength: 60 },
      } } },
      limitations: { type: "array", maxItems: 3, items: { type: "string", maxLength: 160 } },
      source_ids: { type: "array", maxItems: 3, items: { type: "string", maxLength: 80 } },
      actions: { type: "array", maxItems: 3, items: {
        type: "object", additionalProperties: false, required: ["type", "title", "description", "before", "after", "reason", "impact", "reversible", "exercise_id", "replacement_exercise_id", "duration_minutes", "target_date", "load_multiplier", "set_multiplier"],
        properties: {
          type: { type: "string", enum: ["replace_exercise", "shorten_session", "adjust_load", "reschedule_workout", "plan_adjustment", "log_workout", "log_measurement", "create_meal_draft", "schedule_review"] },
          title: { type: "string", minLength: 2, maxLength: 80 },
          description: { type: "string", minLength: 2, maxLength: 240 },
          before: { type: "string", maxLength: 160 }, after: { type: "string", maxLength: 160 }, reason: { type: "string", maxLength: 200 },
          impact: { type: "array", maxItems: 4, items: { type: "string", maxLength: 100 } }, reversible: { type: "boolean" },
          exercise_id: { type: ["string", "null"], maxLength: 80 }, replacement_exercise_id: { type: ["string", "null"], maxLength: 80 },
          duration_minutes: { type: ["integer", "null"], minimum: 10, maximum: 180 }, target_date: { type: ["string", "null"], maxLength: 10 },
          load_multiplier: { type: ["number", "null"], minimum: 0.8, maximum: 1.05 }, set_multiplier: { type: ["number", "null"], minimum: 0.8, maximum: 1.1 },
        },
      } },
    },
  };
  const system = systemPrompt("coach_chat", input.locale);
  const user = JSON.stringify({ message: input.message, context: input.context, recent_messages: input.history.slice(-12), reviewed_knowledge: input.knowledge || [] });
  let lastError: unknown = null;
  for (const route of routes) {
    try {
      // The streamed path emits tokens as they arrive rather than holding the
      // first N back to sniff the language. Buffering would only pay off if a
      // wrong-language reply were suppressed, and language handling is
      // report-only until the drift rate is known — so it would be real
      // time-to-first-token cost for a policy that does not act. The language
      // is measured on the completed reply either way, which is what the
      // telemetry needs.
      const result = input.onDelta
        ? await runProviderStream(env, route, { system, user, schemaName: "cmine_fit_coach", schema, maxTokens: 2600, safetyIdentifier: input.safetyIdentifier }, input.onDelta)
        : await runProvider(env, route, { system, user, schemaName: "cmine_fit_coach", schema, maxTokens: 2600, safetyIdentifier: input.safetyIdentifier });
      const output = parseJson<{ reply: string; content_locale?: string; intent: string; safety_flag?: { high_risk?: boolean; category?: string; detail?: string }; basis: Array<{ label: string; value: string; observed_at?: string | null; source?: string | null }>; limitations: string[]; source_ids: string[]; actions: CoachChatResult["actions"] }>(result.text);
      if (typeof output.reply !== "string" || !Array.isArray(output.actions) || !Array.isArray(output.basis) || !Array.isArray(output.limitations)) throw new Error("AI_SCHEMA_INVALID");
      const allowedSources = new Set((input.knowledge || []).map((item) => item.id));
      const highRisk = output.safety_flag?.high_risk === true;
      // Evidence first, claim second. Detection wins whenever it succeeds; the
      // model's echo is only consulted for text too short to measure, and the
      // two disagreeing is itself worth recording.
      const audit = auditContentLocale({ requested: input.locale, claimed: output.content_locale, text: output.reply, candidates: SHIPPABLE_LOCALES });
      return {
        reply: output.reply.slice(0, 1800), intent: output.intent,
        contentLocale: audit.detected ?? audit.claimed ?? input.locale,
        localeClaimMismatch: Boolean(audit.detected && audit.claimed && audit.detected !== audit.claimed),
        safety: { highRisk, category: highRisk ? String(output.safety_flag?.category || "other_medical") : "none", detail: String(output.safety_flag?.detail || "").slice(0, 160) },
        basis: output.basis.slice(0, 5).map((item) => ({ label: item.label, value: item.value, observedAt: item.observed_at || undefined, source: item.source || undefined })),
        // A model-detected risk must not be able to smuggle an intensity change through.
        limitations: output.limitations.slice(0, 3), sourceIds: (output.source_ids || []).filter((id) => allowedSources.has(id)).slice(0, 3),
        actions: actionsAllowedUnderRisk(output.actions, highRisk).slice(0, 3),
        provider: route.provider, model: route.model,
        requestId: result.requestId, estimatedCostUsd: estimatedCost(route.model, result.inputTokens, result.outputTokens),
        usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
      };
    } catch (error) { lastError = error; }
  }
  throw lastError instanceof Error ? lastError : new Error("AI_GENERATION_FAILED");
}

export async function generateConversationSummary(env: WorkerEnv, input: {
  locale: Locale; previousSummary?: string | null; messages: Array<{ role: "user" | "assistant"; content: string }>; safetyIdentifier: string;
}, tier: ProductTier): Promise<ConversationSummaryResult> {
  await assertAiBudget(env, input.safetyIdentifier);
  const routes = (await routesFor(env, "coach_chat", tier)).slice(0, 2);
  if (!routes.length) throw new Error("AI_NOT_CONFIGURED");
  const schema = { type: "object", additionalProperties: false, required: ["summary"], properties: {
    summary: { type: "string", minLength: 20, maxLength: 1800 },
  } };
  const system = [
    "Summarize a fitness coaching conversation for continuity in future turns.",
    "Preserve the user's goals, constraints, preferences, completed decisions, unresolved questions and safety-relevant facts.",
    "Do not add advice, diagnoses, facts or actions. Do not include private reasoning. Distinguish user-reported facts from coach suggestions.",
    outputDirective(input.locale),
  ].join("\n\n");
  const user = JSON.stringify({ previous_summary: input.previousSummary || null, messages: input.messages.slice(-18) });
  let lastError: unknown = null;
  for (const route of routes) {
    try {
      const result = await runProvider(env, route, { system, user, schemaName: "cmine_fit_conversation_summary", schema, maxTokens: 900, safetyIdentifier: input.safetyIdentifier });
      const output = parseJson<{ summary?: string }>(result.text);
      if (!output?.summary || output.summary.trim().length < 20) throw new Error("AI_SCHEMA_INVALID");
      return { summary: output.summary.trim().slice(0, 1800), provider: route.provider, model: route.model, requestId: result.requestId,
        estimatedCostUsd: estimatedCost(route.model, result.inputTokens, result.outputTokens), usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens } };
    } catch (error) { lastError = error; }
  }
  throw lastError instanceof Error ? lastError : new Error("AI_GENERATION_FAILED");
}
