import type { WorkerEnv } from '../platform.ts';
import { loadTodaySession, previewChange, type SessionPreview } from './session.ts';
import { changeSchema } from './validation.ts';

/** A single SQLite/D1 transaction guards both the side effect and its receipt. */
export async function executeSessionChange(env: WorkerEnv, userId: string, action: { id: string; payload_json: string }, decision: 'accepted' | 'rejected') {
  if (decision === 'accepted' && env.COACH_RUNTIME_PAUSED === 'true') throw new Error('COACH_RUNTIME_PAUSED');
  const db = env.DB!; const now = new Date().toISOString();
  if (decision === 'rejected') {
    await db.prepare("UPDATE coach_action_proposals SET status='rejected',decided_at=? WHERE id=? AND user_id=? AND status='pending'").bind(now, action.id, userId).run();
  } else {
    const payload = JSON.parse(action.payload_json) as SessionPreview;
    const session = await loadTodaySession(env, userId, { occurrenceId: payload.occurrenceId, planId: payload.planId, baseVersionId: payload.versionId });
    const stale = !session || session.revision !== payload.baseRevision || session.date !== payload.scheduledDate;
    if (stale) {
      await db.prepare("UPDATE coach_action_proposals SET status='expired',decided_at=? WHERE id=? AND user_id=? AND status='pending'").bind(now, action.id, userId).run();
      return { id: action.id, status: 'expired', error: 'ACTION_STALE' };
    }
    // Recompute, then require exact agreement with what the user reviewed.
    const preview = previewChange(session, changeSchema.parse(payload.change), 'en', false);
    if (JSON.stringify(preview.afterWorkout) !== JSON.stringify(payload.afterWorkout) || JSON.stringify(preview.beforeWorkout) !== JSON.stringify(payload.beforeWorkout)) throw new Error('ACTION_PREVIEW_MISMATCH');
    const before = JSON.stringify(payload.beforeWorkout); const after = JSON.stringify(payload.afterWorkout);
    await db.batch([
      db.prepare(`INSERT OR IGNORE INTO coach_session_changes (action_id,user_id,occurrence_id,base_revision,result_revision,before_json,after_json,created_at)
        SELECT a.id,a.user_id,o.id,o.revision,o.revision+1,?,?,? FROM coach_action_proposals a
        JOIN workout_occurrences o ON o.id=? AND o.user_id=a.user_id
        JOIN plan_cycles c ON c.id=o.cycle_id AND c.active_version_id=o.version_id AND c.status='active'
        WHERE a.id=? AND a.user_id=? AND a.status='pending' AND a.expires_at>? AND o.revision=? AND o.scheduled_date=?
          AND o.version_id=? AND o.status IN ('scheduled','rescheduled')
          AND NOT EXISTS(SELECT 1 FROM workout_occurrence_sets s WHERE s.occurrence_id=o.id)
          AND NOT EXISTS(SELECT 1 FROM workout_occurrence_sessions s WHERE s.occurrence_id=o.id)`)
        .bind(before, after, now, payload.occurrenceId, action.id, userId, now, payload.baseRevision, payload.scheduledDate, payload.versionId),
      db.prepare(`UPDATE workout_occurrences SET workout_override_json=?,mode='standard',revision=revision+1,updated_at=?
        WHERE id=? AND user_id=? AND revision=? AND EXISTS(SELECT 1 FROM coach_session_changes sc JOIN coach_action_proposals a ON a.id=sc.action_id
          WHERE sc.action_id=? AND a.status='pending')`).bind(after, now, payload.occurrenceId, userId, payload.baseRevision, action.id),
      db.prepare(`INSERT OR IGNORE INTO coach_action_executions (id,action_id,user_id,status,result_json,executed_at)
        SELECT ?,sc.action_id,sc.user_id,'succeeded',?,? FROM coach_session_changes sc
        JOIN workout_occurrences o ON o.id=sc.occurrence_id AND o.revision=sc.result_revision
        WHERE sc.action_id=?`).bind(crypto.randomUUID(), JSON.stringify({ occurrenceId: payload.occurrenceId, revision: payload.baseRevision + 1, scope: 'occurrence' }), now, action.id),
      db.prepare(`UPDATE coach_action_proposals SET status='accepted',decided_at=? WHERE id=? AND user_id=? AND status='pending'
        AND EXISTS(SELECT 1 FROM coach_action_executions e WHERE e.action_id=coach_action_proposals.id AND e.status='succeeded')`).bind(now, action.id, userId),
    ]);
  }
  const row = await db.prepare('SELECT status FROM coach_action_proposals WHERE id=? AND user_id=?').bind(action.id, userId).first<{ status: string }>();
  if (row?.status === 'pending') {
    await db.prepare("UPDATE coach_action_proposals SET status='expired',decided_at=? WHERE id=? AND user_id=? AND status='pending'").bind(now, action.id, userId).run();
    throw new Error('SESSION_ALREADY_STARTED_OR_CHANGED');
  }
  return { id: action.id, status: row?.status || 'failed', draftUrl: '/today', result: { scope: 'occurrence' } };
}
