import type { LanguageModelV4, LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { z } from 'zod';
import { HUB_COACH_TASK_ID, HUB_COACH_TASK_VERSION, HUB_TOOL_NAMES } from '../../packages/integrations/src/model-hub/coach-task.ts';
import type { WorkerEnv } from '../platform.ts';
import { answerSchema, changeSchema } from '../coach/validation.ts';
import { hubCoachInput } from './model-hub-context.ts';
import { hubRequest, ModelHubError } from './model-hub-client.ts';

const decisionSchema = answerSchema.extend({
  kind: z.enum(['answer', ...HUB_TOOL_NAMES]), changeType: z.enum(['none', 'shorten_session', 'replace_exercise', 'adjust_load']),
  availableMinutes: z.number().int().min(10).max(90).nullable(), exerciseInstanceId: z.string().max(150).nullable(),
  replacementExerciseId: z.string().max(100).nullable(), loadMultiplier: z.number().min(.8).max(1.05).nullable(),
  exerciseId: z.string().max(100).nullable(), days: z.number().int().min(1).max(84).nullable(), question: z.string().max(500).nullable(),
  // Tool-only decisions have no prose; final answers still use answerSchema's minimum.
  reply: z.string().max(3000),
}).strict();
function toolArguments(decision: z.infer<typeof decisionSchema>) {
  if (decision.kind === 'get_training_context') return {};
  if (decision.kind === 'get_exercise_history') return z.object({ exerciseId: z.string().min(1), days: z.number().int().min(1).max(84) }).parse(decision);
  if (decision.kind === 'find_substitutions') return z.object({ exerciseInstanceId: z.string().min(1) }).parse(decision);
  if (decision.kind === 'retrieve_knowledge') return z.object({ question: z.string().min(2).max(500) }).parse(decision);
  if (decision.kind === 'preview_session_change') {
    const change = decision.changeType === 'shorten_session' ? { type: decision.changeType, availableMinutes: decision.availableMinutes }
      : decision.changeType === 'replace_exercise' ? { type: decision.changeType, exerciseInstanceId: decision.exerciseInstanceId, replacementExerciseId: decision.replacementExerciseId }
      : { type: decision.changeType, exerciseInstanceId: decision.exerciseInstanceId, loadMultiplier: decision.loadMultiplier };
    return { change: changeSchema.parse(change) };
  }
  throw new ModelHubError('MODEL_HUB_UNKNOWN_TOOL');
}

export function modelHubCoach(env: WorkerEnv, input: { userId: string; turnId: string; attemptId: string; locale: string; highRisk: boolean; model: string }): LanguageModelV4 {
  let step = 0;
  return {
    specificationVersion: 'v4', provider: 'model_hub', modelId: input.model, supportedUrls: {},
    async doGenerate(options: LanguageModelV4CallOptions) {
      const payload = hubCoachInput(options.prompt, input.locale, input.highRisk);
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
      const inputHash = Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join('');
      const requestId = crypto.randomUUID(); const now = new Date().toISOString(); const db = env.DB!;
      const stepIndex = step++;
      await db.prepare(`INSERT OR IGNORE INTO coach_hub_requests
        (request_id,user_id,turn_id,attempt_id,step_index,input_hash,task_id,task_version,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,'started',?,?)`).bind(requestId, input.userId, input.turnId, input.attemptId, stepIndex, inputHash,
          HUB_COACH_TASK_ID, HUB_COACH_TASK_VERSION, now, now).run();
      const persisted = await db.prepare('SELECT request_id FROM coach_hub_requests WHERE attempt_id=? AND step_index=?')
        .bind(input.attemptId, stepIndex).first<{ request_id: string }>();
      // No automatic retransmission, including after process restart or uncertain network outcomes.
      if (persisted?.request_id !== requestId) throw new ModelHubError('MODEL_HUB_REQUEST_ALREADY_STARTED');
      try {
        const result = await hubRequest(env, input.userId, '/v1/infer', { requestId, signal: options.abortSignal,
          body: { task: HUB_COACH_TASK_ID, taskVersion: HUB_COACH_TASK_VERSION, requestID: requestId,
            ...(input.model === 'task-default' ? {} : { model: input.model }), input: JSON.stringify(payload) } });
        const decision = decisionSchema.parse(result.body.output);
        const model = z.string().min(1).max(120).parse(result.body.model);
        const content = decision.kind === 'answer' ? [{ type: 'text' as const, text: JSON.stringify(answerSchema.parse({
          reply: decision.reply, intent: decision.intent, safety: decision.safety, evidenceIds: decision.evidenceIds,
          knowledgeIds: decision.knowledgeIds, proposalIds: decision.proposalIds, limitations: decision.limitations,
        })) }] : [{ type: 'tool-call' as const, toolCallId: requestId, toolName: decision.kind, input: JSON.stringify(toolArguments(decision)) }];
        await db.prepare("UPDATE coach_hub_requests SET status='succeeded',model_alias=?,decision_kind=?,http_status=200,updated_at=? WHERE request_id=?")
          .bind(model, decision.kind, new Date().toISOString(), requestId).run();
        return { content, finishReason: { unified: decision.kind === 'answer' ? 'stop' as const : 'tool-calls' as const, raw: decision.kind },
          // Hub's public contract does not expose provider tokens. Unknown is not zero.
          usage: { inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: undefined, text: undefined, reasoning: undefined } },
          response: { id: requestId, modelId: model }, warnings: [],
        };
      } catch (error) {
        const code = error instanceof ModelHubError ? error.code : options.abortSignal?.aborted ? 'MODEL_HUB_CANCELLED_UNKNOWN' : 'MODEL_HUB_CALL_FAILED_UNKNOWN';
        await db.prepare("UPDATE coach_hub_requests SET status='failed',http_status=?,error_code=?,updated_at=? WHERE request_id=?")
          .bind(error instanceof ModelHubError ? error.status : null, code, new Date().toISOString(), requestId).run();
        throw new ModelHubError(code, error instanceof ModelHubError ? error.status : 0);
      }
    },
    async doStream() { throw new ModelHubError('MODEL_HUB_STREAMING_UNSUPPORTED'); },
  };
}
