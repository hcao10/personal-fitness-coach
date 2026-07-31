import type { WorkerEnv } from "../platform";
import { safeEqual } from "../security";

async function signature(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function verifyMaintenanceRequest(request: Request, env: WorkerEnv) {
  if (!env.MAINTENANCE_SECRET) throw new Error("MAINTENANCE_NOT_CONFIGURED");
  const timestamp = request.headers.get("x-cmine-timestamp") || ""; const nonce = request.headers.get("x-cmine-nonce") || "";
  const supplied = request.headers.get("x-cmine-signature") || ""; const time = Number(timestamp);
  if (!time || Math.abs(Date.now() - time) > 5 * 60_000 || nonce.length < 12) throw new Error("MAINTENANCE_SIGNATURE_EXPIRED");
  const expected = await signature(env.MAINTENANCE_SECRET, `${timestamp}.${nonce}.${new URL(request.url).pathname}`);
  if (!safeEqual(supplied, expected)) throw new Error("MAINTENANCE_SIGNATURE_INVALID");
  if (env.DB) {
    const replay = await env.DB.prepare("SELECT id FROM maintenance_runs WHERE id=?").bind(`nonce:${nonce}`).first();
    if (replay) throw new Error("MAINTENANCE_REPLAYED");
    await env.DB.prepare(`INSERT INTO maintenance_runs (id,job,status,started_at,completed_at)
      VALUES (?,'request_nonce','verified',?,?)`).bind(`nonce:${nonce}`, new Date(time).toISOString(), new Date().toISOString()).run();
  }
}

export async function runMaintenance(env: WorkerEnv) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const id = crypto.randomUUID(); const started = new Date().toISOString(); let processed = 0; let failed = 0;
  await env.DB.prepare("INSERT INTO maintenance_runs (id,job,status,started_at) VALUES (?,'daily','running',?)").bind(id, started).run();
  try {
    const images = await env.DB.prepare("SELECT id,object_key FROM meal_images WHERE retention_until<=? LIMIT 100")
      .bind(started).all<{ id: string; object_key: string }>();
    for (const image of images.results || []) {
      try { if (env.R2) await env.R2.delete(image.object_key); await env.DB.prepare("DELETE FROM meal_images WHERE id=?").bind(image.id).run(); processed += 1; }
      catch { failed += 1; }
    }
    const now = new Date(started); const weekStart = new Date(now); const day = (weekStart.getUTCDay() + 6) % 7;
    weekStart.setUTCDate(weekStart.getUTCDate() - day); weekStart.setUTCHours(0, 0, 0, 0);
    const reviewUsers = await env.DB.prepare(`SELECT DISTINCT c.user_id FROM plan_cycles c
      WHERE c.status='active' AND NOT EXISTS (SELECT 1 FROM weekly_reviews r WHERE r.user_id=c.user_id AND r.week_start=?)
      LIMIT 100`).bind(weekStart.toISOString().slice(0, 10)).all<{ user_id: string }>();
    for (const row of reviewUsers.results || []) {
      const reviewId = crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare(`INSERT OR IGNORE INTO weekly_reviews (id,user_id,week_start,status,created_at,updated_at)
          VALUES (?,?,?,'due',?,?)`).bind(reviewId, row.user_id, weekStart.toISOString().slice(0, 10), started, started),
        env.DB.prepare(`INSERT INTO sync_events (user_id,entity_type,entity_id,operation,payload_json,created_at)
          VALUES (?, 'weekly_review',?,'upsert',?,?)`).bind(row.user_id, reviewId,
            JSON.stringify({ id: reviewId, weekStart: weekStart.toISOString().slice(0, 10), status: "due" }), started),
      ]);
      processed += 1;
    }
    await env.DB.batch([
      env.DB.prepare("DELETE FROM ai_request_cache WHERE expires_at<=?").bind(started),
      env.DB.prepare("DELETE FROM nutrition_cache WHERE expires_at<=?").bind(started),
      env.DB.prepare("DELETE FROM sessions WHERE expires_at<=?").bind(started),
      env.DB.prepare("DELETE FROM maintenance_runs WHERE job='request_nonce' AND completed_at<?")
        .bind(new Date(now.getTime() - 86400_000).toISOString()),
      env.DB.prepare("DELETE FROM maintenance_runs WHERE job='daily' AND completed_at<?")
        .bind(new Date(now.getTime() - 90 * 86400_000).toISOString()),
    ]);
    const completed = new Date().toISOString();
    await env.DB.prepare("UPDATE maintenance_runs SET status=?,processed=?,failed=?,completed_at=? WHERE id=?")
      .bind(failed ? "partial" : "succeeded", processed, failed, completed, id).run();
    return { id, status: failed ? "partial" : "succeeded", processed, failed,
      hasMore: (images.results || []).length === 100 || (reviewUsers.results || []).length === 100 };
  } catch (error) {
    await env.DB.prepare("UPDATE maintenance_runs SET status='failed',processed=?,failed=?,detail_json=?,completed_at=? WHERE id=?")
      .bind(processed, failed + 1, JSON.stringify({ error: error instanceof Error ? error.message : "UNKNOWN" }), new Date().toISOString(), id).run(); throw error;
  }
}
