import type { HealthObservationInput, SyncMutation } from "../../packages/api-contracts/src";
import { validateSyncMutation } from "../../packages/sync-core/src";
import type { WorkerEnv } from "../platform";
import { addMeasurement, saveWorkoutSession, upsertWorkoutSet } from "../db";

export async function registerDevice(env: WorkerEnv, userId: string, input: Record<string, unknown>) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const platform = String(input.platform || "");
  if (!new Set(["ios", "android", "web"]).has(platform)) throw new Error("INVALID_DEVICE_PLATFORM");
  const id = typeof input.id === "string" && input.id.length <= 100 ? input.id : crypto.randomUUID(); const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO devices (id,user_id,platform,name,push_token,last_seen_at,created_at)
    VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,push_token=excluded.push_token,last_seen_at=excluded.last_seen_at`)
    .bind(id, userId, platform, String(input.name || "").slice(0, 100) || null, String(input.pushToken || "").slice(0, 300) || null, now, now).run();
  return { id, platform, name: String(input.name || "").slice(0, 100), pushTokenRegistered: Boolean(input.pushToken), lastSeenAt: now };
}

export async function deleteDevice(env: WorkerEnv, userId: string, id: string) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  await env.DB.prepare("DELETE FROM devices WHERE id=? AND user_id=?").bind(id, userId).run(); return { ok: true };
}

async function applyMutation(env: WorkerEnv, userId: string, mutation: SyncMutation) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  if (mutation.operation === "upsert" && mutation.entityType === "workout_session") {
    const body = mutation.payload;
    await saveWorkoutSession(env, userId, String(body.planId || ""), { dayIndex: Number(body.dayIndex), status: body.status === "completed" ? "completed" : "in_progress",
      durationMinutes: Number.isFinite(Number(body.durationMinutes)) ? Number(body.durationMinutes) : null,
      rpe: Number.isFinite(Number(body.rpe)) ? Number(body.rpe) : null, pain: Math.max(0, Math.min(10, Number(body.pain || 0))), notes: String(body.notes || "").slice(0, 500) });
  }
  if (mutation.operation === "upsert" && mutation.entityType === "measurement") {
    const body = mutation.payload;
    await addMeasurement(env, userId, { weightKg: Number.isFinite(Number(body.weightKg)) ? Number(body.weightKg) : null,
      bodyFatPct: Number.isFinite(Number(body.bodyFatPct)) ? Number(body.bodyFatPct) : null,
      waistCm: Number.isFinite(Number(body.waistCm)) ? Number(body.waistCm) : null,
      armCm: Number.isFinite(Number(body.armCm)) ? Number(body.armCm) : null, note: String(body.note || "").slice(0, 300), measuredAt: String(body.measuredAt || mutation.occurredAt) });
  }
  if (mutation.operation === "upsert" && mutation.entityType === "workout_set") {
    const body = mutation.payload;
    await upsertWorkoutSet(env, userId, String(body.planId || ""), { dayIndex: Number(body.dayIndex), exerciseId: String(body.exerciseId || ""), setIndex: Number(body.setIndex),
      setType: (["warmup", "working", "dropset", "failure"].includes(String(body.setType)) ? body.setType : "working") as "warmup" | "working" | "dropset" | "failure",
      targetReps: String(body.targetReps || "").slice(0, 30), weightKg: body.weightKg === null || body.weightKg === undefined ? null : Number(body.weightKg),
      reps: body.reps === null || body.reps === undefined ? null : Number(body.reps), rir: body.rir === null || body.rir === undefined ? null : Number(body.rir),
      rpe: body.rpe === null || body.rpe === undefined ? null : Number(body.rpe), completed: body.completed === true, clientMutationId: mutation.mutationId });
  }
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO sync_mutations (mutation_id,user_id,device_id,entity_type,entity_id,operation,payload_json,applied_at)
      VALUES (?,?,?,?,?,?,?,?)`).bind(mutation.mutationId, userId, mutation.deviceId, mutation.entityType, mutation.entityId, mutation.operation, JSON.stringify(mutation.payload), now),
    env.DB.prepare(`INSERT INTO sync_events (user_id,entity_type,entity_id,operation,payload_json,created_at)
      VALUES (?,?,?,?,?,?)`).bind(userId, mutation.entityType, mutation.entityId, mutation.operation, JSON.stringify(mutation.payload), now),
  ]);
}

export async function syncBatch(env: WorkerEnv, userId: string, value: unknown) {
  if (!env.DB || !Array.isArray(value) || value.length > 50) throw new Error("INVALID_SYNC_BATCH");
  const results = [];
  for (const candidate of value) {
    if (!validateSyncMutation(candidate)) { results.push({ mutationId: null, status: "invalid" }); continue; }
    const device = await env.DB.prepare("SELECT id FROM devices WHERE id=? AND user_id=?").bind(candidate.deviceId, userId).first();
    if (!device) { results.push({ mutationId: candidate.mutationId, status: "device_not_registered" }); continue; }
    const duplicate = await env.DB.prepare("SELECT mutation_id FROM sync_mutations WHERE mutation_id=? AND user_id=?").bind(candidate.mutationId, userId).first();
    if (duplicate) { results.push({ mutationId: candidate.mutationId, status: "duplicate" }); continue; }
    try { await applyMutation(env, userId, candidate); results.push({ mutationId: candidate.mutationId, status: "applied" }); }
    catch (error) { results.push({ mutationId: candidate.mutationId, status: "failed", error: error instanceof Error ? error.message : "UNKNOWN" }); }
  }
  const cursor = await env.DB.prepare("SELECT COALESCE(MAX(cursor),0) AS value FROM sync_events WHERE user_id=?").bind(userId).first<{ value: number }>();
  return { results, cursor: Number(cursor?.value || 0) };
}

export async function syncChanges(env: WorkerEnv, userId: string, cursor: number) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const rows = await env.DB.prepare(`SELECT cursor,entity_type,entity_id,operation,payload_json,created_at FROM sync_events
    WHERE user_id=? AND cursor>? ORDER BY cursor LIMIT 200`).bind(userId, Math.max(0, cursor)).all<{
      cursor: number; entity_type: string; entity_id: string; operation: string; payload_json: string; created_at: string;
    }>();
  const events = (rows.results || []).map((row) => ({ cursor: row.cursor, entityType: row.entity_type, entityId: row.entity_id,
    operation: row.operation, payload: JSON.parse(row.payload_json), createdAt: row.created_at }));
  return { events, cursor: events.at(-1)?.cursor || cursor, hasMore: events.length === 200 };
}

export async function upsertHealthConnection(env: WorkerEnv, userId: string, input: Record<string, unknown>) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED"); const platform = String(input.platform || "");
  if (platform !== "healthkit" && platform !== "health_connect") throw new Error("INVALID_HEALTH_PLATFORM");
  const permissions = Array.isArray(input.permissions) ? input.permissions.map(String).slice(0, 20) : []; const now = new Date().toISOString();
  const existing = await env.DB.prepare("SELECT id FROM health_connections WHERE user_id=? AND platform=?").bind(userId, platform).first<{ id: string }>();
  const id = existing?.id || crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO health_connections (id,user_id,platform,permissions_json,status,created_at,updated_at)
    VALUES (?,?,?,?,'active',?,?) ON CONFLICT(user_id,platform) DO UPDATE SET permissions_json=excluded.permissions_json,status='active',updated_at=excluded.updated_at`)
    .bind(id, userId, platform, JSON.stringify(permissions), now, now).run(); return { id, platform, permissions, status: "active" };
}

export async function importHealthObservations(env: WorkerEnv, userId: string, connectionId: string, observations: HealthObservationInput[]) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const connection = await env.DB.prepare("SELECT id FROM health_connections WHERE id=? AND user_id=? AND status='active'").bind(connectionId, userId).first();
  if (!connection) throw new Error("HEALTH_CONNECTION_NOT_FOUND"); if (!Array.isArray(observations) || observations.length > 500) throw new Error("INVALID_HEALTH_BATCH");
  let imported = 0; const allowed = new Set(["steps", "active_energy", "workout", "heart_rate_summary", "resting_heart_rate", "weight", "body_fat"]);
  for (const item of observations) {
    if (!item || !allowed.has(item.type) || !Number.isFinite(item.value) || !item.sourceRecordId || !Number.isFinite(new Date(item.observedAt).getTime())) continue;
    await env.DB.prepare(`INSERT OR IGNORE INTO health_observations
      (id,user_id,connection_id,source_record_id,type,value,unit,observed_at,source_name,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), userId, connectionId, item.sourceRecordId.slice(0, 200), item.type, item.value, item.unit.slice(0, 30), item.observedAt,
        String(item.sourceName || "").slice(0, 100) || null, new Date().toISOString()).run(); imported += 1;
  }
  return { imported };
}

export async function deleteHealthConnection(env: WorkerEnv, userId: string, id: string) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED"); await env.DB.prepare("DELETE FROM health_connections WHERE id=? AND user_id=?").bind(id, userId).run(); return { ok: true };
}
