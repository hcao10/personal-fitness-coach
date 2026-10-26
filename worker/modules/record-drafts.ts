import type { MeasurementInput } from "../db";
import { addMeasurement } from "../db";
import type { WorkerEnv } from "../platform";

function parseJson<T>(value: string): T | null { try { return JSON.parse(value) as T; } catch { return null; } }

export async function recordDraftsForUser(env: WorkerEnv, userId: string, type?: string | null) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const rows = await env.DB.prepare(`SELECT id,action_id,draft_type,payload_json,status,created_at,updated_at
    FROM coach_record_drafts WHERE user_id=? AND status='draft' ${type ? "AND draft_type=?" : ""}
    ORDER BY created_at DESC LIMIT 20`).bind(...(type ? [userId, type] : [userId])).all<{
      id: string; action_id: string; draft_type: string; payload_json: string; status: string; created_at: string; updated_at: string;
    }>();
  return (rows.results || []).map((row) => ({ id: row.id, actionId: row.action_id, type: row.draft_type,
    payload: parseJson<Record<string, unknown>>(row.payload_json) || {}, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at }));
}

export async function confirmMeasurementDraft(env: WorkerEnv, userId: string, draftId: string, measurement: MeasurementInput) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const draft = await env.DB.prepare(`SELECT id,status FROM coach_record_drafts
    WHERE id=? AND user_id=? AND draft_type='measurement'`).bind(draftId, userId).first<{ id: string; status: string }>();
  if (!draft) throw new Error("DRAFT_NOT_FOUND");
  if (draft.status !== "draft") return { draftId, status: draft.status, duplicate: true };
  const saved = await addMeasurement(env, userId, measurement);
  await env.DB.prepare("UPDATE coach_record_drafts SET status='confirmed',updated_at=? WHERE id=? AND user_id=? AND status='draft'")
    .bind(new Date().toISOString(), draftId, userId).run();
  return { draftId, status: "confirmed", duplicate: false, measurement: saved };
}

export async function rejectRecordDraft(env: WorkerEnv, userId: string, draftId: string) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const draft = await env.DB.prepare("SELECT id,status FROM coach_record_drafts WHERE id=? AND user_id=?")
    .bind(draftId, userId).first<{ id: string; status: string }>();
  if (!draft) throw new Error("DRAFT_NOT_FOUND");
  if (draft.status === "draft") await env.DB.prepare("UPDATE coach_record_drafts SET status='rejected',updated_at=? WHERE id=? AND user_id=?")
    .bind(new Date().toISOString(), draftId, userId).run();
  return { draftId, status: draft.status === "draft" ? "rejected" : draft.status };
}

export async function completeRecordDraft(env: WorkerEnv, userId: string, draftId: string) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const draft = await env.DB.prepare("SELECT id,status FROM coach_record_drafts WHERE id=? AND user_id=?")
    .bind(draftId, userId).first<{ id: string; status: string }>();
  if (!draft) throw new Error("DRAFT_NOT_FOUND");
  if (draft.status === "draft") await env.DB.prepare("UPDATE coach_record_drafts SET status='confirmed',updated_at=? WHERE id=? AND user_id=?")
    .bind(new Date().toISOString(), draftId, userId).run();
  return { draftId, status: draft.status === "draft" ? "confirmed" : draft.status };
}
