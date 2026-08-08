// D1-backed fixed-window rate limiting. Monthly quotas (consumeCapability) are
// billing control; this is abuse control — the two are deliberately separate.
// Fails open when the database is unavailable: an outage must degrade to
// "no throttle", never to "site down".
import type { WorkerEnv } from "../platform";

export type RateRule = { limit: number; windowSeconds: number };

export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") || "unknown";
}

async function bumpCounter(env: WorkerEnv, key: string, windowSeconds: number): Promise<number | null> {
  if (!env.DB) return null;
  const window = Math.floor(Date.now() / 1000 / windowSeconds);
  const windowKey = `${key}:${window}`;
  try {
    const row = await env.DB.prepare(`INSERT INTO rate_limits (key, window_start, count)
      VALUES (?, ?, 1)
      ON CONFLICT(key) DO UPDATE SET count = count + 1
      RETURNING count`).bind(windowKey, window * windowSeconds, ).first<{ count: number }>();
    return Number(row?.count || 1);
  } catch {
    return null; // table not migrated yet or transient failure — fail open
  }
}

// Returns a 429 Response when the caller is over the limit, otherwise null.
export async function enforceRateLimit(env: WorkerEnv, request: Request, name: string, rule: RateRule, userId?: string | null): Promise<Response | null> {
  const subject = userId ? `u:${userId}` : `ip:${clientIp(request)}`;
  const count = await bumpCounter(env, `${name}:${subject}`, rule.windowSeconds);
  if (count === null || count <= rule.limit) return null;
  return new Response(JSON.stringify({ error: "RATE_LIMITED", message: "请求过于频繁，请稍后再试。" }), {
    status: 429,
    headers: { "content-type": "application/json", "retry-after": String(rule.windowSeconds) },
  });
}

// Per-endpoint policy lives in one reviewable table, not scattered literals.
export const RATE_RULES = {
  authStart: { limit: 10, windowSeconds: 300 },
  planGenerate: { limit: 6, windowSeconds: 600 },
  coachChat: { limit: 20, windowSeconds: 600 },
  mealUpload: { limit: 10, windowSeconds: 600 },
  foodSearch: { limit: 30, windowSeconds: 300 },
  exerciseSearch: { limit: 60, windowSeconds: 300 },
  exportData: { limit: 3, windowSeconds: 86_400 },
  consentWrite: { limit: 10, windowSeconds: 3_600 },
  webhook: { limit: 120, windowSeconds: 300 },
} as const satisfies Record<string, RateRule>;

export async function cleanupRateLimits(env: WorkerEnv): Promise<number> {
  if (!env.DB) return 0;
  const cutoff = Math.floor(Date.now() / 1000) - 2 * 86_400;
  try {
    const result = await env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(cutoff).run();
    return Number(result.meta?.changes || 0);
  } catch {
    return 0;
  }
}
