/* eslint-disable @typescript-eslint/no-explicit-any */
import type { StoredUser } from "./db";
import type { WorkerEnv } from "./platform";

const proCapabilities = ["plan.generate", "meal.scan", "coach.chat", "adaptive.review", "data.export"];

export function stripeConfigured(env: WorkerEnv): boolean {
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET && env.STRIPE_PRICE_MONTHLY && env.STRIPE_PRICE_YEARLY);
}

// Pinned so webhook payload shapes and API responses do not change under us
// when the Stripe account's default API version is upgraded.
const STRIPE_API_VERSION = "2024-06-20";

async function stripeRequest(env: WorkerEnv, path: string, params?: URLSearchParams): Promise<Record<string, any>> {
  if (!env.STRIPE_SECRET_KEY) throw new Error("STRIPE_NOT_CONFIGURED");
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: params ? "POST" : "GET",
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "stripe-version": STRIPE_API_VERSION,
      ...(params ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body: params,
  });
  const payload = await response.json().catch(() => null) as Record<string, any> | null;
  if (!response.ok || !payload) throw new Error(`STRIPE_REQUEST_FAILED:${response.status}:${payload?.error?.code || "unknown"}`);
  return payload;
}

async function ensureCustomer(env: WorkerEnv, user: StoredUser): Promise<string> {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const existing = await env.DB.prepare("SELECT external_customer_id FROM billing_customers WHERE user_id = ?")
    .bind(user.id).first<{ external_customer_id: string }>();
  if (existing?.external_customer_id) return existing.external_customer_id;
  const params = new URLSearchParams({
    ...(user.email ? { email: user.email } : {}),
    ...(user.name ? { name: user.name } : {}),
    "metadata[user_id]": user.id,
    "metadata[cmine_sub]": user.sub,
  });
  const customer = await stripeRequest(env, "/customers", params);
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO billing_customers
    (user_id, provider, external_customer_id, created_at, updated_at) VALUES (?, 'stripe', ?, ?, ?)`)
    .bind(user.id, customer.id, now, now).run();
  return String(customer.id);
}

export async function createCheckout(env: WorkerEnv, user: StoredUser, interval: "monthly" | "yearly", origin: string) {
  if (!stripeConfigured(env)) throw new Error("STRIPE_NOT_CONFIGURED");
  const customer = await ensureCustomer(env, user);
  const price = interval === "monthly" ? env.STRIPE_PRICE_MONTHLY! : env.STRIPE_PRICE_YEARLY!;
  const params = new URLSearchParams({
    mode: "subscription",
    customer,
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    success_url: `${origin}/account?billing=success`,
    cancel_url: `${origin}/pricing?billing=canceled`,
    allow_promotion_codes: "true",
    client_reference_id: user.id,
    "subscription_data[metadata][user_id]": user.id,
    "metadata[user_id]": user.id,
  });
  if (env.STRIPE_TAX_ENABLED === "true") params.set("automatic_tax[enabled]", "true");
  const session = await stripeRequest(env, "/checkout/sessions", params);
  return { url: String(session.url), sessionId: String(session.id) };
}

export async function createPortal(env: WorkerEnv, user: StoredUser, origin: string) {
  if (!env.STRIPE_SECRET_KEY) throw new Error("STRIPE_NOT_CONFIGURED");
  const customer = await ensureCustomer(env, user);
  const portal = await stripeRequest(env, "/billing_portal/sessions", new URLSearchParams({
    customer,
    return_url: `${origin}/account#membership`,
  }));
  return { url: String(portal.url) };
}

function fromHex(value: string): Uint8Array | null {
  if (!/^[\da-f]+$/i.test(value) || value.length % 2) return null;
  const bytes = new Uint8Array(value.length / 2);
  for (let i = 0; i < value.length; i += 2) bytes[i / 2] = Number.parseInt(value.slice(i, i + 2), 16);
  return bytes;
}

async function hmacSha256(secret: string, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a[i] ^ b[i];
  return difference === 0;
}

export async function verifyStripeWebhook(env: WorkerEnv, rawBody: string, signatureHeader: string | null): Promise<Record<string, any>> {
  if (!env.STRIPE_WEBHOOK_SECRET || !signatureHeader) throw new Error("STRIPE_SIGNATURE_MISSING");
  const parts = signatureHeader.split(",").map((part) => part.split("=", 2));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) throw new Error("STRIPE_SIGNATURE_EXPIRED");
  const expected = await hmacSha256(env.STRIPE_WEBHOOK_SECRET, `${timestamp}.${rawBody}`);
  const valid = signatures.some((value) => {
    const bytes = fromHex(value);
    return bytes ? timingSafeEqual(bytes, expected) : false;
  });
  if (!valid) throw new Error("STRIPE_SIGNATURE_INVALID");
  return JSON.parse(rawBody) as Record<string, any>;
}

async function userIdForCustomer(env: WorkerEnv, customerId: string | null | undefined): Promise<string | null> {
  if (!env.DB || !customerId) return null;
  const row = await env.DB.prepare("SELECT user_id FROM billing_customers WHERE external_customer_id = ?")
    .bind(customerId).first<{ user_id: string }>();
  return row?.user_id || null;
}

function isoFromUnix(value: unknown): string | null {
  return typeof value === "number" && value > 0 ? new Date(value * 1000).toISOString() : null;
}

// Stripe API versions from 2025 moved current_period_end off the subscription
// object onto its items; read both so either payload shape resolves correctly.
function subscriptionPeriodEnd(object: Record<string, any>): string | null {
  return isoFromUnix(object.current_period_end) || isoFromUnix(object.items?.data?.[0]?.current_period_end);
}

export async function processStripeEvent(env: WorkerEnv, event: Record<string, any>) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const eventId = String(event.id || "");
  const type = String(event.type || "");
  const object = event.data?.object as Record<string, any> | undefined;
  if (!eventId || !type || !object) throw new Error("STRIPE_EVENT_INVALID");
  const existing = await env.DB.prepare("SELECT event_id FROM billing_events WHERE event_id = ?").bind(eventId).first();
  if (existing) return { duplicate: true };
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO billing_events
    (event_id, provider, event_type, object_id, amount_total, currency, status, received_at)
    VALUES (?, 'stripe', ?, ?, ?, ?, 'processing', ?)`)
    .bind(eventId, type, String(object.id || ""), Number(object.amount_paid ?? object.amount_total ?? 0) || null,
      object.currency ? String(object.currency).toUpperCase() : null, now).run();
  try {
    if (type === "checkout.session.completed") {
      const userId = String(object.metadata?.user_id || object.client_reference_id || "");
      if (userId && object.customer) {
        await env.DB.prepare(`INSERT INTO billing_customers
          (user_id, provider, external_customer_id, created_at, updated_at) VALUES (?, 'stripe', ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET external_customer_id=excluded.external_customer_id, updated_at=excluded.updated_at`)
          .bind(userId, String(object.customer), now, now).run();
      }
    }
    if (type.startsWith("customer.subscription.")) {
      const userId = String(object.metadata?.user_id || await userIdForCustomer(env, String(object.customer || "")) || "");
      if (!userId) throw new Error("STRIPE_USER_NOT_FOUND");
      const priceId = String(object.items?.data?.[0]?.price?.id || "");
      const status = String(object.status || "incomplete");
      const eventCreated = Number(event.created || 0);
      await env.DB.prepare(`INSERT INTO subscriptions
        (id, user_id, provider, external_subscription_id, plan, status, price_id, current_period_end,
          cancel_at_period_end, last_event_created, created_at, updated_at)
        VALUES (?, ?, 'stripe', ?, 'pro', ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(external_subscription_id) DO UPDATE SET
          status=CASE WHEN excluded.last_event_created >= subscriptions.last_event_created THEN excluded.status ELSE subscriptions.status END,
          price_id=CASE WHEN excluded.last_event_created >= subscriptions.last_event_created THEN excluded.price_id ELSE subscriptions.price_id END,
          current_period_end=CASE WHEN excluded.last_event_created >= subscriptions.last_event_created THEN excluded.current_period_end ELSE subscriptions.current_period_end END,
          cancel_at_period_end=CASE WHEN excluded.last_event_created >= subscriptions.last_event_created THEN excluded.cancel_at_period_end ELSE subscriptions.cancel_at_period_end END,
          last_event_created=MAX(subscriptions.last_event_created, excluded.last_event_created),
          updated_at=CASE WHEN excluded.last_event_created >= subscriptions.last_event_created THEN excluded.updated_at ELSE subscriptions.updated_at END`)
        .bind(String(object.id), userId, String(object.id), status, priceId || null, subscriptionPeriodEnd(object),
          object.cancel_at_period_end ? 1 : 0, eventCreated, now, now).run();
      await env.DB.prepare("DELETE FROM entitlements WHERE user_id = ? AND source = 'stripe'").bind(userId).run();
      if (status === "active" || status === "trialing") {
        const expiresAt = subscriptionPeriodEnd(object);
        await env.DB.batch(proCapabilities.map((capability) => env.DB!.prepare(`INSERT INTO entitlements
          (id, user_id, capability, source, status, expires_at, updated_at) VALUES (?, ?, ?, 'stripe', 'active', ?, ?)`)
          .bind(crypto.randomUUID(), userId, capability, expiresAt, now)));
      }
    }
    await env.DB.prepare("UPDATE billing_events SET status = 'processed', processed_at = ? WHERE event_id = ?").bind(now, eventId).run();
    return { duplicate: false };
  } catch (error) {
    await env.DB.prepare("UPDATE billing_events SET status = 'failed', error_code = ?, processed_at = ? WHERE event_id = ?")
      .bind(error instanceof Error ? error.message.slice(0, 120) : "UNKNOWN", now, eventId).run();
    throw error;
  }
}

export function billingCatalog(env: WorkerEnv) {
  return {
    configured: stripeConfigured(env),
    currency: "USD",
    free: { name: "Cmine Fit 免费版", monthly: 0 },
    pro: {
      name: "Cmine Fit Pro",
      monthly: 9.99,
      yearly: 79,
      monthlyAvailable: Boolean(env.STRIPE_PRICE_MONTHLY),
      yearlyAvailable: Boolean(env.STRIPE_PRICE_YEARLY),
    },
  };
}
