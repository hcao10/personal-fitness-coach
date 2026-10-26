import type { WorkerEnv } from "./platform";

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, "");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer;
}

function derToRaw(signature: Uint8Array, size = 32): Uint8Array {
  if (signature[0] !== 0x30) throw new Error("ADMOB_SIGNATURE_INVALID");
  let offset = signature[1] & 0x80 ? 2 + (signature[1] & 0x7f) : 2;
  if (signature[offset++] !== 0x02) throw new Error("ADMOB_SIGNATURE_INVALID");
  const rLength = signature[offset++];
  const r = signature.slice(offset, offset + rLength);
  offset += rLength;
  if (signature[offset++] !== 0x02) throw new Error("ADMOB_SIGNATURE_INVALID");
  const sLength = signature[offset++];
  const s = signature.slice(offset, offset + sLength);
  const raw = new Uint8Array(size * 2);
  raw.set(r.slice(Math.max(0, r.length - size)), size - Math.min(size, r.length));
  raw.set(s.slice(Math.max(0, s.length - size)), size * 2 - Math.min(size, s.length));
  return raw;
}

function base64UrlBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function signedQuery(url: URL): string {
  const raw = url.search.slice(1);
  const signatureIndex = raw.lastIndexOf("&signature=");
  if (signatureIndex > 0) return raw.slice(0, signatureIndex);
  return raw.split("&").filter((part) => !part.startsWith("signature=")).join("&");
}

export function rewardAdsConfigured(env: WorkerEnv): boolean {
  return env.REWARD_AD_PROVIDER === "admob";
}

export async function processAdmobReward(request: Request, env: WorkerEnv) {
  if (!env.DB || !rewardAdsConfigured(env)) throw new Error("REWARD_AD_NOT_CONFIGURED");
  const url = new URL(request.url);
  const signatureValue = url.searchParams.get("signature");
  const keyId = url.searchParams.get("key_id");
  const userId = url.searchParams.get("user_id");
  const transactionId = url.searchParams.get("transaction_id");
  const timestamp = Number(url.searchParams.get("timestamp"));
  if (!signatureValue || !keyId || !userId || !transactionId || !Number.isFinite(timestamp)) throw new Error("ADMOB_CALLBACK_INVALID");
  if (Math.abs(Date.now() - timestamp) > 24 * 3600_000) throw new Error("ADMOB_CALLBACK_EXPIRED");
  const user = await env.DB.prepare("SELECT id FROM users WHERE id = ? AND status = 'active'").bind(userId).first<{ id: string }>();
  if (!user) throw new Error("ADMOB_USER_NOT_FOUND");
  const existing = await env.DB.prepare("SELECT event_id FROM reward_events WHERE event_id = ?").bind(transactionId).first();
  if (existing) return { duplicate: true };
  const today = new Date().toISOString().slice(0, 10);
  const daily = await env.DB.prepare("SELECT COUNT(*) AS value FROM reward_events WHERE user_id = ? AND created_at >= ?")
    .bind(userId, `${today}T00:00:00.000Z`).first<{ value: number }>();
  if (Number(daily?.value || 0) >= 5) throw new Error("ADMOB_DAILY_LIMIT");
  const keyResponse = await fetch(env.ADMOB_SSV_KEY_URL || "https://www.gstatic.com/admob/reward/verifier-keys.json", { cf: { cacheTtl: 3600 } } as RequestInit).catch(() => null);
  const keyPayload = await keyResponse?.json().catch(() => null) as { keys?: Array<{ keyId?: string | number; pem?: string }> } | null;
  const keyRecord = keyPayload?.keys?.find((key) => String(key.keyId) === keyId);
  if (!keyResponse?.ok || !keyRecord?.pem) throw new Error("ADMOB_KEY_UNAVAILABLE");
  const key = await crypto.subtle.importKey("spki", pemToArrayBuffer(keyRecord.pem), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const signature = Uint8Array.from(derToRaw(base64UrlBytes(signatureValue)));
  const signedBytes = Uint8Array.from(new TextEncoder().encode(signedQuery(url)));
  const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, signature, signedBytes);
  if (!valid) throw new Error("ADMOB_SIGNATURE_INVALID");
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO reward_events
      (event_id, user_id, provider, reward_type, points, signature_valid, created_at)
      VALUES (?, ?, 'admob', 'rewarded_ad', 10, 1, ?)`).bind(transactionId, userId, now),
    env.DB.prepare(`INSERT INTO point_ledger
      (id, user_id, delta, reason, external_ref, created_at) VALUES (?, ?, 10, 'verified_reward_ad', ?, ?)`)
      .bind(crypto.randomUUID(), userId, `admob:${transactionId}`, now),
  ]);
  return { duplicate: false, points: 10 };
}
