import type { Profile } from "../app/lib/coach";
import type { D1Database, WorkerEnv } from "./platform";
import { parseCookies, sha256 } from "./security";

export type StoredUser = { id: string; sub: string; email: string | null; name: string | null; picture: string | null };

function requireDb(env: WorkerEnv): D1Database {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  return env.DB;
}

export async function upsertCmineUser(env: WorkerEnv, identity: { sub: string; email?: string; name?: string; picture?: string }): Promise<StoredUser> {
  const db = requireDb(env);
  const existing = await db.prepare("SELECT id FROM users WHERE cmine_sub = ?").bind(identity.sub).first<{ id: string }>();
  const id = existing?.id || crypto.randomUUID();
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO users (id, cmine_sub, email, name, picture, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(cmine_sub) DO UPDATE SET email=excluded.email, name=excluded.name, picture=excluded.picture, updated_at=excluded.updated_at`)
    .bind(id, identity.sub, identity.email || null, identity.name || null, identity.picture || null, now, now).run();
  return { id, sub: identity.sub, email: identity.email || null, name: identity.name || null, picture: identity.picture || null };
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
  const row = await env.DB.prepare(`SELECT u.id, u.cmine_sub AS sub, u.email, u.name, u.picture
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id_hash = ? AND s.expires_at > ?`).bind(await sha256(token), new Date().toISOString())
    .first<StoredUser>();
  return row || null;
}

export async function deleteSession(request: Request, env: WorkerEnv): Promise<void> {
  if (!env.DB) return;
  const token = parseCookies(request).cmine_fit_session;
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(await sha256(token)).run();
}

export async function savePlan(env: WorkerEnv, userId: string, profile: Profile, plan: unknown, source: string, model: string): Promise<string> {
  const db = requireDb(env);
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO profiles (user_id, profile_json, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET profile_json=excluded.profile_json, updated_at=excluded.updated_at`)
    .bind(userId, JSON.stringify(profile), now).run();
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO plans (id, user_id, profile_json, plan_json, source, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, userId, JSON.stringify(profile), JSON.stringify(plan), source, model, now).run();
  return id;
}

export async function recordConsent(request: Request, env: WorkerEnv, userId: string | null, locale: string): Promise<void> {
  const db = requireDb(env);
  const ip = request.headers.get("cf-connecting-ip");
  const ipHash = ip && env.SESSION_SECRET ? await sha256(`${env.SESSION_SECRET}:${ip}`) : null;
  await db.prepare("INSERT INTO consents (id, user_id, disclaimer_version, locale, ip_hash, consented_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), userId, "health-v1", locale, ipHash, new Date().toISOString()).run();
}

export async function pointsForUser(env: WorkerEnv, userId: string): Promise<number> {
  if (!env.DB) return 0;
  const result = await env.DB.prepare("SELECT COALESCE(SUM(delta), 0) AS points FROM point_ledger WHERE user_id = ?").bind(userId).first<{ points: number }>();
  return Number(result?.points || 0);
}

export async function adminSummary(env: WorkerEnv): Promise<Record<string, number>> {
  const db = requireDb(env);
  const [users, plans, consents, sessions] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS value FROM users").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM plans").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM consents").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM sessions WHERE expires_at > ?").bind(new Date().toISOString()).first<{ value: number }>(),
  ]);
  return { users: Number(users?.value || 0), plans: Number(plans?.value || 0), consents: Number(consents?.value || 0), activeSessions: Number(sessions?.value || 0) };
}
