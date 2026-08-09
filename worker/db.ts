import type { CoachPlan, Profile } from "../app/lib/coach";
import type { D1Database, WorkerEnv } from "./platform";
import { decryptSecret, encryptSecret, parseCookies, sha256 } from "./security";
import { entitlementSnapshot } from "./product";
import { dailyNutrition, mealsForUser } from "./nutrition";

export type StoredUser = {
  id: string;
  sub: string;
  email: string | null;
  name: string | null;
  picture: string | null;
  role: string;
  cmineRole: string;
  status: string;
  /** Raw column value — may be stale or unshippable; narrow it with toLocale. */
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

export type WorkoutSetInput = {
  occurrenceId?: string | null;
  dayIndex: number;
  exerciseId: string;
  setIndex: number;
  setType: "warmup" | "working" | "dropset" | "failure";
  targetReps?: string | null;
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  rpe: number | null;
  completed: boolean;
  clientMutationId?: string | null;
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

export function localDateInTimezone(timezone: string, date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch { return date.toISOString().slice(0, 10); }
}

export function addLocalDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function createOccurrences(db: D1Database, input: {
  userId: string; cycleId: string; versionId: string; planId: string; startDate: string; phaseWeeks: number;
}) {
  const now = new Date().toISOString();
  const statements = [];
  for (let week = 0; week < input.phaseWeeks; week += 1) {
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      statements.push(db.prepare(`INSERT OR IGNORE INTO workout_occurrences
        (id,user_id,cycle_id,version_id,plan_id,day_index,scheduled_date,status,mode,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,'scheduled','standard',?,?)`).bind(
          crypto.randomUUID(), input.userId, input.cycleId, input.versionId, input.planId,
          dayIndex, addLocalDays(input.startDate, week * 7 + dayIndex), now, now,
        ));
    }
  }
  for (let index = 0; index < statements.length; index += 50) await db.batch(statements.slice(index, index + 50));
}

export async function upsertCmineUser(env: WorkerEnv, identity: {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
  role?: string;
}): Promise<StoredUser> {
  const db = requireDb(env);
  const existing = await db.prepare("SELECT id FROM users WHERE cmine_sub = ?").bind(identity.sub).first<{ id: string }>();
  const id = existing?.id || crypto.randomUUID();
  const now = new Date().toISOString();
  const cmineRole = identity.role === "admin" || identity.role === "super_admin" ? identity.role : "user";
  // The product admin role is granted locally and only ever escalated, never
  // downgraded or overwritten by login. The IdP-asserted role is recorded for
  // reference (cmine_role) but cannot mint product admins on its own — a
  // compromised or misconfigured IdP profile must not become instant admin.
  const bootstrapAdmins = (env.ADMIN_EMAILS || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  const bootstrapAdmin = Boolean(identity.email && bootstrapAdmins.includes(identity.email.trim().toLowerCase()));
  await db.prepare(`INSERT INTO users (id, cmine_sub, email, name, picture, role, cmine_role, status, locale, timezone, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 'zh', 'UTC', ?, ?)
    ON CONFLICT(cmine_sub) DO UPDATE SET email=excluded.email, name=excluded.name, picture=excluded.picture,
      role=CASE WHEN excluded.role='admin' THEN 'admin' ELSE users.role END,
      cmine_role=excluded.cmine_role, updated_at=excluded.updated_at`)
    .bind(id, identity.sub, identity.email || null, identity.name || null, identity.picture || null,
      bootstrapAdmin ? "admin" : "user", cmineRole, now, now).run();
  const user = await db.prepare(`SELECT id, cmine_sub AS sub, email, name, picture, role, cmine_role AS cmineRole, status, locale, timezone
    FROM users WHERE id = ?`).bind(id).first<StoredUser>();
  if (!user) throw new Error("USER_UPSERT_FAILED");
  return user;
}

export async function createSession(env: WorkerEnv, userId: string, rawToken: string, cmine?: {
  accessToken: string;
  refreshToken?: string | null;
  expiresIn?: number | null;
}): Promise<void> {
  const db = requireDb(env);
  const now = new Date();
  await db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now.toISOString()).run();
  const secret = env.SESSION_SECRET;
  await db.prepare(`INSERT INTO sessions
    (id_hash, user_id, cmine_access_token, cmine_refresh_token, cmine_token_expires_at, cmine_checked_at, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      await sha256(rawToken),
      userId,
      cmine && secret ? await encryptSecret(cmine.accessToken, secret) : null,
      cmine?.refreshToken && secret ? await encryptSecret(cmine.refreshToken, secret) : null,
      cmine ? new Date(now.getTime() + Math.max(60, Number(cmine.expiresIn || 3600)) * 1000).toISOString() : null,
      cmine ? now.toISOString() : null,
      now.toISOString(),
      new Date(now.getTime() + 7 * 86400_000).toISOString(),
    ).run();
}

export async function getSessionUser(request: Request, env: WorkerEnv): Promise<StoredUser | null> {
  if (!env.DB) return null;
  const token = parseCookies(request).cmine_fit_session;
  if (!token) return null;
  const idHash = await sha256(token);
  const row = await env.DB.prepare(`SELECT u.id, u.cmine_sub AS sub, u.email, u.name, u.picture, u.role,
      u.cmine_role AS cmineRole, u.status, u.locale, u.timezone,
      s.cmine_access_token AS cmineAccessToken, s.cmine_refresh_token AS cmineRefreshToken,
      s.cmine_token_expires_at AS cmineTokenExpiresAt, s.cmine_checked_at AS cmineCheckedAt
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id_hash = ? AND s.expires_at > ? AND u.status = 'active'`)
    .bind(idHash, new Date().toISOString()).first<StoredUser & {
      cmineAccessToken: string | null;
      cmineRefreshToken: string | null;
      cmineTokenExpiresAt: string | null;
      cmineCheckedAt: string | null;
    }>();
  if (!row) return null;
  const shouldCheck = row.cmineAccessToken && env.SESSION_SECRET && env.CMINE_CLIENT_ID && env.CMINE_CLIENT_SECRET &&
    (!row.cmineCheckedAt || Date.now() - new Date(row.cmineCheckedAt).getTime() > 5 * 60_000);
  if (shouldCheck) {
    const issuer = (env.CMINE_ISSUER || "https://identity.chwjh.com").replace(/\/$/, "");
    let accessToken = await decryptSecret(row.cmineAccessToken, env.SESSION_SECRET!);
    const tokenExpired = !row.cmineTokenExpiresAt || new Date(row.cmineTokenExpiresAt).getTime() < Date.now() + 120_000;
    if (tokenExpired && !row.cmineRefreshToken) {
      await env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(idHash).run();
      return null;
    }
    if (tokenExpired && row.cmineRefreshToken) {
      const refreshToken = await decryptSecret(row.cmineRefreshToken, env.SESSION_SECRET!);
      if (refreshToken) {
        const refreshResponse = await fetch(`${issuer}/oauth/token`, {
          method: "POST",
          headers: {
            authorization: `Basic ${btoa(`${env.CMINE_CLIENT_ID}:${env.CMINE_CLIENT_SECRET}`)}`,
            "content-type": "application/x-www-form-urlencoded",
            accept: "application/json",
          },
          body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: env.CMINE_CLIENT_ID! }),
        }).catch(() => null);
        const refreshed = await refreshResponse?.json().catch(() => null) as {
          access_token?: string; refresh_token?: string; expires_in?: number;
        } | null;
        if (refreshResponse?.ok && refreshed?.access_token) {
          accessToken = refreshed.access_token;
          await env.DB.prepare(`UPDATE sessions SET cmine_access_token=?, cmine_refresh_token=?,
            cmine_token_expires_at=?, cmine_checked_at=? WHERE id_hash=?`)
            .bind(
              await encryptSecret(refreshed.access_token, env.SESSION_SECRET!),
              refreshed.refresh_token ? await encryptSecret(refreshed.refresh_token, env.SESSION_SECRET!) : row.cmineRefreshToken,
              new Date(Date.now() + Math.max(60, Number(refreshed.expires_in || 3600)) * 1000).toISOString(),
              new Date().toISOString(),
              idHash,
            ).run();
        } else if (refreshResponse && !refreshResponse.ok) {
          await env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(idHash).run();
          return null;
        }
      }
    }
    if (accessToken && !tokenExpired) {
      const response = await fetch(`${issuer}/oauth/introspect`, {
        method: "POST",
        headers: {
          authorization: `Basic ${btoa(`${env.CMINE_CLIENT_ID}:${env.CMINE_CLIENT_SECRET}`)}`,
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
        },
        body: new URLSearchParams({ token: accessToken, client_id: env.CMINE_CLIENT_ID! }),
      }).catch(() => null);
      const status = await response?.json().catch(() => null) as { active?: boolean } | null;
      if (response?.ok && status?.active === false) {
        await env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(idHash).run();
        return null;
      }
      if (response?.ok && status?.active === true) {
        await env.DB.prepare("UPDATE sessions SET cmine_checked_at = ? WHERE id_hash = ?").bind(new Date().toISOString(), idHash).run();
      }
    }
  }
  return {
    id: row.id,
    sub: row.sub,
    email: row.email,
    name: row.name,
    picture: row.picture,
    role: row.role,
    cmineRole: row.cmineRole,
    status: row.status,
    locale: row.locale,
    timezone: row.timezone,
  };
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

export async function savePlan(env: WorkerEnv, userId: string, profile: Profile, plan: CoachPlan, source: string, model: string, options: {
  startDate?: string; timezone?: string; changeSummary?: string[];
} = {}): Promise<string> {
  const db = requireDb(env);
  const now = new Date().toISOString();
  const timezone = options.timezone || "UTC";
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(options.startDate || "") ? options.startDate! : localDateInTimezone(timezone);
  const phaseWeeks = Math.max(4, Math.min(8, Number(plan.phase?.lengthWeeks || 4)));
  await saveProfile(env, userId, profile);
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO plans (id, user_id, profile_json, plan_json, source, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, userId, JSON.stringify(profile), JSON.stringify(plan), source, model, now).run();
  const activeCycle = await db.prepare("SELECT id, active_version_id, start_date, timezone FROM plan_cycles WHERE user_id=? AND status='active' ORDER BY started_at DESC LIMIT 1")
    .bind(userId).first<{ id: string; active_version_id: string | null; start_date: string | null; timezone: string | null }>();
  if (!activeCycle) {
    const cycleId = crypto.randomUUID(); const versionId = crypto.randomUUID();
    await db.batch([
      db.prepare(`INSERT INTO plan_cycles (id,user_id,goal,status,active_version_id,start_date,timezone,phase_weeks,started_at) VALUES (?,?,?,'active',?,?,?,?,?)`)
        .bind(cycleId, userId, profile.goal, versionId, startDate, timezone, phaseWeeks, now),
      db.prepare(`INSERT INTO plan_versions
        (id,cycle_id,user_id,plan_id,version_number,status,change_summary_json,created_at,activated_at)
        VALUES (?,?,?,?,1,'active',?,?,?)`).bind(versionId, cycleId, userId, id, JSON.stringify(options.changeSummary || []), now, now),
      db.prepare(`INSERT INTO plan_activation_events
        (id,user_id,cycle_id,version_id,reason,created_at) VALUES (?,?,?,?,?,?)`)
        .bind(crypto.randomUUID(), userId, cycleId, versionId, "first_plan", now),
    ]);
    await createOccurrences(db, { userId, cycleId, versionId, planId: id, startDate, phaseWeeks });
  } else {
    const next = await db.prepare("SELECT COALESCE(MAX(version_number),0)+1 AS value FROM plan_versions WHERE cycle_id=?")
      .bind(activeCycle.id).first<{ value: number }>();
    await db.prepare(`INSERT INTO plan_versions
      (id,cycle_id,user_id,plan_id,version_number,parent_version_id,status,change_summary_json,created_at)
      VALUES (?,?,?,?,?,?, 'draft',?,?)`)
      .bind(crypto.randomUUID(), activeCycle.id, userId, id, Number(next?.value || 1), activeCycle.active_version_id, JSON.stringify(options.changeSummary || ["更新训练编排与阶段重点"]), now).run();
  }
  return id;
}

export async function activePlanForUser(env: WorkerEnv, userId: string) {
  const row = await requireDb(env).prepare(`SELECT p.id,p.profile_json,p.plan_json,p.source,p.model,p.created_at
    FROM plan_cycles c JOIN plan_versions v ON v.id=c.active_version_id JOIN plans p ON p.id=v.plan_id
    WHERE c.user_id=? AND c.status='active' LIMIT 1`).bind(userId).first<PlanRow>();
  if (row) return publicPlan(row);
  return (await listPlansForUser(env, userId, 1))[0] || null;
}

export async function planVersionStatus(env: WorkerEnv, userId: string, planId: string) {
  const row = await requireDb(env).prepare(`SELECT v.id,v.cycle_id,v.version_number,v.status,v.change_summary_json,v.created_at
    FROM plan_versions v WHERE v.user_id=? AND v.plan_id=?`).bind(userId, planId)
    .first<{ id: string; cycle_id: string; version_number: number; status: string; change_summary_json: string; created_at: string }>();
  return row ? { id: row.id, cycleId: row.cycle_id, versionNumber: row.version_number, status: row.status,
    changeSummary: parseJson<string[]>(row.change_summary_json) || [], createdAt: row.created_at } : null;
}

export async function activatePlan(env: WorkerEnv, userId: string, planId: string, reason = "user_confirmed", options: { startDate?: string; timezone?: string; preserveCycleStart?: boolean } = {}) {
  const db = requireDb(env); const now = new Date().toISOString();
  const version = await db.prepare(`SELECT id,cycle_id,status FROM plan_versions WHERE user_id=? AND plan_id=?`)
    .bind(userId, planId).first<{ id: string; cycle_id: string; status: string }>();
  if (!version) throw new Error("PLAN_VERSION_NOT_FOUND");
  const cycle = await db.prepare("SELECT active_version_id,start_date,timezone,phase_weeks FROM plan_cycles WHERE id=? AND user_id=?")
    .bind(version.cycle_id, userId).first<{ active_version_id: string | null; start_date: string | null; timezone: string; phase_weeks: number }>();
  if (!cycle) throw new Error("PLAN_CYCLE_NOT_FOUND");
  const timezone = options.timezone || cycle.timezone || "UTC";
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(options.startDate || "") ? options.startDate! : (cycle.start_date || localDateInTimezone(timezone));
  const cycleStartDate = options.preserveCycleStart ? (cycle.start_date || startDate) : startDate;
  if (cycle.active_version_id === version.id) {
    if (options.startDate || options.timezone) {
      await db.batch([
        db.prepare("UPDATE plan_cycles SET start_date=?,timezone=? WHERE id=? AND user_id=?").bind(cycleStartDate, timezone, version.cycle_id, userId),
        db.prepare("DELETE FROM workout_occurrences WHERE version_id=? AND status='scheduled'").bind(version.id),
      ]);
      await createOccurrences(db, { userId, cycleId: version.cycle_id, versionId: version.id, planId, startDate, phaseWeeks: Number(cycle.phase_weeks || 4) });
    }
    return { active: true, duplicate: true, versionId: version.id };
  }
  await db.batch([
    db.prepare("UPDATE plan_versions SET status='archived' WHERE cycle_id=? AND status='active'").bind(version.cycle_id),
    db.prepare("UPDATE plan_versions SET status='active',activated_at=? WHERE id=? AND user_id=?").bind(now, version.id, userId),
    db.prepare("UPDATE plan_cycles SET active_version_id=?,start_date=?,timezone=? WHERE id=? AND user_id=?").bind(version.id, cycleStartDate, timezone, version.cycle_id, userId),
    db.prepare("UPDATE workout_occurrences SET status='superseded',updated_at=? WHERE cycle_id=? AND version_id<>? AND scheduled_date>=? AND status='scheduled'")
      .bind(now, version.cycle_id, version.id, startDate),
    db.prepare(`INSERT INTO plan_activation_events
      (id,user_id,cycle_id,version_id,previous_version_id,reason,created_at) VALUES (?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), userId, version.cycle_id, version.id, cycle.active_version_id, reason, now),
  ]);
  await createOccurrences(db, { userId, cycleId: version.cycle_id, versionId: version.id, planId, startDate, phaseWeeks: Number(cycle.phase_weeks || 4) });
  return { active: true, duplicate: false, versionId: version.id, previousVersionId: cycle.active_version_id };
}

export async function activeCycleForUser(env: WorkerEnv, userId: string) {
  const row = await requireDb(env).prepare(`SELECT c.id,c.active_version_id,c.start_date,c.timezone,c.phase_weeks,p.id AS plan_id,p.profile_json,p.plan_json
    FROM plan_cycles c JOIN plan_versions v ON v.id=c.active_version_id JOIN plans p ON p.id=v.plan_id
    WHERE c.user_id=? AND c.status='active' LIMIT 1`).bind(userId).first<{
      id: string; active_version_id: string; start_date: string | null; timezone: string; phase_weeks: number;
      plan_id: string; profile_json: string; plan_json: string;
    }>();
  return row ? { id: row.id, versionId: row.active_version_id, startDate: row.start_date || localDateInTimezone(row.timezone), timezone: row.timezone,
    phaseWeeks: row.phase_weeks, planId: row.plan_id, profile: parseJson<Profile>(row.profile_json), plan: parseJson<CoachPlan>(row.plan_json) } : null;
}

export async function ensureActiveOccurrences(env: WorkerEnv, userId: string) {
  const cycle = await activeCycleForUser(env, userId);
  if (!cycle) return null;
  const existing = await requireDb(env).prepare("SELECT COUNT(*) AS value FROM workout_occurrences WHERE version_id=?")
    .bind(cycle.versionId).first<{ value: number }>();
  if (!Number(existing?.value || 0)) await createOccurrences(requireDb(env), {
    userId, cycleId: cycle.id, versionId: cycle.versionId, planId: cycle.planId,
    startDate: cycle.startDate, phaseWeeks: Math.max(4, Number(cycle.plan?.phase?.lengthWeeks || cycle.phaseWeeks || 4)),
  });
  return cycle;
}

export async function occurrenceForDate(env: WorkerEnv, userId: string, localDate: string) {
  return requireDb(env).prepare(`SELECT id,cycle_id,version_id,plan_id,day_index,scheduled_date,status,mode
    FROM workout_occurrences WHERE user_id=? AND scheduled_date=? AND status<>'superseded'
    ORDER BY CASE WHEN status='scheduled' THEN 0 ELSE 1 END LIMIT 1`).bind(userId, localDate).first<{
      id: string; cycle_id: string; version_id: string; plan_id: string; day_index: number; scheduled_date: string; status: string; mode: string;
    }>();
}

export async function occurrenceForUser(env: WorkerEnv, userId: string, occurrenceId: string) {
  return requireDb(env).prepare(`SELECT id,cycle_id,version_id,plan_id,day_index,scheduled_date,status,mode
    FROM workout_occurrences WHERE id=? AND user_id=?`).bind(occurrenceId, userId).first<{
      id: string; cycle_id: string; version_id: string; plan_id: string; day_index: number; scheduled_date: string; status: string; mode: string;
    }>();
}

export async function setOccurrenceMode(env: WorkerEnv, userId: string, occurrenceId: string, mode: "standard" | "short" | "recovery") {
  const occurrence = await occurrenceForUser(env, userId, occurrenceId);
  if (!occurrence) throw new Error("OCCURRENCE_NOT_FOUND");
  await requireDb(env).prepare("UPDATE workout_occurrences SET mode=?,updated_at=? WHERE id=? AND user_id=?")
    .bind(mode, new Date().toISOString(), occurrenceId, userId).run();
  return { ...occurrence, mode };
}

export async function rescheduleOccurrence(env: WorkerEnv, userId: string, occurrenceId: string, scheduledDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) throw new Error("INVALID_DATE");
  const occurrence = await occurrenceForUser(env, userId, occurrenceId);
  if (!occurrence || occurrence.status === "completed" || occurrence.status === "superseded") throw new Error("OCCURRENCE_NOT_FOUND");
  const conflict = await occurrenceForDate(env, userId, scheduledDate);
  if (conflict && conflict.id !== occurrenceId && conflict.status === "scheduled") throw new Error("DATE_CONFLICT");
  const now = new Date().toISOString();
  await requireDb(env).prepare("UPDATE workout_occurrences SET scheduled_date=?,status='rescheduled',rescheduled_from_id=COALESCE(rescheduled_from_id,id),updated_at=? WHERE id=? AND user_id=?")
    .bind(scheduledDate, now, occurrenceId, userId).run();
  return { ...occurrence, scheduled_date: scheduledDate, status: "rescheduled" };
}

export async function markOccurrenceCompleted(env: WorkerEnv, userId: string, planId: string, dayIndex: number, occurrenceId?: string | null) {
  const db = requireDb(env); const now = new Date().toISOString();
  if (occurrenceId) {
    await db.prepare("UPDATE workout_occurrences SET status='completed',updated_at=? WHERE id=? AND user_id=? AND plan_id=?")
      .bind(now, occurrenceId, userId, planId).run();
    return;
  }
  await db.prepare("UPDATE workout_occurrences SET status='completed',updated_at=? WHERE user_id=? AND plan_id=? AND day_index=? AND scheduled_date=?")
    .bind(now, userId, planId, dayIndex, localDateInTimezone("UTC")).run();
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

export async function recordConsent(request: Request, env: WorkerEnv, userId: string | null, locale: string,
  extras?: { timezone?: string | null; productVersion?: string | null }): Promise<void> {
  const db = requireDb(env);
  const ip = request.headers.get("cf-connecting-ip");
  const ipHash = ip && env.SESSION_SECRET ? await sha256(`${env.SESSION_SECRET}:${ip}`) : null;
  const version = await settingValue<string>(env, "disclaimer_version", "health-v2");
  const privacyVersion = await settingValue<string>(env, "privacy_version", "privacy-v1");
  await db.prepare(`INSERT INTO consents (id, user_id, disclaimer_version, locale, ip_hash, consented_at, timezone, product_version, privacy_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), userId, version, locale, ipHash, new Date().toISOString(),
      extras?.timezone?.slice(0, 60) || null, extras?.productVersion?.slice(0, 40) || null, privacyVersion).run();
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
  pain: number;
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
      Math.max(0, Math.min(10, Math.round(input.pain))), input.notes, now, completedAt, now).run();
}

export async function saveWorkoutOccurrenceSession(env: WorkerEnv, userId: string, planId: string, occurrenceId: string, input: {
  status: "completed" | "in_progress"; durationMinutes: number | null; rpe: number | null; pain: number; notes: string;
}) {
  const occurrence = await occurrenceForUser(env, userId, occurrenceId);
  if (!occurrence || occurrence.plan_id !== planId) throw new Error("OCCURRENCE_NOT_FOUND");
  const db = requireDb(env); const now = new Date().toISOString(); const completedAt = input.status === "completed" ? now : null;
  await db.batch([
    db.prepare(`INSERT INTO workout_occurrence_sessions
      (id,occurrence_id,user_id,plan_id,status,duration_minutes,rpe,pain,notes,started_at,completed_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(occurrence_id) DO UPDATE SET status=excluded.status,
      duration_minutes=COALESCE(excluded.duration_minutes,workout_occurrence_sessions.duration_minutes),
      rpe=COALESCE(excluded.rpe,workout_occurrence_sessions.rpe),pain=excluded.pain,notes=excluded.notes,
      completed_at=COALESCE(excluded.completed_at,workout_occurrence_sessions.completed_at),updated_at=excluded.updated_at`)
      .bind(crypto.randomUUID(), occurrenceId, userId, planId, input.status, input.durationMinutes, input.rpe,
        Math.max(0, Math.min(10, Math.round(input.pain))), input.notes, now, completedAt, now),
    db.prepare("UPDATE workout_occurrences SET status=?,updated_at=? WHERE id=? AND user_id=?")
      .bind(input.status === "completed" ? "completed" : occurrence.status, now, occurrenceId, userId),
  ]);
  return { occurrenceId, status: input.status, completedAt };
}

export async function workoutSetsForDay(env: WorkerEnv, userId: string, planId: string, dayIndex: number, occurrenceId?: string | null) {
  const db = requireDb(env);
  const plan = await db.prepare("SELECT id FROM plans WHERE id=? AND user_id=?").bind(planId, userId).first<{ id: string }>();
  if (!plan) throw new Error("PLAN_NOT_FOUND");
  if (occurrenceId) {
    const occurrence = await occurrenceForUser(env, userId, occurrenceId);
    if (!occurrence || occurrence.plan_id !== planId || occurrence.day_index !== dayIndex) throw new Error("OCCURRENCE_NOT_FOUND");
  }
  const table = occurrenceId ? "workout_occurrence_sets" : "workout_sets";
  const condition = occurrenceId ? "user_id=? AND plan_id=? AND occurrence_id=?" : "user_id=? AND plan_id=? AND day_index=?";
  const rows = await db.prepare(`SELECT id,exercise_id,set_index,set_type,target_reps,weight_kg,reps,rir,rpe,completed,updated_at
    FROM ${table} WHERE ${condition} ORDER BY exercise_id,set_index`)
    .bind(userId, planId, occurrenceId || dayIndex).all<{
      id: string; exercise_id: string; set_index: number; set_type: string; target_reps: string | null;
      weight_kg: number | null; reps: number | null; rir: number | null; rpe: number | null; completed: number; updated_at: string;
    }>();
  const exerciseIds = [...new Set((rows.results || []).map((row) => row.exercise_id))];
  const previous: Record<string, { weightKg: number | null; reps: number | null; rir: number | null; updatedAt: string }> = {};
  for (const exerciseId of exerciseIds) {
    const row = await db.prepare(`SELECT weight_kg,reps,rir,updated_at FROM (
        SELECT weight_kg,reps,rir,updated_at FROM workout_occurrence_sets WHERE user_id=? AND exercise_id=? AND completed=1
        UNION ALL SELECT weight_kg,reps,rir,updated_at FROM workout_sets WHERE user_id=? AND exercise_id=? AND completed=1
      ) ORDER BY updated_at DESC LIMIT 1`).bind(userId, exerciseId, userId, exerciseId)
      .first<{ weight_kg: number | null; reps: number | null; rir: number | null; updated_at: string }>();
    if (row) previous[exerciseId] = { weightKg: row.weight_kg, reps: row.reps, rir: row.rir, updatedAt: row.updated_at };
  }
  return { sets: (rows.results || []).map((row) => ({ id: row.id, exerciseId: row.exercise_id, setIndex: row.set_index,
    setType: row.set_type, targetReps: row.target_reps, weightKg: row.weight_kg, reps: row.reps, rir: row.rir,
    rpe: row.rpe, completed: Boolean(row.completed), updatedAt: row.updated_at })), previous };
}

export async function upsertWorkoutSet(env: WorkerEnv, userId: string, planId: string, input: WorkoutSetInput) {
  const db = requireDb(env);
  const row = await db.prepare("SELECT plan_json FROM plans WHERE id=? AND user_id=?").bind(planId, userId).first<{ plan_json: string }>();
  const plan = parseJson<CoachPlan>(row?.plan_json);
  const exercise = plan?.schedule.find((day) => day.dayIndex === input.dayIndex)?.exercises.find((item) => item.id === input.exerciseId);
  if (!row || !exercise) throw new Error("PLAN_EXERCISE_NOT_FOUND");
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  if (input.occurrenceId) {
    const occurrence = await occurrenceForUser(env, userId, input.occurrenceId);
    if (!occurrence || occurrence.plan_id !== planId || occurrence.day_index !== input.dayIndex) throw new Error("OCCURRENCE_NOT_FOUND");
    await db.prepare(`INSERT INTO workout_occurrence_sets
      (id,occurrence_id,user_id,plan_id,day_index,exercise_id,set_index,set_type,target_reps,weight_kg,reps,rir,rpe,completed,client_mutation_id,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(occurrence_id,exercise_id,set_index) DO UPDATE SET
        set_type=excluded.set_type,target_reps=excluded.target_reps,weight_kg=excluded.weight_kg,reps=excluded.reps,
        rir=excluded.rir,rpe=excluded.rpe,completed=excluded.completed,
        client_mutation_id=COALESCE(workout_occurrence_sets.client_mutation_id,excluded.client_mutation_id),updated_at=excluded.updated_at`)
      .bind(id, input.occurrenceId, userId, planId, input.dayIndex, input.exerciseId, input.setIndex, input.setType,
        String(input.targetReps || exercise.reps).slice(0, 30), input.weightKg, input.reps, input.rir, input.rpe,
        input.completed ? 1 : 0, input.clientMutationId || null, now, now).run();
    return db.prepare(`SELECT id,exercise_id,set_index,set_type,target_reps,weight_kg,reps,rir,rpe,completed,updated_at
      FROM workout_occurrence_sets WHERE occurrence_id=? AND exercise_id=? AND set_index=?`)
      .bind(input.occurrenceId, input.exerciseId, input.setIndex).first<Record<string, unknown>>();
  }
  await db.prepare(`INSERT INTO workout_sets
    (id,user_id,plan_id,day_index,exercise_id,set_index,set_type,target_reps,weight_kg,reps,rir,rpe,completed,client_mutation_id,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id,plan_id,day_index,exercise_id,set_index) DO UPDATE SET
      set_type=excluded.set_type,target_reps=excluded.target_reps,weight_kg=excluded.weight_kg,reps=excluded.reps,
      rir=excluded.rir,rpe=excluded.rpe,completed=excluded.completed,
      client_mutation_id=COALESCE(workout_sets.client_mutation_id,excluded.client_mutation_id),updated_at=excluded.updated_at`)
    .bind(id, userId, planId, input.dayIndex, input.exerciseId, input.setIndex, input.setType,
      String(input.targetReps || exercise.reps).slice(0, 30), input.weightKg, input.reps, input.rir, input.rpe,
      input.completed ? 1 : 0, input.clientMutationId || null, now, now).run();
  const stored = await db.prepare(`SELECT id,exercise_id,set_index,set_type,target_reps,weight_kg,reps,rir,rpe,completed,updated_at
    FROM workout_sets WHERE user_id=? AND plan_id=? AND day_index=? AND exercise_id=? AND set_index=?`)
    .bind(userId, planId, input.dayIndex, input.exerciseId, input.setIndex).first<Record<string, unknown>>();
  return stored;
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
  const today = new Date().toISOString().slice(0, 10);
  const [profile, plans, activePlan, measurements, progress, points, ledger, product, meals, nutritionToday] = await Promise.all([
    profileForUser(env, user.id),
    listPlansForUser(env, user.id, 12),
    activePlanForUser(env, user.id),
    measurementsForUser(env, user.id, 24),
    progressForUser(env, user.id),
    pointsForUser(env, user.id),
    pointLedgerForUser(env, user.id, 20),
    entitlementSnapshot(env, user.id),
    mealsForUser(env, user.id, 8),
    dailyNutrition(env, user.id, today),
  ]);
  return {
    user: { id: user.id, sub: user.sub, email: user.email, name: user.name, picture: user.picture, locale: user.locale, timezone: user.timezone },
    profile,
    latestPlan: activePlan || plans[0] || null,
    plans,
    measurements,
    progress,
    points,
    pointLedger: ledger,
    product,
    meals,
    nutritionToday,
  };
}

// Moved to worker/telemetry.ts (db.ts imports nutrition.ts, which now needs it).
export { recordGenerationRun } from "./telemetry";

export async function settingValue<T>(env: WorkerEnv, key: string, fallback: T): Promise<T> {
  if (!env.DB) return fallback;
  const row = await env.DB.prepare("SELECT value_json FROM site_settings WHERE key = ?").bind(key).first<{ value_json: string }>();
  return parseJson<T>(row?.value_json) ?? fallback;
}

export async function adminOverview(env: WorkerEnv) {
  const db = requireDb(env);
  const [
    users, activeUsers, plans, consents, sessions, completions, measurements, generations, failedGenerations,
    recentUsers, recentPlans, recentRuns, subscriptions, revenue, failedBilling, meals, mealAnalyses,
    failedMealAnalyses, lowConfidenceMeals, aiCost, recentBilling, recentAudits, routes, redemptions,
    onboardingCompleted, coachConversations, coachMessages, weeklyReviews, acceptedReviews, devices, maintenance,
    workoutSets, beginnerProfiles, hypertrophyProfiles, foodSearches, zeroFoodSearches, pendingFoodCorrections, customFoods, foodSources,
    localeDrift,
  ] = await Promise.all([
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
    db.prepare("SELECT COUNT(*) AS value FROM subscriptions WHERE status IN ('active', 'trialing')").first<{ value: number }>(),
    db.prepare("SELECT COALESCE(SUM(amount_total), 0) AS value FROM billing_events WHERE event_type = 'invoice.paid' AND status = 'processed'").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM billing_events WHERE status = 'failed'").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM meal_logs WHERE status = 'confirmed'").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM meal_analysis_runs").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM meal_analysis_runs WHERE status = 'failed'").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM meal_analysis_runs WHERE confidence IS NOT NULL AND confidence < 0.7").first<{ value: number }>(),
    db.prepare("SELECT COALESCE(SUM(estimated_cost_usd), 0) AS value FROM generation_runs").first<{ value: number }>(),
    db.prepare(`SELECT event_id, event_type, object_id, amount_total, currency, status, error_code, received_at
      FROM billing_events ORDER BY received_at DESC LIMIT 12`).all<Record<string, unknown>>(),
    db.prepare(`SELECT id, admin_email, action, target_type, target_id, detail_json, created_at
      FROM admin_audit_events ORDER BY created_at DESC LIMIT 20`).all<Record<string, unknown>>(),
    db.prepare("SELECT id, task, tier, priority, provider, model, enabled, updated_at FROM ai_routes ORDER BY task, tier, priority")
      .all<Record<string, unknown>>(),
    db.prepare("SELECT COUNT(*) AS value FROM point_redemptions").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM users WHERE onboarding_status='completed'").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM coach_conversations").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM coach_messages WHERE role='user'").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM weekly_reviews").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM weekly_reviews WHERE status='accepted'").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM devices").first<{ value: number }>(),
    db.prepare("SELECT id,job,status,processed,failed,started_at,completed_at FROM maintenance_runs WHERE job='daily' ORDER BY started_at DESC LIMIT 8").all<Record<string, unknown>>(),
    db.prepare(`SELECT (SELECT COUNT(*) FROM workout_sets WHERE completed=1) +
      (SELECT COUNT(*) FROM workout_occurrence_sets WHERE completed=1) AS value`).first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM profiles WHERE json_extract(profile_json,'$.trainingTrack')='beginner_fat_loss'").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM profiles WHERE json_extract(profile_json,'$.trainingTrack')='intermediate_hypertrophy'").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM food_search_events").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM food_search_events WHERE result_count=0").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM food_corrections WHERE status='pending'").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM canonical_foods WHERE source_kind='user' AND status='active'").first<{ value: number }>(),
    db.prepare("SELECT source,title,license_name,license_url,attribution_text,commercial_use,redistribution,status,last_verified_at,updated_at FROM food_source_licenses ORDER BY source").all<Record<string, unknown>>(),
    // Language drift, per task and requested locale. `undetected` is counted
    // separately from `drifted` on purpose: a run whose output was too short to
    // measure is unknown, not wrong, and folding the two together would invent
    // a failure rate out of missing data.
    db.prepare(`SELECT task, locale, prompt_version,
        COUNT(*) AS total,
        SUM(CASE WHEN content_locale IS NULL THEN 1 ELSE 0 END) AS undetected,
        SUM(CASE WHEN content_locale IS NOT NULL AND content_locale <> locale THEN 1 ELSE 0 END) AS drifted
      FROM generation_runs
      WHERE status='succeeded' AND locale IS NOT NULL AND created_at >= ?
      GROUP BY task, locale, prompt_version ORDER BY drifted DESC, total DESC LIMIT 20`)
      .bind(new Date(Date.now() - 30 * 86_400_000).toISOString()).all<Record<string, unknown>>(),
  ]);
  const now = Date.now();
  const daysAgo = (days: number) => new Date(now - days * 86_400_000).toISOString();
  const trialDays = Number(await settingValue<number>(env, "trial_days", 7)) || 7;
  // Retention & conversion: activity = a completed training session, the one
  // behavior the whole product exists to produce.
  const [active7, active30, trialUsers, paidSubscriptions, remindersSent7, lettersSent7] = await Promise.all([
    db.prepare(`SELECT COUNT(DISTINCT user_id) AS value FROM workout_occurrence_sessions WHERE status='completed' AND completed_at>=?`).bind(daysAgo(7)).first<{ value: number }>(),
    db.prepare(`SELECT COUNT(DISTINCT user_id) AS value FROM workout_occurrence_sessions WHERE status='completed' AND completed_at>=?`).bind(daysAgo(30)).first<{ value: number }>(),
    db.prepare(`SELECT COUNT(*) AS value FROM users WHERE created_at>=? AND id NOT IN (SELECT user_id FROM subscriptions WHERE status IN ('active','trialing','in_grace_period'))`).bind(daysAgo(trialDays)).first<{ value: number }>(),
    db.prepare("SELECT COUNT(DISTINCT user_id) AS value FROM subscriptions WHERE status IN ('active','trialing','in_grace_period')").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM notification_log WHERE kind='training' AND sent_at>=?").bind(daysAgo(7)).first<{ value: number }>().catch(() => null),
    db.prepare("SELECT COUNT(*) AS value FROM notification_log WHERE kind='letter' AND sent_at>=?").bind(daysAgo(7)).first<{ value: number }>().catch(() => null),
  ]);
  const [coachBriefs, coachCheckins, pendingCoachActions, acceptedCoachActions, rejectedCoachActions, failedCoachActions, positiveCoachFeedback, negativeCoachFeedback, coachSafetyBlocks, coachEvaluations] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS value FROM coach_daily_briefs").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM coach_checkins").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM coach_action_proposals WHERE status='pending'").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM coach_action_proposals WHERE status='accepted'").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM coach_action_proposals WHERE status='rejected'").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM coach_action_proposals WHERE status='failed'").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM coach_feedback WHERE rating=1").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM coach_feedback WHERE rating=-1").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM coach_evaluation_runs WHERE safety_passed=0").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM coach_evaluation_runs").first<{ value: number }>(),
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
      subscriptions: Number(subscriptions?.value || 0),
      revenueUsd: Number(revenue?.value || 0) / 100,
      failedBilling: Number(failedBilling?.value || 0),
      trainingActive7d: Number(active7?.value || 0),
      trainingActive30d: Number(active30?.value || 0),
      usersInTrial: Number(trialUsers?.value || 0),
      payingUsers: Number(paidSubscriptions?.value || 0),
      remindersSent7d: Number(remindersSent7?.value || 0),
      coachLettersSent7d: Number(lettersSent7?.value || 0),
      meals: Number(meals?.value || 0),
      mealAnalyses: Number(mealAnalyses?.value || 0),
      mealAnalysisSuccessRate: Number(mealAnalyses?.value || 0)
        ? Math.round(((Number(mealAnalyses?.value || 0) - Number(failedMealAnalyses?.value || 0)) / Number(mealAnalyses?.value || 0)) * 100)
        : 0,
      lowConfidenceMeals: Number(lowConfidenceMeals?.value || 0),
      aiCostUsd: Number(Number(aiCost?.value || 0).toFixed(4)),
      redemptions: Number(redemptions?.value || 0),
      onboardingCompleted: Number(onboardingCompleted?.value || 0),
      coachConversations: Number(coachConversations?.value || 0),
      coachMessages: Number(coachMessages?.value || 0),
      coachBriefs: Number(coachBriefs?.value || 0),
      coachCheckins: Number(coachCheckins?.value || 0),
      pendingCoachActions: Number(pendingCoachActions?.value || 0),
      acceptedCoachActions: Number(acceptedCoachActions?.value || 0),
      rejectedCoachActions: Number(rejectedCoachActions?.value || 0),
      failedCoachActions: Number(failedCoachActions?.value || 0),
      coachActionAcceptanceRate: Number(acceptedCoachActions?.value || 0) + Number(rejectedCoachActions?.value || 0)
        ? Math.round(Number(acceptedCoachActions?.value || 0) / (Number(acceptedCoachActions?.value || 0) + Number(rejectedCoachActions?.value || 0)) * 100) : 0,
      positiveCoachFeedback: Number(positiveCoachFeedback?.value || 0),
      negativeCoachFeedback: Number(negativeCoachFeedback?.value || 0),
      coachSafetyBlocks: Number(coachSafetyBlocks?.value || 0),
      coachEvaluations: Number(coachEvaluations?.value || 0),
      weeklyReviews: Number(weeklyReviews?.value || 0),
      acceptedReviews: Number(acceptedReviews?.value || 0),
      devices: Number(devices?.value || 0),
      workoutSets: Number(workoutSets?.value || 0),
      beginnerProfiles: Number(beginnerProfiles?.value || 0),
      hypertrophyProfiles: Number(hypertrophyProfiles?.value || 0),
      foodSearches: Number(foodSearches?.value || 0),
      foodZeroResultRate: Number(foodSearches?.value || 0) ? Math.round(Number(zeroFoodSearches?.value || 0) / Number(foodSearches?.value || 1) * 100) : 0,
      pendingFoodCorrections: Number(pendingFoodCorrections?.value || 0),
      customFoods: Number(customFoods?.value || 0),
    },
    recentUsers: (recentUsers.results || []).map((row) => ({ ...row, createdAt: row.created_at })),
    recentPlans: (recentPlans.results || []).map((row) => ({ id: row.id, userId: row.user_id, source: row.source, model: row.model, createdAt: row.created_at })),
    recentRuns: (recentRuns.results || []).map((row) => ({
      id: row.id, status: row.status, model: row.model, latencyMs: row.latency_ms,
      requestId: row.request_id, errorCode: row.error_code, createdAt: row.created_at,
    })),
    recentBilling: recentBilling.results || [],
    recentAudits: (recentAudits.results || []).map((row) => ({
      ...row,
      detail: parseJson<unknown>(row.detail_json as string | null),
    })),
    aiRoutes: (routes.results || []).map((row) => ({ ...row, enabled: Boolean(row.enabled) })),
    recentMaintenance: maintenance.results || [],
    foodSources: foodSources.results || [],
    localeDrift: localeDrift.results || [],
  };
}

export async function adminSummary(env: WorkerEnv): Promise<Record<string, number>> {
  return (await adminOverview(env)).metrics;
}

export async function adminUsers(env: WorkerEnv, query: string, limit = 30) {
  const term = `%${query.slice(0, 100)}%`;
  const result = await requireDb(env).prepare(`SELECT id, cmine_sub, email, name, role, cmine_role, status, locale, timezone, created_at, updated_at
    FROM users WHERE (? = '%%' OR email LIKE ? OR name LIKE ? OR cmine_sub LIKE ?)
    ORDER BY created_at DESC LIMIT ?`).bind(term, term, term, term, Math.min(50, Math.max(1, limit)))
    .all<{ id: string; cmine_sub: string; email: string | null; name: string | null; role: string; cmine_role: string; status: string; locale: string; timezone: string; created_at: string; updated_at: string }>();
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

export async function adminAuditEvents(env: WorkerEnv, limit = 100) {
  const rows = await requireDb(env).prepare(`SELECT id, admin_email, action, target_type, target_id, detail_json, created_at
    FROM admin_audit_events ORDER BY created_at DESC LIMIT ?`).bind(Math.min(200, Math.max(1, limit))).all<Record<string, unknown>>();
  return (rows.results || []).map((row) => ({ ...row, detail: parseJson<unknown>(row.detail_json as string | null) }));
}

export async function updateAiRoute(env: WorkerEnv, routeId: string, input: {
  provider: "cloudflare" | "openai" | "compatible";
  model: string;
  enabled: boolean;
}, adminEmail: string): Promise<boolean> {
  const db = requireDb(env);
  const existing = await db.prepare("SELECT id FROM ai_routes WHERE id = ?").bind(routeId).first<{ id: string }>();
  if (!existing) return false;
  await db.prepare("UPDATE ai_routes SET provider = ?, model = ?, enabled = ?, updated_at = ? WHERE id = ?")
    .bind(input.provider, input.model.slice(0, 160), input.enabled ? 1 : 0, new Date().toISOString(), routeId).run();
  await recordAdminAudit(env, adminEmail, "ai.route.update", "ai_route", routeId, input);
  return true;
}

export async function exportUserData(env: WorkerEnv, user: StoredUser) {
  const db = requireDb(env);
  const [snapshot, consents, workouts, completions, conversations, messages, reviews, planVersions, devices, healthConnections, healthObservations] = await Promise.all([
    accountSnapshot(env, user),
    db.prepare("SELECT disclaimer_version, locale, consented_at FROM consents WHERE user_id = ? ORDER BY consented_at DESC")
      .bind(user.id).all<Record<string, unknown>>(),
    db.prepare("SELECT plan_id, day_index, status, duration_minutes, rpe, pain, notes, completed_at FROM workout_sessions WHERE user_id = ? ORDER BY updated_at DESC")
      .bind(user.id).all<Record<string, unknown>>(),
    db.prepare("SELECT plan_id, day_index, exercise_id, completed_at FROM workout_completions WHERE user_id = ? ORDER BY completed_at DESC")
      .bind(user.id).all<Record<string, unknown>>(),
    db.prepare("SELECT id,title,status,created_at,updated_at FROM coach_conversations WHERE user_id=? ORDER BY updated_at DESC").bind(user.id).all<Record<string, unknown>>(),
    db.prepare("SELECT conversation_id,role,content,created_at FROM coach_messages WHERE user_id=? ORDER BY created_at").bind(user.id).all<Record<string, unknown>>(),
    db.prepare("SELECT week_start,status,checkin_json,metrics_json,recommendation_json,plateau,created_at,updated_at FROM weekly_reviews WHERE user_id=? ORDER BY week_start DESC").bind(user.id).all<Record<string, unknown>>(),
    db.prepare("SELECT cycle_id,plan_id,version_number,status,change_summary_json,created_at,activated_at FROM plan_versions WHERE user_id=? ORDER BY created_at DESC").bind(user.id).all<Record<string, unknown>>(),
    db.prepare("SELECT id,platform,name,last_seen_at,created_at FROM devices WHERE user_id=? ORDER BY created_at DESC").bind(user.id).all<Record<string, unknown>>(),
    db.prepare("SELECT id,platform,permissions_json,status,created_at,updated_at FROM health_connections WHERE user_id=?").bind(user.id).all<Record<string, unknown>>(),
    db.prepare("SELECT connection_id,source_record_id,type,value,unit,observed_at,source_name FROM health_observations WHERE user_id=? ORDER BY observed_at DESC").bind(user.id).all<Record<string, unknown>>(),
  ]);
  return { exportedAt: new Date().toISOString(), ...snapshot, consents: consents.results || [], workouts: workouts.results || [], completions: completions.results || [],
    coach: { conversations: conversations.results || [], messages: messages.results || [] }, reviews: reviews.results || [], planVersions: planVersions.results || [],
    devices: devices.results || [], health: { connections: healthConnections.results || [], observations: healthObservations.results || [] } };
}

export async function deleteUserData(env: WorkerEnv, userId: string): Promise<void> {
  if (env.DB && env.R2) {
    const images = await env.DB.prepare("SELECT object_key FROM meal_images WHERE user_id = ?").bind(userId).all<{ object_key: string }>();
    await Promise.all((images.results || []).map((image) => env.R2!.delete(image.object_key).catch(() => undefined)));
  }
  await requireDb(env).prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
}
