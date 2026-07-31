import type { WorkerEnv } from "./platform";

export type Capability = "plan.generate" | "meal.scan" | "coach.chat" | "adaptive.review" | "data.export";
export type ProductTier = "free" | "pro";

const proCapabilities: Capability[] = ["plan.generate", "meal.scan", "coach.chat", "adaptive.review", "data.export"];
const freeCapabilities: Capability[] = ["plan.generate", "meal.scan", "data.export"];

function periodKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function numericSetting(env: WorkerEnv, key: string, fallback: number): Promise<number> {
  if (!env.DB) return fallback;
  const row = await env.DB.prepare("SELECT value_json FROM site_settings WHERE key = ?").bind(key).first<{ value_json: string }>();
  if (!row) return fallback;
  try {
    const value = Number(JSON.parse(row.value_json));
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

export async function tierForUser(env: WorkerEnv, userId: string): Promise<ProductTier> {
  if (!env.DB) return "free";
  const row = await env.DB.prepare(`SELECT status, current_period_end FROM subscriptions
    WHERE user_id = ? AND status IN ('active', 'trialing') ORDER BY updated_at DESC LIMIT 1`)
    .bind(userId).first<{ status: string; current_period_end: string | null }>();
  if (!row) return "free";
  if (row.current_period_end && new Date(row.current_period_end).getTime() < Date.now()) return "free";
  return "pro";
}

export async function limitForCapability(env: WorkerEnv, tier: ProductTier, capability: Capability): Promise<number> {
  const defaults: Record<ProductTier, Partial<Record<Capability, [string, number]>>> = {
    free: {
      "plan.generate": ["free_plan_limit", 2],
      "meal.scan": ["free_meal_scan_limit", 5],
      "data.export": ["free_export_limit", 10],
    },
    pro: {
      "plan.generate": ["pro_plan_limit", 30],
      "meal.scan": ["pro_meal_scan_limit", 100],
      "coach.chat": ["pro_coach_message_limit", 200],
      "adaptive.review": ["pro_adaptive_review_limit", 4],
      "data.export": ["pro_export_limit", 100],
    },
  };
  const setting = defaults[tier][capability];
  if (!setting) return 0;
  return numericSetting(env, setting[0], setting[1]);
}

export async function membershipForUser(env: WorkerEnv, userId: string) {
  const tier = await tierForUser(env, userId);
  const subscription = env.DB ? await env.DB.prepare(`SELECT status, price_id, current_period_end, cancel_at_period_end, provider
    FROM subscriptions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1`)
    .bind(userId).first<{ status: string; price_id: string | null; current_period_end: string | null; cancel_at_period_end: number; provider: string }>() : null;
  return {
    tier,
    name: tier === "pro" ? "Cmine Fit Pro" : "Cmine Fit 免费版",
    status: subscription?.status || "active",
    currentPeriodEnd: subscription?.current_period_end || null,
    cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
    provider: subscription?.provider || null,
  };
}

export async function usageForUser(env: WorkerEnv, userId: string) {
  const tier = await tierForUser(env, userId);
  const key = periodKey();
  const capabilities = tier === "pro" ? proCapabilities : freeCapabilities;
  const result: Record<string, { used: number; bonus: number; limit: number; remaining: number }> = {};
  for (const capability of capabilities) {
    const limit = await limitForCapability(env, tier, capability);
    const row = env.DB ? await env.DB.prepare(`SELECT used, bonus FROM feature_usage
      WHERE user_id = ? AND capability = ? AND period_key = ?`).bind(userId, capability, key)
      .first<{ used: number; bonus: number }>() : null;
    const used = Number(row?.used || 0);
    const bonus = Number(row?.bonus || 0);
    result[capability] = { used, bonus, limit, remaining: Math.max(0, limit + bonus - used) };
  }
  return { period: key, tier, capabilities: result };
}

export async function consumeCapability(env: WorkerEnv, userId: string, capability: Capability): Promise<{
  ok: boolean;
  tier: ProductTier;
  limit: number;
  used: number;
  remaining: number;
}> {
  if (!env.DB) return { ok: false, tier: "free", limit: 0, used: 0, remaining: 0 };
  const tier = await tierForUser(env, userId);
  const allowed = tier === "pro" ? proCapabilities.includes(capability) : freeCapabilities.includes(capability);
  const limit = allowed ? await limitForCapability(env, tier, capability) : 0;
  const key = periodKey();
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT OR IGNORE INTO feature_usage
    (id, user_id, capability, period_key, used, bonus, updated_at) VALUES (?, ?, ?, ?, 0, 0, ?)`)
    .bind(crypto.randomUUID(), userId, capability, key, now).run();
  const before = await env.DB.prepare("SELECT used, bonus FROM feature_usage WHERE user_id = ? AND capability = ? AND period_key = ?")
    .bind(userId, capability, key).first<{ used: number; bonus: number }>();
  const used = Number(before?.used || 0);
  const bonus = Number(before?.bonus || 0);
  if (!allowed || used >= limit + bonus) return { ok: false, tier, limit: limit + bonus, used, remaining: 0 };
  await env.DB.prepare(`UPDATE feature_usage SET used = used + 1, updated_at = ?
    WHERE user_id = ? AND capability = ? AND period_key = ? AND used < ?`)
    .bind(now, userId, capability, key, limit + bonus).run();
  const after = await env.DB.prepare("SELECT used, bonus FROM feature_usage WHERE user_id = ? AND capability = ? AND period_key = ?")
    .bind(userId, capability, key).first<{ used: number; bonus: number }>();
  const afterUsed = Number(after?.used || used);
  return { ok: afterUsed > used, tier, limit: limit + Number(after?.bonus || 0), used: afterUsed, remaining: Math.max(0, limit + Number(after?.bonus || 0) - afterUsed) };
}

export async function refundCapability(env: WorkerEnv, userId: string, capability: Capability): Promise<void> {
  if (!env.DB) return;
  await env.DB.prepare(`UPDATE feature_usage SET used = MAX(0, used - 1), updated_at = ?
    WHERE user_id = ? AND capability = ? AND period_key = ?`)
    .bind(new Date().toISOString(), userId, capability, periodKey()).run();
}

export async function entitlementSnapshot(env: WorkerEnv, userId: string) {
  const membership = await membershipForUser(env, userId);
  const usage = await usageForUser(env, userId);
  const capabilities = membership.tier === "pro" ? proCapabilities : freeCapabilities;
  return { membership, capabilities, usage };
}

export async function redeemPoints(env: WorkerEnv, userId: string, reward: "meal_scan" | "plan_refresh") {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const config = reward === "meal_scan"
    ? { points: 50, capability: "meal.scan" as Capability }
    : { points: 100, capability: "plan.generate" as Capability };
  const balanceRow = await env.DB.prepare("SELECT COALESCE(SUM(delta), 0) AS balance FROM point_ledger WHERE user_id = ?")
    .bind(userId).first<{ balance: number }>();
  const balance = Number(balanceRow?.balance || 0);
  if (balance < config.points) throw new Error("INSUFFICIENT_POINTS");
  const now = new Date().toISOString();
  const redemptionId = crypto.randomUUID();
  const key = periodKey();
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO feature_usage
      (id, user_id, capability, period_key, used, bonus, updated_at) VALUES (?, ?, ?, ?, 0, 0, ?)`)
      .bind(crypto.randomUUID(), userId, config.capability, key, now),
    env.DB.prepare(`INSERT INTO point_redemptions
      (id, user_id, reward, points_spent, usage_capability, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(redemptionId, userId, reward, config.points, config.capability, now),
    env.DB.prepare(`INSERT INTO point_ledger
      (id, user_id, delta, reason, external_ref, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), userId, -config.points, `redeem_${reward}`, `redemption:${redemptionId}`, now),
    env.DB.prepare(`UPDATE feature_usage SET bonus = bonus + 1, updated_at = ?
      WHERE user_id = ? AND capability = ? AND period_key = ?`)
      .bind(now, userId, config.capability, key),
  ]);
  return { reward, pointsSpent: config.points, balance: balance - config.points };
}

