import { assessSafety, safetyGuidance, medicalDisclaimer } from '../../packages/domain/src/index.ts';
import { toLocale } from '../../packages/i18n/src/index.ts';
import type { CoachScene } from '../../packages/api-contracts/src/coach-runtime.ts';
import type { WorkerEnv } from '../platform.ts';
import type { StoredUser } from '../db.ts';
import { consumeCapability, refundCapability } from '../product.ts';
import { observedLocale } from '../telemetry.ts';
import { claimTurn } from './turns.ts';
import { runCoach } from './runtime.ts';
import { sceneSchema } from './validation.ts';
import { updateConversationSummary } from '../modules/coach-orchestrator.ts';

export async function sendCoachMessage(env: WorkerEnv, user: StoredUser, conversationId: string, input: {
  message: string; clientMutationId?: string | null; scene?: CoachScene; retry?: boolean;
  signal?: AbortSignal; onDelta?: (delta: string) => void;
  defer?: (work: Promise<void>) => void;
}) {
  if (env.COACH_RUNTIME_PAUSED === 'true') throw new Error('COACH_RUNTIME_PAUSED');
  const db = env.DB;
  if (!db || !await db.prepare('SELECT id FROM coach_conversations WHERE id=? AND user_id=?').bind(conversationId, user.id).first()) throw new Error('CONVERSATION_NOT_FOUND');
  const message = input.message.trim();
  if (!message || message.length > 2000) throw new Error('MESSAGE_REQUIRED');
  const scene = sceneSchema.parse(input.scene || {});
  const mutationId = input.clientMutationId || crypto.randomUUID();
  const { row: turn, duplicate } = await claimTurn(env, user.id, conversationId, mutationId, JSON.stringify({ message, scene }), input.retry === true);
  if (duplicate) return { ...JSON.parse(turn.result_json!) as ReturnType<typeof completeResult>, duplicate: true };
  const signal = AbortSignal.any([input.signal || new AbortController().signal, AbortSignal.timeout(90000)]);
  const now = new Date().toISOString(); const locale = toLocale(user.locale); let charged = false;
  try {
    signal.throwIfAborted();
    await db.prepare(`INSERT OR IGNORE INTO coach_messages (id,conversation_id,user_id,role,content,client_mutation_id,content_locale,created_at)
      VALUES (?,?,?,'user',?,?,?,?)`).bind(turn.user_message_id, conversationId, user.id, message, turn.id, observedLocale(locale, message), now).run();
    const triage = assessSafety(message);
    const emergency = triage.level === 'emergency';
    let generated: Awaited<ReturnType<typeof runCoach>> | null = null;
    if (!emergency) {
      const quota = await consumeCapability(env, user.id, 'coach.chat');
      if (!quota.ok) throw new Error('COACH_LIMIT_REACHED');
      charged = true;
      const history = await db.prepare(`SELECT m.role,m.content FROM coach_messages m
        WHERE m.user_id=? AND m.conversation_id=? AND m.id<>? AND
        (m.role='assistant' OR EXISTS(SELECT 1 FROM coach_turns t WHERE t.user_message_id=m.id AND t.status='completed'))
        ORDER BY m.created_at DESC,m.rowid DESC LIMIT 12`).bind(user.id, conversationId, turn.user_message_id)
        .all<{ role: 'user' | 'assistant'; content: string }>();
      generated = await runCoach(env, user, { turnId: turn.id, attemptId: turn.attempt_id, conversationId, message, scene,
        history: [...(history.results || [])].reverse(), signal, tier: quota.tier });
    }
    signal.throwIfAborted();
    const risky = emergency || triage.highRisk || generated?.safety.highRisk === true;
    const reply = generated ? `${generated.reply}${risky ? `\n\n${safetyGuidance(locale)}` : ''}` : safetyGuidance(locale);
    const assistantId = crypto.randomUUID(); const completedAt = new Date().toISOString();
    const metadata = generated ? { intent: generated.intent, basis: generated.basis, limitations: generated.limitations, safety: { highRisk: risky },
      sources: generated.sources, provenance: { provider: generated.provider, model: generated.model, requestId: generated.requestId, turnId: turn.id } }
      : { intent: 'safety', safety: { highRisk: true }, basis: [], limitations: [medicalDisclaimer(locale)], sources: [] };
    // Under risk, even a model-generated decrease uses the deterministic validator; never accept a raised load.
    const actions = (generated?.actions || []).filter(action => !risky || action.payload.change.type !== 'adjust_load' || action.payload.change.loadMultiplier <= 1)
      .map(action => ({ ...action, status: 'pending' as const, baseVersionId: action.payload.versionId,
        expiresAt: new Date(Date.now() + 2 * 3600000).toISOString() }));
    const result = completeResult(turn.id, turn.user_message_id, assistantId, reply, completedAt, metadata, actions);
    const statements = [
      db.prepare(`INSERT INTO coach_messages (id,conversation_id,user_id,role,content,metadata_json,content_locale,created_at)
        SELECT ?,?,?,'assistant',?,?,?,? WHERE EXISTS(SELECT 1 FROM coach_turns WHERE id=? AND attempt_id=? AND status='running')`)
        .bind(assistantId, conversationId, user.id, reply, JSON.stringify(metadata), generated?.contentLocale || locale, completedAt, turn.id, turn.attempt_id),
      ...actions.map(action => db.prepare(`INSERT INTO coach_action_proposals
        (id,conversation_id,message_id,user_id,action_type,payload_json,base_version_id,reason_codes_json,impact_json,reversible,expires_at,status,created_at)
        SELECT ?,?,?,?,?,?,?,'[]',?,0,?,'pending',? WHERE EXISTS(SELECT 1 FROM coach_messages WHERE id=?)`)
        .bind(action.id, conversationId, assistantId, user.id, action.type, JSON.stringify(action.payload), action.baseVersionId,
          JSON.stringify(action.payload.impact), action.expiresAt, completedAt, assistantId)),
      db.prepare(`UPDATE coach_turns SET status='completed',assistant_message_id=?,result_json=?,updated_at=?
        WHERE id=? AND attempt_id=? AND status='running'`).bind(assistantId, JSON.stringify(result), completedAt, turn.id, turn.attempt_id),
      db.prepare(`UPDATE coach_conversations SET updated_at=?,title=CASE WHEN title IN ('新的对话','New conversation') THEN ? ELSE title END
        WHERE id=? AND user_id=?`).bind(completedAt, message.slice(0, 36), conversationId, user.id),
      db.prepare(`INSERT INTO coach_evaluation_runs (id,task,provider,model,schema_valid,safety_passed,action_valid,latency_ms,detail_json,created_at)
        VALUES (?,'coach_consult',?,?,1,?,1,0,?,?)`).bind(crypto.randomUUID(), generated?.provider || 'rules', generated?.model || 'safety-policy', risky ? 0 : 1,
          JSON.stringify({ turnId: turn.id, triage: triage.level, automatedChecks: 'schema,evidence_ids,preview', professionalReview: 'not_performed' }), completedAt),
    ];
    await db.batch(statements);
    const persisted = await db.prepare('SELECT assistant_message_id FROM coach_turns WHERE id=? AND attempt_id=?').bind(turn.id, turn.attempt_id).first<{ assistant_message_id: string | null }>();
    if (persisted?.assistant_message_id !== assistantId) throw new Error('COACH_TURN_SUPERSEDED');
    input.onDelta?.(reply); // Only validated, persisted output is visible. Route retries never concatenate text.
    input.defer?.(updateConversationSummary(env, user.id, conversationId).catch(() => undefined));
    return result;
  } catch (error) {
    if (charged) await refundCapability(env, user.id, 'coach.chat');
    const code = signal.aborted ? 'COACH_CANCELLED' : error instanceof Error ? error.message.split(':')[0] : 'COACH_FAILED';
    await db.prepare(`UPDATE coach_turns SET status=?,error_code=?,updated_at=? WHERE id=? AND attempt_id=? AND status='running'`)
      .bind(signal.aborted ? 'cancelled' : 'failed', code.slice(0, 100), new Date().toISOString(), turn.id, turn.attempt_id).run();
    throw new Error(code);
  }
}

function completeResult(turnId: string, userMessageId: string, assistantId: string, reply: string, createdAt: string,
  metadata: { intent: string; basis: unknown[]; limitations: string[]; sources: unknown[]; safety?: { highRisk: boolean } }, actions: unknown[]) {
  return { duplicate: false, turnId, userMessage: { id: userMessageId, role: 'user' as const },
    assistantMessage: { id: assistantId, role: 'assistant' as const, content: reply, createdAt, actions, ...metadata } };
}
