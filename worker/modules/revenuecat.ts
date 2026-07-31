/* eslint-disable @typescript-eslint/no-explicit-any */
import type { WorkerEnv } from "../platform";
import { safeEqual } from "../security";

const proCapabilities = ["plan.generate", "meal.scan", "coach.chat", "adaptive.review", "data.export"];

export function revenueCatConfigured(env: WorkerEnv) { return Boolean(env.REVENUECAT_WEBHOOK_SECRET); }

export function verifyRevenueCatWebhook(env: WorkerEnv, request: Request) {
  if (!env.REVENUECAT_WEBHOOK_SECRET) throw new Error("REVENUECAT_NOT_CONFIGURED");
  const authorization = request.headers.get("authorization") || "";
  const expected = `Bearer ${env.REVENUECAT_WEBHOOK_SECRET}`;
  if (!safeEqual(authorization, expected)) throw new Error("REVENUECAT_SIGNATURE_INVALID");
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
  const user = await env.DB.prepare("SELECT id FROM users WHERE id=?").bind(userId).first<{ id: string }>();
  if (!user) throw new Error("REVENUECAT_USER_NOT_FOUND");
  const now = new Date().toISOString(); const eventTime = Math.floor(Number(event.event_timestamp_ms || Date.now()) / 1000);
  const expiresAt = Number(event.expiration_at_ms) > 0 ? new Date(Number(event.expiration_at_ms)).toISOString() : null;
  const externalId = String(event.original_transaction_id || event.transaction_id || `${userId}:${event.product_id || "pro"}`);
  await env.DB.prepare(`INSERT INTO billing_events
    (event_id,provider,event_type,object_id,amount_total,currency,status,received_at)
    VALUES (?,'revenuecat',?,?,?,?, 'processing',?)`)
    .bind(eventId, type, externalId, Math.round(Number(event.price_in_purchased_currency || event.price || 0) * 100) || null,
      String(event.currency || "USD").toUpperCase(), now).run();
  try {
    const expired = type === "EXPIRATION" || type === "REFUND" || (expiresAt && new Date(expiresAt).getTime() <= Date.now());
    const status = expired ? "expired" : type === "BILLING_ISSUE" ? "in_grace_period" : "active";
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
      .bind(`rc:${externalId}`, userId, externalId, status, String(event.product_id || ""), expiresAt, cancelAtPeriodEnd ? 1 : 0, eventTime, now, now).run();
    await env.DB.prepare("DELETE FROM entitlements WHERE user_id=? AND source='revenuecat'").bind(userId).run();
    if (!expired) await env.DB.batch(proCapabilities.map((capability) => env.DB!.prepare(`INSERT INTO entitlements
      (id,user_id,capability,source,status,expires_at,updated_at) VALUES (?,?,?,'revenuecat','active',?,?)`)
      .bind(crypto.randomUUID(), userId, capability, expiresAt, now)));
    await env.DB.prepare("UPDATE billing_events SET status='processed',processed_at=? WHERE event_id=?").bind(now, eventId).run();
    return { duplicate: false, userId, status };
  } catch (error) {
    await env.DB.prepare("UPDATE billing_events SET status='failed',error_code=?,processed_at=? WHERE event_id=?")
      .bind(error instanceof Error ? error.message.slice(0, 120) : "UNKNOWN", now, eventId).run();
    throw error;
  }
}
