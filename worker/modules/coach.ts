import { executeSessionChange } from '../coach/execute.ts';
import { EXERCISES, isExerciseAllowed, type CoachPlan, type Profile } from "../../packages/coach-core/src";
import type { WorkerEnv } from "../platform";
import { activeCycleForUser, localDateInTimezone, occurrenceForDate, rescheduleOccurrence, savePlan, setOccurrenceMode } from "../db";

function parseJson<T>(value: string | null): T | null { try { return value ? JSON.parse(value) as T : null; } catch { return null; } }

export async function listConversations(env: WorkerEnv, userId: string) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const rows = await env.DB.prepare(`SELECT id, title, status, created_at, updated_at FROM coach_conversations
    WHERE user_id=? ORDER BY updated_at DESC LIMIT 30`).bind(userId)
    .all<{ id: string; title: string; status: string; created_at: string; updated_at: string }>();
  return (rows.results || []).map((row) => ({ id: row.id, title: row.title, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at }));
}

export async function createConversation(env: WorkerEnv, userId: string, title = "新的对话") {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO coach_conversations (id,user_id,title,status,created_at,updated_at)
    VALUES (?,?,?,'active',?,?)`).bind(id, userId, title.trim().slice(0, 80) || "新的对话", now, now).run();
  return { id, title: title.trim().slice(0, 80) || "新的对话", status: "active", createdAt: now, updatedAt: now };
}

async function ownedConversation(env: WorkerEnv, userId: string, conversationId: string) {
  return env.DB?.prepare("SELECT id, summary FROM coach_conversations WHERE id=? AND user_id=?")
    .bind(conversationId, userId).first<{ id: string; summary: string | null }>();
}

export async function conversationMessages(env: WorkerEnv, userId: string, conversationId: string, before?: string | null) {
  if (!env.DB || !await ownedConversation(env, userId, conversationId)) throw new Error("CONVERSATION_NOT_FOUND");
  const rows = await env.DB.prepare(`SELECT m.id,m.role,m.content,m.metadata_json,m.content_locale,m.created_at FROM coach_messages m
    WHERE m.conversation_id=? AND m.user_id=? ${before ? "AND m.created_at < ?" : ""}
    ORDER BY m.created_at DESC LIMIT 50`).bind(...(before ? [conversationId, userId, before] : [conversationId, userId]))
    .all<{ id: string; role: "user" | "assistant"; content: string; metadata_json: string; content_locale: string | null; created_at: string }>();
  const messages = [...(rows.results || [])].reverse();
  const ids = messages.map((item) => item.id);
  let actions: Array<{ id: string; message_id: string; action_type: string; payload_json: string; status: string; base_version_id: string | null; expires_at: string | null }> = [];
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    const result = await env.DB.prepare(`SELECT id,message_id,action_type,payload_json,status,base_version_id,expires_at FROM coach_action_proposals
      WHERE user_id=? AND message_id IN (${placeholders})`).bind(userId, ...ids).all<typeof actions[number]>();
    actions = result.results || [];
  }
  return messages.map((message) => { const metadata = parseJson<{ intent?: string; basis?: unknown[]; limitations?: string[]; sources?: unknown[] }>(message.metadata_json) || {};
    // null means "written before the column existed" — not "same as yours".
    return { id: message.id, role: message.role, content: message.content, contentLocale: message.content_locale, createdAt: message.created_at, ...metadata,
      actions: actions.filter((action) => action.message_id === message.id).map((action) => ({ id: action.id, type: action.action_type, status: action.status, payload: parseJson<Record<string, unknown>>(action.payload_json) || {}, baseVersionId: action.base_version_id, expiresAt: action.expires_at })) };
  });
}


export { sendCoachMessage } from '../coach/send.ts';

function adjustedPlanForAction(plan: CoachPlan, profile: Profile, type: string, payload: Record<string, unknown>): CoachPlan {
  const next = structuredClone(plan);
  if (type === "replace_exercise") {
    const exerciseId = String(payload.exerciseId || ""); const replacementId = String(payload.replacementExerciseId || "");
    const replacement = EXERCISES[replacementId];
    if (!exerciseId || !replacement || !isExerciseAllowed(replacement, profile.equipment)) throw new Error("INVALID_EXERCISE_REPLACEMENT");
    let changed = false;
    next.schedule = next.schedule.map((day) => ({ ...day, exercises: day.exercises.map((exercise) => {
      if (exercise.id !== exerciseId || changed) return exercise; changed = true;
      return { ...replacement, sets: exercise.sets, reps: exercise.reps, rest: exercise.rest, restSeconds: exercise.restSeconds,
        targetRir: exercise.targetRir, progression: exercise.progression, suggestedLoadMultiplier: exercise.suggestedLoadMultiplier };
    }) }));
    if (!changed) throw new Error("EXERCISE_NOT_IN_PLAN");
  }
  if (type === "adjust_load" || type === "plan_adjustment") {
    const load = Math.max(.8, Math.min(1.05, Number(payload.loadMultiplier || 1)));
    const sets = Math.max(.8, Math.min(1.1, Number(payload.setMultiplier || 1)));
    next.schedule = next.schedule.map((day) => ({ ...day, exercises: day.exercises.map((exercise) => ({
      ...exercise, sets: Math.max(2, Math.min(5, Math.round(exercise.sets * sets))), suggestedLoadMultiplier: load,
    })) }));
  }
  return next;
}

export async function decideCoachAction(env: WorkerEnv, userId: string, actionId: string, decision: "accepted" | "rejected") {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const action = await env.DB.prepare(`SELECT id,action_type,payload_json,status,base_version_id,expires_at FROM coach_action_proposals WHERE id=? AND user_id=?`)
    .bind(actionId, userId).first<{ id: string; action_type: string; payload_json: string; status: string; base_version_id: string | null; expires_at: string | null }>();
  if (!action) throw new Error("ACTION_NOT_FOUND");
  if (action.status !== "pending") return { id: action.id, status: action.status, duplicate: true };
  const now = new Date().toISOString(); const payload = parseJson<Record<string, unknown>>(action.payload_json) || {};
  if (action.expires_at && action.expires_at <= now) {
    await env.DB.prepare("UPDATE coach_action_proposals SET status='expired',decided_at=? WHERE id=? AND user_id=?").bind(now, actionId, userId).run();
    return { id: action.id, type: action.action_type, status: "expired", payload, duplicate: false };
  }
  if (payload.scope === 'occurrence') return executeSessionChange(env, userId, action, decision);
  if (decision === "rejected") {
    await env.DB.prepare("UPDATE coach_action_proposals SET status='rejected',decided_at=? WHERE id=? AND user_id=?").bind(now, actionId, userId).run();
    return { id: action.id, type: action.action_type, status: "rejected", payload, duplicate: false };
  }
  if (['replace_exercise','shorten_session','adjust_load'].includes(action.action_type)) throw new Error('ACTION_PREVIEW_REQUIRED');
  const active = await activeCycleForUser(env, userId);
  const versionedTypes = new Set(["replace_exercise", "adjust_load", "plan_adjustment"]);
  if (versionedTypes.has(action.action_type) && action.base_version_id && active?.versionId !== action.base_version_id) {
    await env.DB.prepare("UPDATE coach_action_proposals SET status='expired',decided_at=? WHERE id=? AND user_id=?").bind(now, actionId, userId).run();
    return { id: action.id, type: action.action_type, status: "expired", payload, error: "ACTION_STALE", duplicate: false };
  }
  let draftId: string | null = null; let draftUrl: string | null = null; let result: Record<string, unknown> = {};
  try {
    if (versionedTypes.has(action.action_type)) {
      if (!active?.plan || !active.profile) throw new Error("ACTIVE_PLAN_REQUIRED");
      const nextPlan = adjustedPlanForAction(active.plan as CoachPlan, active.profile as Profile, action.action_type, payload);
      draftId = await savePlan(env, userId, active.profile as Profile, nextPlan, "coach_action", "rules+coach", {
        startDate: active.startDate, timezone: active.timezone, changeSummary: [String(payload.after || payload.title || "Coach 建议的计划调整")],
      });
      draftUrl = "/account#plans"; result = { planId: draftId, status: "draft" };
    } else if (action.action_type === "shorten_session") {
      const occurrence = active ? await occurrenceForDate(env, userId, localDateInTimezone(active.timezone)) : null;
      if (!occurrence) throw new Error("OCCURRENCE_NOT_FOUND");
      result = await setOccurrenceMode(env, userId, occurrence.id, "short"); draftUrl = "/today";
    } else if (action.action_type === "reschedule_workout") {
      const occurrence = active ? await occurrenceForDate(env, userId, localDateInTimezone(active.timezone)) : null;
      const targetDate = String(payload.targetDate || ""); if (!occurrence || !targetDate) throw new Error("INVALID_RESCHEDULE");
      result = await rescheduleOccurrence(env, userId, occurrence.id, targetDate); draftUrl = "/today";
    } else if (action.action_type === "schedule_review") {
      if (!active) throw new Error("ACTIVE_PLAN_REQUIRED");
      const today = localDateInTimezone(active.timezone); const days = Math.max(0, Math.floor((new Date(`${today}T00:00:00Z`).getTime() - new Date(`${active.startDate}T00:00:00Z`).getTime()) / 86_400_000));
      const weekStart = new Date(new Date(`${active.startDate}T00:00:00Z`).getTime() + Math.floor(days / 7) * 7 * 86_400_000).toISOString().slice(0, 10);
      await env.DB.prepare(`INSERT OR IGNORE INTO weekly_reviews (id,user_id,cycle_id,week_start,status,created_at,updated_at) VALUES (?,?,?,?,'due',?,?)`)
        .bind(crypto.randomUUID(), userId, active.id, weekStart, now, now).run(); draftUrl = "/progress#weekly-review"; result = { weekStart };
    } else if (action.action_type === "create_meal_draft") {
      draftId = crypto.randomUUID();
      await env.DB.prepare(`INSERT OR IGNORE INTO coach_record_drafts (id,user_id,action_id,draft_type,payload_json,status,created_at,updated_at)
        VALUES (?,?,?,'meal',?,'draft',?,?)`).bind(draftId, userId, actionId, JSON.stringify(payload), now, now).run();
      draftUrl = "/nutrition#coach-meal-draft"; result = { draftId };
    } else if (action.action_type === "log_workout") {
      const occurrence = active ? await occurrenceForDate(env, userId, localDateInTimezone(active.timezone)) : null;
      if (!active || !occurrence) throw new Error("OCCURRENCE_NOT_FOUND");
      draftId = crypto.randomUUID();
      await env.DB.prepare(`INSERT INTO workout_occurrence_sessions (id,occurrence_id,user_id,plan_id,status,notes,started_at,updated_at)
        VALUES (?,?,?,?, 'in_progress',?,?,?) ON CONFLICT(occurrence_id) DO UPDATE SET status='in_progress',notes=excluded.notes,updated_at=excluded.updated_at`)
        .bind(draftId, occurrence.id, userId, active.planId, String(payload.description || "Coach 创建的训练草稿").slice(0, 500), now, now).run();
      draftUrl = "/today"; result = { sessionId: draftId, occurrenceId: occurrence.id };
    } else if (action.action_type === "log_measurement") {
      draftId = crypto.randomUUID();
      await env.DB.prepare(`INSERT OR IGNORE INTO coach_record_drafts (id,user_id,action_id,draft_type,payload_json,status,created_at,updated_at)
        VALUES (?,?,?,'measurement',?,'draft',?,?)`).bind(draftId, userId, actionId, JSON.stringify(payload), now, now).run();
      draftUrl = "/progress#measurements"; result = { draftId };
    }
    await env.DB.batch([
      env.DB.prepare("UPDATE coach_action_proposals SET status='accepted',decided_at=? WHERE id=? AND user_id=?").bind(now, actionId, userId),
      env.DB.prepare("INSERT OR IGNORE INTO coach_action_executions (id,action_id,user_id,status,result_json,executed_at) VALUES (?,?,?,'succeeded',?,?)")
        .bind(crypto.randomUUID(), actionId, userId, JSON.stringify(result), now),
    ]);
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 80) : "ACTION_EXECUTION_FAILED";
    await env.DB.batch([
      env.DB.prepare("UPDATE coach_action_proposals SET status='failed',decided_at=? WHERE id=? AND user_id=?").bind(now, actionId, userId),
      env.DB.prepare("INSERT OR IGNORE INTO coach_action_executions (id,action_id,user_id,status,result_json,error_code,executed_at) VALUES (?,?,?,'failed','{}',?,?)")
        .bind(crypto.randomUUID(), actionId, userId, code, now),
    ]);
    throw new Error(code);
  }
  return { id: action.id, type: action.action_type, status: "accepted", payload, createdDraft: Boolean(draftId), draftId, draftUrl, result };
}
