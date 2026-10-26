// AI generation telemetry. Lives in its own module rather than db.ts because
// nutrition.ts needs it and db.ts already imports nutrition.ts — importing it
// from db.ts would create a runtime import cycle.
//
// generation_runs is the table assertAiBudget sums, so anything written here
// directly affects the spend guards. Two rules follow from that:
//  - every billed provider call must land here, whatever the outcome;
//  - conditions that never reached a provider (budget refused, no route
//    configured) must NOT be written as failed generations — they cost nothing
//    and would otherwise show up as AI failures in the admin success rate.
import type { WorkerEnv } from "./platform";
import { auditContentLocale } from "../packages/domain/src";
import { SHIPPABLE_LOCALES, type Locale } from "../packages/i18n/src";
import { PROMPT_VERSION } from "./prompts";

export type GenerationRun = {
  userId: string | null;
  status: "succeeded" | "failed";
  model: string;
  latencyMs: number;
  requestId?: string | null;
  errorCode?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  reasoningTokens?: number | null;
  task?: string;
  provider?: string;
  estimatedCostUsd?: number;
  cacheHit?: boolean;
  /** Locale this call asked for. */
  locale?: Locale | null;
  /** Locale detected in the output; null when detection refused. */
  contentLocale?: Locale | null;
  /** Defaults to the running build's PROMPT_VERSION. */
  promptVersion?: string | null;
};

/**
 * Measures what language a generation came back in, so the run can record it.
 *
 * Report-only: nothing here rejects or retries a generation. The point is to
 * find out how often models drift and on which routes before spending money
 * reacting to it. A refusal to detect (short text, scripts it cannot separate)
 * returns null, which reads as "unknown" — never as a mismatch.
 */
export function observedLocale(requested: Locale, text: string): Locale | null {
  return auditContentLocale({ requested, text, candidates: SHIPPABLE_LOCALES }).detected;
}

// Error codes raised before any provider was contacted: no spend, no failure.
const PRE_FLIGHT_CODES = new Set(["AI_BUDGET_EXHAUSTED", "AI_USER_BUDGET_EXHAUSTED", "AI_NOT_CONFIGURED"]);

export function isPreFlightFailure(errorCode: string | null | undefined): boolean {
  return Boolean(errorCode && PRE_FLIGHT_CODES.has(errorCode.split(":")[0]));
}

export async function recordGenerationRun(env: WorkerEnv, input: GenerationRun): Promise<void> {
  if (!env.DB) return;
  await env.DB.prepare(`INSERT INTO generation_runs
    (id, user_id, status, model, latency_ms, request_id, error_code, input_tokens, output_tokens, reasoning_tokens,
      task, provider, estimated_cost_usd, cache_hit, locale, content_locale, prompt_version, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), input.userId, input.status, input.model, input.latencyMs, input.requestId || null,
      input.errorCode || null, input.inputTokens ?? null, input.outputTokens ?? null, input.reasoningTokens ?? null,
      input.task || "training_plan", input.provider || "unknown", input.estimatedCostUsd || 0, input.cacheHit ? 1 : 0,
      input.locale ?? null, input.contentLocale ?? null, input.promptVersion ?? PROMPT_VERSION,
      new Date().toISOString()).run();
}
