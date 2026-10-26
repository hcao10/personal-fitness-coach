import type { Profile } from "../../packages/coach-core/src";
import type { WorkerEnv } from "../platform";
import type { StoredUser } from "../db";
import { saveProfile } from "../db";

const allowedStatus = new Set(["not_started", "in_progress", "completed", "skipped"]);

export async function onboardingSnapshot(env: WorkerEnv, user: StoredUser) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const [state, draft] = await Promise.all([
    env.DB.prepare(`SELECT onboarding_status, onboarding_step, onboarding_version,
      onboarding_completed_at, onboarding_skipped_at FROM users WHERE id = ?`).bind(user.id).first<{
      onboarding_status: string; onboarding_step: number; onboarding_version: number;
      onboarding_completed_at: string | null; onboarding_skipped_at: string | null;
    }>(),
    env.DB.prepare("SELECT data_json, source, updated_at FROM onboarding_drafts WHERE user_id = ?").bind(user.id)
      .first<{ data_json: string; source: string; updated_at: string }>(),
  ]);
  return {
    status: allowedStatus.has(state?.onboarding_status || "") ? state!.onboarding_status : "not_started",
    step: Number(state?.onboarding_step || 0), version: Number(state?.onboarding_version || 1),
    completedAt: state?.onboarding_completed_at || null, skippedAt: state?.onboarding_skipped_at || null,
    draft: draft ? JSON.parse(draft.data_json) : {}, source: draft?.source || "guided", updatedAt: draft?.updated_at || null,
  };
}

export async function saveOnboardingDraft(env: WorkerEnv, userId: string, input: {
  step: number; data: Record<string, unknown>; source?: "guided" | "homepage_intake";
}) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const serialized = JSON.stringify(input.data);
  if (serialized.length > 12_000) throw new Error("ONBOARDING_DRAFT_TOO_LARGE");
  const step = Math.max(0, Math.min(6, Math.round(input.step)));
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO onboarding_drafts (user_id, data_json, source, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET data_json=excluded.data_json, source=excluded.source, updated_at=excluded.updated_at`)
      .bind(userId, serialized, input.source === "homepage_intake" ? "homepage_intake" : "guided", now),
    env.DB.prepare(`UPDATE users SET onboarding_status='in_progress', onboarding_step=?, updated_at=? WHERE id=?`)
      .bind(step, now, userId),
  ]);
  return { status: "in_progress", step, updatedAt: now };
}

export async function completeOnboarding(env: WorkerEnv, userId: string, profile: Profile) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const now = new Date().toISOString();
  await saveProfile(env, userId, profile);
  await env.DB.batch([
    env.DB.prepare(`UPDATE users SET onboarding_status='completed', onboarding_step=6,
      onboarding_completed_at=?, onboarding_skipped_at=NULL, updated_at=? WHERE id=?`).bind(now, now, userId),
    env.DB.prepare("DELETE FROM onboarding_drafts WHERE user_id = ?").bind(userId),
  ]);
  return { status: "completed", completedAt: now, profile };
}

export async function skipOnboarding(env: WorkerEnv, userId: string) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE users SET onboarding_status='skipped', onboarding_skipped_at=?, updated_at=? WHERE id=?`)
    .bind(now, now, userId).run();
  return { status: "skipped", skippedAt: now };
}
