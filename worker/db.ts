import type { CoachPlan, Profile } from "../app/lib/coach";
import type { D1Database, WorkerEnv } from "./platform";
import { parseCookies, sha256 } from "./security";

export type StoredUser = {
  id: string;
  sub: string;
  email: string | null;
  name: string | null;
  picture: string | null;
  status: string;
  locale: string;
  timezone: string;
};

export type MeasurementInput = {
  weightKg: number | null;
  bodyFatPct: number | null;
  waistCm: number | null;
  armCm: number | null;
  note: string;
  measuredAt: string;
};

type PlanRow = {
  id: string;
  profile_json: string;
  plan_json: string;
  source: string;
  model: string;
  created_at: string;
};

function requireDb(env: WorkerEnv): D1Database {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  return env.DB;
}

function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try { return JSON.parse(value) as T; } catch { return null; }
}

function publicPlan(row: PlanRow) {
  return {
    id: row.id,
    profile: parseJson<Profile>(row.profile_json),
    plan: parseJson<CoachPlan>(row.plan_json),
    source: row.source,
    model: row.model,
    createdAt: row.created_at,
  };
}

export async function upsertCmineUser(env: WorkerEnv, identity: { sub: string; email?: string; name?: string; picture?: string }): Promise<StoredUser> {
  const db = requireDb(env);
  const existing = await db.prepare("SELECT id FROM users WHERE cmine_sub = ?").bind(identity.sub).first<{ id: string }>();
  const id = existing?.id || crypto.randomUUID();
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO users (id, cmine_sub, email, name, picture, status, locale, timezone, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'active', 'zh', 'UTC', ?, ?)
    ON CONFLICT(cmine_sub) DO UPDATE SET email=excluded.email, name=excluded.name, picture=excluded.picture, updated_at=excluded.updated_at`)
    .bind(id, identity.sub, identity.email || null, identity.name || null, identity.picture || null, now, now).run();
  const user = await db.prepare(`SELECT id, cmine_sub AS sub, email, name, picture, status, locale, timezone
    FROM users WHERE id = ?`).bind(id).first<StoredUser>();
  if (!user) throw new Error("USER_UPSERT_FAILED");
  return user;
}

export async function createSession(env: WorkerEnv, userId: string, rawToken: string): Promise<void> {
  const db = requireDb(env);
  const now = new Date();
  await db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now.toISOString()).run();
  await db.prepare("INSERT INTO sessions (id_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256(rawToken), userId, now.toISOString(), new Date(now.getTime() + 7 * 86400_000).toISOString()).run();
}

export async function getSessionUser(request: Request, env: WorkerEnv): Promise<StoredUser | null> {
  if (!env.DB) return null;
  const token = parseCookies(request).cmine_fit_session;
  if (!token) return null;
  const row = await env.DB.prepare(`SELECT u.id, u.cmine_sub AS sub, u.email, u.name, u.picture, u.status, u.locale, u.timezone
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id_hash = ? AND s.expires_at > ? AND u.status = 'active'`)
    .bind(await sha256(token), new Date().toISOString()).first<StoredUser>();
  return row || null;
}

export async function deleteSession(request: Request, env: WorkerEnv): Promise<void> {
  if (!env.DB) return;
  const token = parseCookies(request).cmine_fit_session;
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(await sha256(token)).run();
}

export async function saveProfile(env: WorkerEnv, userId: string, profile: Profile): Promise<void> {
  const db = requireDb(env);
  await db.prepare(`INSERT INTO profiles (user_id, profile_json, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET profile_json=excluded.profile_json, updated_at=excluded.updated_at`)
    .bind(userId, JSON.stringify(profile), new Date().toISOString()).run();
}

export async function profileForUser(env: WorkerEnv, userId: string): Promise<Profile | null> {
  const row = await requireDb(env).prepare("SELECT profile_json FROM profiles WHERE user_id = ?").bind(userId).first<{ profile_json: string }>();
  return parseJson<Profile>(row?.profile_json);
}

export async function savePlan(env: WorkerEnv, userId: string, profile: Profile, plan: CoachPlan, source: string, model: string): Promise<string> {
  const db = requireDb(env);
  const now = new Date().toISOString();
  await saveProfile(env, userId, profile);
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO plans (id, user_id, profile_json, plan_json, source, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, userId, JSON.stringify(profile), JSON.stringify(plan), source, model, now).run();
  return id;
}

export async function listPlansForUser(env: WorkerEnv, userId: string, limit = 20): Promise<ReturnType<typeof publicPlan>[]> {
  const result = await requireDb(env).prepare(`SELECT id, profile_json, plan_json, source, model, created_at
    FROM plans WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`).bind(userId, Math.min(50, Math.max(1, limit))).all<PlanRow>();
  return (result.results || []).map(publicPlan);
}

export async function planForUser(env: WorkerEnv, userId: string, planId: string): Promise<ReturnType<typeof publicPlan> | null> {
  const row = await requireDb(env).prepare(`SELECT id, profile_json, plan_json, source, model, created_at
    FROM plans WHERE id = ? AND user_id = ?`).bind(planId, userId).first<PlanRow>();
  return row ? publicPlan(row) : null;
}

export async function recordConsent(request: Request, env: WorkerEnv, userId: string | null, locale: string): Promise<void> {
  const db = requireDb(env);
  const ip = request.headers.get("cf-connecting-ip");
  const ipHash = ip && env.SESSION_SECRET ? await sha256(`${env.SESSION_SECRET}:${ip}`) : null;
  const version = await settingValue<string>(env, "disclaimer_version", "health-v2");
  await db.prepare("INSERT INTO consents (id, user_id, disclaimer_version, locale, ip_hash, consented_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), userId, version, locale, ipHash, new Date().toISOString()).run();
}

export async function pointsForUser(env: WorkerEnv, userId: string): Promise<number> {
  if (!env.DB) return 0;
  const result = await env.DB.prepare("SELECT COALESCE(SUM(delta), 0) AS points FROM point_ledger WHERE user_id = ?").bind(userId).first<{ points: number }>();
  return Number(result?.points || 0);
}

export async function pointLedgerForUser(env: WorkerEnv, userId: string, limit = 30) {
  const result = await requireDb(env).prepare(`SELECT id, delta, reason, created_at
    FROM point_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`).bind(userId, limit).all<{ id: string; delta: number; reason: string; created_at: string }>();
  return (result.results || []).map((row) => ({ id: row.id, delta: row.delta, reason: row.reason, createdAt: row.created_at }));
}

export async function recordWorkoutCompletion(env: WorkerEnv, userId: string, planId: string, dayIndex: number, exerciseId: string): Promise<{ recorded: boolean; points: number }> {
  const db = requireDb(env);
  const plan = await db.prepare("SELECT id FROM plans WHERE id = ? AND user_id = ?").bind(planId, userId).first<{ id: string }>();
  if (!plan) throw new Error("PLAN_NOT_FOUND");
  const externalRef = `completion:${planId}:${dayIndex}:${exerciseId}`;
  const existing = await db.prepare("SELECT id FROM workout_completions WHERE user_id = ? AND plan_id = ? AND day_index = ? AND exercise_id = ?")
    .bind(userId, planId, dayIndex, exerciseId).first<{ id: string }>();
  if (existing) return { recorded: false, points: await pointsForUser(env, userId) };
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO workout_completions (id, user_id, plan_id, day_index, exercise_id, completed_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), userId, planId, dayIndex, exerciseId, now),
    db.prepare("INSERT OR IGNORE INTO point_ledger (id, user_id, delta, reason, external_ref, created_at) VALUES (?, ?, 5, 'exercise_completed', ?, ?)")
      .bind(crypto.randomUUID(), userId, externalRef, now),
  ]);
  return { recorded: true, points: await pointsForUser(env, userId) };
}

export async function saveWorkoutSession(env: WorkerEnv, userId: string, planId: string, input: {
  dayIndex: number;
  status: "completed" | "in_progress";
  durationMinutes: number | null;
  rpe: number | null;
  pain: boolean;
  notes: string;
}): Promise<void> {
  const db = requireDb(env);
  const plan = await db.prepare("SELECT id FROM plans WHERE id = ? AND user_id = ?").bind(planId, userId).first<{ id: string }>();
  if (!plan) throw new Error("PLAN_NOT_FOUND");
  const now = new Date().toISOString();
  const completedAt = input.status === "completed" ? now : null;
  await db.prepare(`INSERT INTO workout_sessions
    (id, user_id, plan_id, day_index, status, duration_minutes, rpe, pain, notes, started_at, completed_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, plan_id, day_index) DO UPDATE SET
      status=excluded.status, duration_minutes=COALESCE(excluded.duration_minutes, workout_sessions.duration_minutes),
      rpe=COALESCE(excluded.rpe, workout_sessions.rpe), pain=excluded.pain, notes=excluded.notes,
      completed_at=COALESCE(excluded.completed_at, workout_sessions.completed_at), updated_at=excluded.updated_at`)
    .bind(crypto.randomUUID(), userId, planId, input.dayIndex, input.status, input.durationMinutes, input.rpe,
      input.pain ? 1 : 0, input.notes, now, completedAt, now).run();
}

export async function addMeasurement(env: WorkerEnv, userId: string, input: MeasurementInput) {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await requireDb(env).prepare(`INSERT INTO measurements
    (id, user_id, weight_kg, body_fat_pct, waist_cm, arm_cm, note, measured_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, userId, input.weightKg, input.bodyFatPct, input.waistCm, input.armCm, input.note, input.measuredAt, createdAt).run();
  return { id, ...input, createdAt };
}

export async function measurementsForUser(env: WorkerEnv, userId: string, limit = 50) {
  const result = await requireDb(env).prepare(`SELECT id, weight_kg, body_fat_pct, waist_cm, arm_cm, note, measured_at, created_at
    FROM measurements WHERE user_id = ? ORDER BY measured_at DESC LIMIT ?`).bind(userId, Math.min(100, Math.max(1, limit)))
    .all<{ id: string; weight_kg: number | null; body_fat_pct: number | null; waist_cm: number | null; arm_cm: number | null; note: string | null; measured_at: string; created_at: string }>();
  return (result.results || []).map((row) => ({
    id: row.id, weightKg: row.weight_kg, bodyFatPct: row.body_fat_pct, waistCm: row.waist_cm,
    armCm: row.arm_cm, note: row.note || "", measuredAt: row.measured_at, createdAt: row.created_at,
  }));
}

export async function progressForUser(env: WorkerEnv, userId: string) {
  const db = requireDb(env);
  const [exerciseCount, workoutCount, latestMeasurement] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS value FROM workout_completions WHERE user_id = ?").bind(userId).first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM workout_sessions WHERE user_id = ? AND status = 'completed'").bind(userId).first<{ value: number }>(),
    db.prepare(`SELECT weight_kg, body_fat_pct, waist_cm, arm_cm, measured_at
      FROM measurements WHERE user_id = ? ORDER BY measured_at DESC LIMIT 1`).bind(userId)
      .first<{ weight_kg: number | null; body_fat_pct: number | null; waist_cm: number | null; arm_cm: number | null; measured_at: string }>(),
  ]);
  return {
    completedExercises: Number(exerciseCount?.value || 0),
    completedWorkouts: Number(workoutCount?.value || 0),
    latestMeasurement: latestMeasurement ? {
      weightKg: latestMeasurement.weight_kg, bodyFatPct: latestMeasurement.body_fat_pct,
      waistCm: latestMeasurement.waist_cm, armCm: latestMeasurement.arm_cm, measuredAt: latestMeasurement.measured_at,
    } : null,
  };
}

export async function accountSnapshot(env: WorkerEnv, user: StoredUser) {
  const [profile, plans, measurements, progress, points, ledger] = await Promise.all([
    profileForUser(env, user.id),
    listPlansForUser(env, user.id, 12),
    measurementsForUser(env, user.id, 24),
    progressForUser(env, user.id),
    pointsForUser(env, user.id),
    pointLedgerForUser(env, user.id, 20),
  ]);
  return {
    user: { sub: user.sub, email: user.email, name: user.name, picture: user.picture, locale: user.locale, timezone: user.timezone },
    profile,
    latestPlan: plans[0] || null,
    plans,
    measurements,
    progress,
    points,
    pointLedger: ledger,
  };
}

export async function recordGenerationRun(env: WorkerEnv, input: {
  userId: string | null;
  status: "succeeded" | "failed";
  model: string;
  latencyMs: number;
  requestId?: string | null;
  errorCode?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  reasoningTokens?: number | null;
}): Promise<void> {
  if (!env.DB) return;
  await env.DB.prepare(`INSERT INTO generation_runs
    (id, user_id, status, model, latency_ms, request_id, error_code, input_tokens, output_tokens, reasoning_tokens, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), input.userId, input.status, input.model, input.latencyMs, input.requestId || null,
      input.errorCode || null, input.inputTokens ?? null, input.outputTokens ?? null, input.reasoningTokens ?? null,
      new Date().toISOString()).run();
}

export async function settingValue<T>(env: WorkerEnv, key: string, fallback: T): Promise<T> {
  if (!env.DB) return fallback;
  const row = await env.DB.prepare("SELECT value_json FROM site_settings WHERE key = ?").bind(key).first<{ value_json: string }>();
  return parseJson<T>(row?.value_json) ?? fallback;
}

export async function adminOverview(env: WorkerEnv) {
  const db = requireDb(env);
  const [users, activeUsers, plans, consents, sessions, completions, measurements, generations, failedGenerations, recentUsers, recentPlans, recentRuns] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS value FROM users").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM users WHERE status = 'active'").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM plans").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM consents").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM sessions WHERE expires_at > ?").bind(new Date().toISOString()).first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM workout_completions").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM measurements").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM generation_runs").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM generation_runs WHERE status = 'failed'").first<{ value: number }>(),
    db.prepare("SELECT id, email, name, status, created_at FROM users ORDER BY created_at DESC LIMIT 8")
      .all<{ id: string; email: string | null; name: string | null; status: string; created_at: string }>(),
    db.prepare("SELECT id, user_id, source, model, created_at FROM plans ORDER BY created_at DESC LIMIT 8")
      .all<{ id: string; user_id: string | null; source: string; model: string; created_at: string }>(),
    db.prepare(`SELECT id, status, model, latency_ms, request_id, error_code, created_at
      FROM generation_runs ORDER BY created_at DESC LIMIT 12`)
      .all<{ id: string; status: string; model: string; latency_ms: number; request_id: string | null; error_code: string | null; created_at: string }>(),
  ]);
  const generationCount = Number(generations?.value || 0);
  const failureCount = Number(failedGenerations?.value || 0);
  return {
    metrics: {
      users: Number(users?.value || 0),
      activeUsers: Number(activeUsers?.value || 0),
      plans: Number(plans?.value || 0),
      consents: Number(consents?.value || 0),
      activeSessions: Number(sessions?.value || 0),
      completions: Number(completions?.value || 0),
      measurements: Number(measurements?.value || 0),
      generations: generationCount,
      generationSuccessRate: generationCount ? Math.round(((generationCount - failureCount) / generationCount) * 100) : 0,
    },
    recentUsers: (recentUsers.results || []).map((row) => ({ ...row, createdAt: row.created_at })),
    recentPlans: (recentPlans.results || []).map((row) => ({ id: row.id, userId: row.user_id, source: row.source, model: row.model, createdAt: row.created_at })),
    recentRuns: (recentRuns.results || []).map((row) => ({
      id: row.id, status: row.status, model: row.model, latencyMs: row.latency_ms,
      requestId: row.request_id, errorCode: row.error_code, createdAt: row.created_at,
    })),
  };
}

export async function adminSummary(env: WorkerEnv): Promise<Record<string, number>> {
  return (await adminOverview(env)).metrics;
}

export async function adminUsers(env: WorkerEnv, query: string, limit = 30) {
  const term = `%${query.slice(0, 100)}%`;
  const result = await requireDb(env).prepare(`SELECT id, cmine_sub, email, name, status, locale, timezone, created_at, updated_at
    FROM users WHERE (? = '%%' OR email LIKE ? OR name LIKE ? OR cmine_sub LIKE ?)
    ORDER BY created_at DESC LIMIT ?`).bind(term, term, term, term, Math.min(50, Math.max(1, limit)))
    .all<{ id: string; cmine_sub: string; email: string | null; name: string | null; status: string; locale: string; timezone: string; created_at: string; updated_at: string }>();
  return result.results || [];
}

export async function updateUserStatus(env: WorkerEnv, userId: string, status: "active" | "suspended"): Promise<boolean> {
  const db = requireDb(env);
  const existing = await db.prepare("SELECT id FROM users WHERE id = ?").bind(userId).first<{ id: string }>();
  if (!existing) return false;
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE users SET status = ?, updated_at = ? WHERE id = ?").bind(status, now, userId),
    ...(status === "suspended" ? [db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId)] : []),
  ]);
  return true;
}

export async function adminSettings(env: WorkerEnv) {
  const result = await requireDb(env).prepare("SELECT key, value_json, updated_by, updated_at FROM site_settings ORDER BY key").all<{
    key: string; value_json: string; updated_by: string | null; updated_at: string;
  }>();
  return Object.fromEntries((result.results || []).map((row) => [row.key, {
    value: parseJson<unknown>(row.value_json), updatedBy: row.updated_by, updatedAt: row.updated_at,
  }]));
}

export async function updateAdminSetting(env: WorkerEnv, key: string, value: unknown, adminEmail: string): Promise<void> {
  await requireDb(env).prepare(`INSERT INTO site_settings (key, value_json, updated_by, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_by=excluded.updated_by, updated_at=excluded.updated_at`)
    .bind(key, JSON.stringify(value), adminEmail, new Date().toISOString()).run();
}

export async function recordAdminAudit(env: WorkerEnv, adminEmail: string, action: string, targetType: string, targetId: string | null, detail: unknown): Promise<void> {
  await requireDb(env).prepare(`INSERT INTO admin_audit_events
    (id, admin_email, action, target_type, target_id, detail_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), adminEmail, action, targetType, targetId, JSON.stringify(detail), new Date().toISOString()).run();
}

export async function exportUserData(env: WorkerEnv, user: StoredUser) {
  const db = requireDb(env);
  const [snapshot, consents, workouts, completions] = await Promise.all([
    accountSnapshot(env, user),
    db.prepare("SELECT disclaimer_version, locale, consented_at FROM consents WHERE user_id = ? ORDER BY consented_at DESC")
      .bind(user.id).all<Record<string, unknown>>(),
    db.prepare("SELECT plan_id, day_index, status, duration_minutes, rpe, pain, notes, completed_at FROM workout_sessions WHERE user_id = ? ORDER BY updated_at DESC")
      .bind(user.id).all<Record<string, unknown>>(),
    db.prepare("SELECT plan_id, day_index, exercise_id, completed_at FROM workout_completions WHERE user_id = ? ORDER BY completed_at DESC")
      .bind(user.id).all<Record<string, unknown>>(),
  ]);
  return { exportedAt: new Date().toISOString(), ...snapshot, consents: consents.results || [], workouts: workouts.results || [], completions: completions.results || [] };
}

export async function deleteUserData(env: WorkerEnv, userId: string): Promise<void> {
  await requireDb(env).prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
}
