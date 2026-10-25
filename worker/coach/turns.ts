import type { WorkerEnv } from '../platform.ts';

type TurnRow = { id: string; status: string; attempt_id: string; input_json: string; user_message_id: string;
  assistant_message_id: string | null; result_json: string | null; error_code: string | null; lease_until: string };

export async function claimTurn(env: WorkerEnv, userId: string, conversationId: string, mutationId: string, inputJson: string, retry: boolean) {
  const db = env.DB!; const now = new Date().toISOString();
  const id = crypto.randomUUID(); const attemptId = crypto.randomUUID(); const messageId = crypto.randomUUID();
  await db.prepare(`INSERT OR IGNORE INTO coach_turns
    (id,user_id,conversation_id,client_mutation_id,input_json,user_message_id,status,attempt_id,lease_until,created_at,updated_at)
    VALUES (?,?,?,?,?,?,'running',?,?,?,?)`).bind(id, userId, conversationId, mutationId, inputJson, messageId, attemptId,
      new Date(Date.now() + 120000).toISOString(), now, now).run();
  let row = await db.prepare('SELECT * FROM coach_turns WHERE user_id=? AND conversation_id=? AND client_mutation_id=?')
    .bind(userId, conversationId, mutationId).first<TurnRow>();
  if (!row) throw new Error('COACH_TURN_NOT_FOUND');
  if (row.input_json !== inputJson) throw new Error('COACH_MUTATION_CONFLICT');
  if (row.status === 'completed' && row.result_json) return { row, duplicate: true };
  if (row.attempt_id !== attemptId) {
    if (!retry) throw new Error(row.status === 'running' ? 'COACH_TURN_RUNNING' : 'COACH_RETRY_REQUIRED');
    if (row.status === 'running' && row.lease_until > now) throw new Error('COACH_TURN_RUNNING');
    await db.prepare(`UPDATE coach_turns SET status='running',attempt_id=?,error_code=NULL,lease_until=?,updated_at=?
      WHERE id=? AND user_id=? AND (status IN ('failed','cancelled') OR (status='running' AND lease_until<=?))`)
      .bind(attemptId, new Date(Date.now() + 120000).toISOString(), now, row.id, userId, now).run();
    row = (await db.prepare('SELECT * FROM coach_turns WHERE id=?').bind(row.id).first<TurnRow>())!;
    if (row.attempt_id !== attemptId) throw new Error('COACH_TURN_RUNNING');
  }
  return { row, duplicate: false };
}
