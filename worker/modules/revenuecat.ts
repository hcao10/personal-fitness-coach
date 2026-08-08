/* eslint-disable @typescript-eslint/no-explicit-any */
import type { WorkerEnv } from "../platform";
import { safeEqual } from "../security";

const proCapabilities = ["plan.generate", "meal.scan", "coach.chat", "adaptive.review", "data.export"];

// Entitlement grants require BOTH the webhook auth header and a REST API key:
// RevenueCat webhooks are not signed, so the event body is never trusted for
// grants — the subscriber state is re-fetched from the RevenueCat API instead.
export function revenueCatConfigured(env: WorkerEnv) {
  return Boolean(env.REVENUECAT_WEBHOOK_SECRET && env.REVENUECAT_API_KEY);
}

export function verifyRevenueCatWebhook(env: WorkerEnv, request: Request) {
  if (!env.REVENUECAT_WEBHOOK_SECRET) throw new Error("REVENUECAT_NOT_CONFIGURED");
  const authorization = request.headers.get("authorization") || "";
  const expected = `Bearer ${env.REVENUECAT_WEBHOOK_SECRET}`;
  if (!safeEqual(authorization, expected)) throw new Error("REVENUECAT_SIGNATURE_INVALID");
}

type VerifiedSubscriber = { active: boolean; expiresAt: string | null; productId: string };

async function fetchVerifiedSubscriber(env: WorkerEnv, appUserId: string): Promise<VerifiedSubscriber> {
  if (!env.REVENUECAT_API_KEY) throw new Error("REVENUECAT_API_KEY_REQUIRED");
  const base = env.REVENUECAT_API_BASE || "https://api.revenuecat.com/v1";
  const response = await fetch(`${base}/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { authorization: `Bearer ${env.REVENUECAT_API_KEY}`, accept: "application/json" },
  });
  if (!response.ok) throw new Error(`REVENUECAT_VERIFY_FAILED:${response.status}`);
  const body = await response.json() as { subscriber?: { entitlements?: Record<string, { expires_date?: string | null; product_identifier?: string }> } };
  const entitlements = Object.values(body.subscriber?.entitlements || {});
  let active = false; let expiresAt: string | null = null; let productId = "";
  for (const entitlement of entitlements) {
    const expiry = entitlement.expires_date ? new Date(entitlement.expires_date) : null;
    if (!expiry || expiry.getTime() > Date.now()) {
      active = true;
      productId = entitlement.product_identifier || productId;
      if (!expiry) expiresAt = null;
      else if (!expiresAt || expiry.getTime() > new Date(expiresAt).getTime()) expiresAt = expiry.toISOString();
    }
  }
  return { active, expiresAt, productId };
}

export async function processRevenueCatEvent(env: WorkerEnv, payload: Record<string, any>) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const event = payload.event as Record<string, any> | undefined;
  if (!event) throw new Error("REVENUECAT_EVENT_INVALID");
  const eventId = String(event?.id || ""); const type = String(event?.type || "");
  const userId = String(event?.app_user_id || "");
  if (!eventId || !type || !userId) throw new Error("REVENUECAT_EVENT_INVALID");
  const duplicate = await env.DB.prepare("SELECT event_id FROM billing_events WHERE event_id=?").bind(eventId).first();
  if (duplicate) return { duplicate: true };
  const now = new Date().toISOString(); const eventTime = Math.floor(Number(event.event_timestamp_ms || Date.now()) / 1000);
  const externalId = String(event.original_transaction_id || event.transaction_id || `${userId}:${event.product_id || "pro"}`);
  await env.DB.prepare(`INSERT INTO billing_events
    (event_id,provider,event_type,object_id,amount_total,currency,status,received_at)
    VALUES (?,'revenuecat',?,?,?,?, 'processing',?)`)
    .bind(eventId, type, externalId, Math.round(Number(event.price_in_purchased_currency || event.price || 0) * 100) || null,
      String(event.currency || "USD").toUpperCase(), now).run();
  try {
    // TEST events and sandbox purchases never grant production entitlements.
    const sandbox = String(event.environment || "").toUpperCase() === "SANDBOX" && env.REVENUECAT_ALLOW_SANDBOX !== "true";
    if (type === "TEST" || sandbox) {
      await env.DB.prepare("UPDATE billing_events SET status='processed',processed_at=? WHERE event_id=?").bind(now, eventId).run();
      return { duplicate: false, userId, ignored: type === "TEST" ? "test_event" : "sandbox_event" };
    }
    const user = await env.DB.prepare("SELECT id FROM users WHERE id=?").bind(userId).first<{ id: string }>();
    if (!user) throw new Error("REVENUECAT_USER_NOT_FOUND");
    // The webhook only signals "something changed" — the authoritative
    // subscription state comes from the RevenueCat REST API.
    const verified = await fetchVerifiedSubscriber(env, userId);
    const status = verified.active ? "active" : type === "BILLING_ISSUE" ? "in_grace_period" : "expired";
    const cancelAtPeriodEnd = type === "CANCELLATION";
    await env.DB.prepare(`INSERT INTO subscriptions
      (id,user_id,provider,external_subscription_id,plan,status,price_id,current_period_end,cancel_at_period_end,last_event_created,created_at,updated_at)
      VALUES (?,?,'revenuecat',?,'pro',?,?,?,?,?,?,?)
      ON CONFLICT(external_subscription_id) DO UPDATE SET
        status=CASE WHEN excluded.last_event_created>=subscriptions.last_event_created THEN excluded.status ELSE subscriptions.status END,
        price_id=CASE WHEN excluded.last_event_created>=subscriptions.last_event_created THEN excluded.price_id ELSE subscriptions.price_id END,
        current_period_end=CASE WHEN excluded.last_event_created>=subscriptions.last_event_created THEN excluded.current_period_end ELSE subscriptions.current_period_end END,
        cancel_at_period_end=CASE WHEN excluded.last_event_created>=subscriptions.last_event_created THEN excluded.cancel_at_period_end ELSE subscriptions.cancel_at_period_end END,
        last_event_created=MAX(subscriptions.last_event_created,excluded.last_event_created),updated_at=excluded.updated_at`)
      .bind(`rc:${externalId}`, userId, externalId, status, verified.productId || String(event.product_id || ""), verified.expiresAt, cancelAtPeriodEnd ? 1 : 0, eventTime, now, now).run();
    await env.DB.prepare("DELETE FROM entitlements WHERE user_id=? AND source='revenuecat'").bind(userId).run();
    if (verified.active) await env.DB.batch(proCapabilities.map((capability) => env.DB!.prepare(`INSERT INTO entitlements
      (id,user_id,capability,source,status,expires_at,updated_at) VALUES (?,?,?,'revenuecat','active',?,?)`)
      .bind(crypto.randomUUID(), userId, capability, verified.expiresAt, now)));
    await env.DB.prepare("UPDATE billing_events SET status='processed',processed_at=? WHERE event_id=?").bind(now, eventId).run();
    return { duplicate: false, userId, status };
  } catch (error) {
    await env.DB.prepare("UPDATE billing_events SET status='failed',error_code=?,processed_at=? WHERE event_id=?")
      .bind(error instanceof Error ? error.message.slice(0, 120) : "UNKNOWN", now, eventId).run();
    throw error;
  }
}
