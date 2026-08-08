interface Env { FIT_ORIGIN: string; MAINTENANCE_SECRET: string }
const hex = (bytes: Uint8Array) => Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
async function signature(secret: string, value: string) { const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)))); }
async function run(env: Env) {
  if (!env.MAINTENANCE_SECRET) throw new Error("MAINTENANCE_SECRET_MISSING"); const path = "/api/internal/maintenance/run";
  const results = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const timestamp = String(Date.now()); const nonce = crypto.randomUUID();
    const response = await fetch(`${env.FIT_ORIGIN}${path}`, { method: "POST", headers: { "x-cmine-timestamp": timestamp, "x-cmine-nonce": nonce, "x-cmine-signature": await signature(env.MAINTENANCE_SECRET, `${timestamp}.${nonce}.${path}`) } });
    const body = await response.json().catch(() => ({ ok: false })) as { ok?: boolean; hasMore?: boolean; error?: string }; results.push(body);
    if (!response.ok) throw new Error(body.error || `FIT_MAINTENANCE_${response.status}`); if (!body.hasMore) break;
  }
  return results;
}
async function notify(env: Env) {
  if (!env.MAINTENANCE_SECRET) throw new Error("MAINTENANCE_SECRET_MISSING"); const path = "/api/internal/notifications/run";
  const timestamp = String(Date.now()); const nonce = crypto.randomUUID();
  const response = await fetch(`${env.FIT_ORIGIN}${path}`, { method: "POST", headers: { "x-cmine-timestamp": timestamp, "x-cmine-nonce": nonce, "x-cmine-signature": await signature(env.MAINTENANCE_SECRET, `${timestamp}.${nonce}.${path}`) } });
  const body = await response.json().catch(() => ({ ok: false })) as { ok?: boolean; error?: string };
  if (!response.ok) throw new Error(body.error || `FIT_NOTIFICATIONS_${response.status}`);
  return body;
}
const worker = {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(controller.cron === "3 * * * *" ? notify(env) : run(env));
  },
  async fetch(request: Request, env: Env) { if (new URL(request.url).pathname !== "/health") return new Response("Not found", { status: 404 }); return Response.json({ ok: true, configured: Boolean(env.MAINTENANCE_SECRET) }); },
};
export default worker;
