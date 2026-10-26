import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, sendTurn } from './helpers/coach-harness.mjs';
import { wireServer, toolCall, lastTool, finalAnswer } from './helpers/coach-wire-server.mjs';

const shorten = body => {
  const preview = lastTool(body, 'preview_session_change');
  if (preview) return finalAnswer({ proposalIds: [preview.proposalId] });
  if (lastTool(body, 'get_training_context')) return toolCall('preview_session_change', { change: { type: 'shorten_session', availableMinutes: 20 } });
  return toolCall('get_training_context', {});
};

test('HTTP → real SDK tool loop → actual SQL proposal → atomic accept → home reflects only today; replay is exact', async () => {
  const wire = await wireServer((body, n) => {
    if (n === 1) return toolCall('get_training_context', {});
    if (n === 2) {
      const context = lastTool(body, 'get_training_context');
      assert.equal(context.today.profile.weight, 60);
      assert.equal(context.today.date, new Date().toISOString().slice(0, 10));
      return toolCall('preview_session_change', { change: { type: 'shorten_session', availableMinutes: 20 } });
    }
    const preview = lastTool(body, 'preview_session_change');
    assert.ok(preview.afterWorkout.duration <= 20);
    return finalAnswer({ proposalIds: [preview.proposalId] });
  });
  const f = await fixture(wire.env);
  try {
    const otherOccurrences = f.DB.sql.prepare('SELECT id,revision,workout_override_json FROM workout_occurrences WHERE id<>?').all(f.occurrence.id);
    const input = { scene: { planId: f.planId, occurrenceId: f.occurrence.id, dayIndex: 0 } };
    const turn = await sendTurn(f, '今天只有20分钟，请帮我调整今天训练', 'turn-short', input);
    assert.equal(turn.error, undefined, turn.body);
    assert.equal(wire.requests.length, 3);
    assert.equal(turn.actions.length, 1);
    assert.equal(turn.events.find(event => event.event === 'message.metadata').data.safety.highRisk, false);
    const homeBefore = await (await f.call('/api/v1/coach/home')).json();
    assert.equal(homeBefore.today.revision, 0, 'preview must not mutate the session');
    const action = turn.actions[0];
    const path = `/api/v1/coach/actions/${action.id}/accept`;
    const accepted = await Promise.all([f.call(path, {}).then(r => r.json()), f.call(path, {}).then(r => r.json())]);
    assert.ok(accepted.every(value => value.status === 'accepted'), JSON.stringify(accepted));
    const home = await (await f.call('/api/v1/coach/home')).json();
    assert.equal(home.today.revision, 1);
    assert.deepEqual(home.today.workout, action.payload.afterWorkout);
    assert.ok(home.today.workout.duration <= 20);
    assert.deepEqual(f.DB.sql.prepare('SELECT id,revision,workout_override_json FROM workout_occurrences WHERE id<>?').all(f.occurrence.id), otherOccurrences);
    assert.equal(f.DB.sql.prepare('SELECT COUNT(*) AS n FROM coach_session_changes').get().n, 1);
    assert.equal(f.DB.sql.prepare('SELECT COUNT(*) AS n FROM coach_action_executions').get().n, 1);
    assert.equal(f.DB.sql.prepare('SELECT COUNT(*) AS n FROM coach_model_attempts').get().n, 3);
    const replay = await sendTurn(f, '今天只有20分钟，请帮我调整今天训练', 'turn-short', input);
    assert.equal(replay.error, undefined);
    assert.equal(wire.requests.length, 3, 'replay must not recontact the provider');
    assert.equal(replay.events.at(-1).data.id, turn.events.at(-1).data.id);
    assert.equal(f.DB.sql.prepare("SELECT COUNT(*) AS n FROM coach_messages WHERE role='assistant'").get().n, 1);
  } finally { f.close(); await wire.close(); }
});

test('failed upstream turn does not replay an unrelated assistant; explicit retry keeps its original user message', async () => {
  let fail = false;
  const wire = await wireServer((_body, _n, response) => {
    if (fail) { response.writeHead(503); response.end('{}'); return null; }
    return finalAnswer();
  });
  const f = await fixture(wire.env);
  try {
    assert.equal((await sendTurn(f, '今天的训练是什么', 'first')).error, undefined);
    fail = true;
    assert.equal((await sendTurn(f, '请再解释一下今天', 'second')).error.error, 'COACH_MODEL_FAILED');
    const duplicate = await sendTurn(f, '请再解释一下今天', 'second');
    assert.equal(duplicate.error.error, 'COACH_RETRY_REQUIRED');
    assert.equal(duplicate.events.some(event => event.event === 'message.delta'), false);
    fail = false;
    assert.equal((await sendTurn(f, '请再解释一下今天', 'second', { retry: true })).error, undefined);
    assert.equal(f.DB.sql.prepare("SELECT COUNT(*) AS n FROM coach_messages WHERE role='user'").get().n, 2);
    assert.equal(f.DB.sql.prepare("SELECT COUNT(*) AS n FROM coach_turns WHERE status='completed'").get().n, 2);
    assert.equal(f.DB.sql.prepare('SELECT used FROM feature_usage WHERE capability=\'coach.chat\'').get().used, 2);
    assert.equal((await sendTurn(f, '更改原始输入', 'second', { retry: true })).error.error, 'COACH_MUTATION_CONFLICT');
  } finally { f.close(); await wire.close(); }
});

test('selected foreign/stale occurrence is rejected before a model call or proposal', async () => {
  const wire = await wireServer(() => finalAnswer()); const f = await fixture(wire.env);
  try {
    const result = await sendTurn(f, '帮我调整', 'foreign', { scene: { occurrenceId: 'bob-session' } });
    assert.equal(result.error.error, 'COACH_CONTEXT_STALE');
    assert.equal(wire.requests.length, 0);
    assert.equal(f.DB.sql.prepare('SELECT COUNT(*) AS n FROM coach_action_proposals').get().n, 0);
  } finally { f.close(); await wire.close(); }
});

test('ungrounded evidence and invented proposal IDs cannot reach the client', async () => {
  const wire = await wireServer(() => finalAnswer({ evidenceIds: ['invented'], proposalIds: ['invented-action'] })); const f = await fixture(wire.env);
  try {
    const result = await sendTurn(f, '调整今天', 'invented');
    assert.equal(result.error.error, 'COACH_UNGROUNDED_OUTPUT');
    assert.equal(result.events.some(event => event.event === 'message.delta'), false);
    assert.equal(f.DB.sql.prepare('SELECT COUNT(*) AS n FROM coach_action_proposals').get().n, 0);
  } finally { f.close(); await wire.close(); }
});

test('a stale second preview cannot overwrite a previously accepted change', async () => {
  const wire = await wireServer(shorten); const f = await fixture(wire.env);
  try {
    const one = await sendTurn(f, '请缩短到20分钟', 'one');
    const two = await sendTurn(f, '请缩短到20分钟', 'two');
    assert.equal(one.error, undefined); assert.equal(two.error, undefined);
    assert.equal((await (await f.call(`/api/v1/coach/actions/${one.actions[0].id}/accept`, {})).json()).status, 'accepted');
    assert.equal((await (await f.call(`/api/v1/coach/actions/${two.actions[0].id}/accept`, {})).json()).status, 'expired');
    assert.equal(f.DB.sql.prepare('SELECT revision FROM workout_occurrences WHERE id=?').get(f.occurrence.id).revision, 1);
  } finally { f.close(); await wire.close(); }
});

test('recording a real set after preview prevents destructive session rewrites', async () => {
  const wire = await wireServer(shorten); const f = await fixture(wire.env);
  try {
    const result = await sendTurn(f, '缩短到20分钟', 'started'); assert.equal(result.error, undefined);
    const exercise = f.plan.schedule[0].exercises[0];
    const record = await f.call(`/api/v1/workouts/${f.planId}/sets`, { occurrenceId: f.occurrence.id, dayIndex: 0, exerciseId: exercise.id,
      setIndex: 0, setType: 'working', weightKg: 35, reps: 8, rir: 2, completed: true, clientMutationId: 'real-set' });
    assert.equal(record.status, 201, await record.text());
    const accepted = await f.call(`/api/v1/coach/actions/${result.actions[0].id}/accept`, {});
    assert.equal(accepted.status, 409);
    assert.equal(f.DB.sql.prepare('SELECT revision FROM workout_occurrences WHERE id=?').get(f.occurrence.id).revision, 0);
    assert.equal(f.DB.sql.prepare('SELECT COUNT(*) AS n FROM coach_session_changes').get().n, 0);
  } finally { f.close(); await wire.close(); }
});

test('same-pattern replacement affects one occurrence and its actual sets endpoint accepts the new exercise', async () => {
  const wire = await wireServer(body => {
    const preview = lastTool(body, 'preview_session_change');
    if (preview) return finalAnswer({ proposalIds: [preview.proposalId] });
    const substitutions = lastTool(body, 'find_substitutions');
    const context = lastTool(body, 'get_training_context');
    if (substitutions) {
      const candidate = substitutions.candidates.find(item => item.id !== context.today.exercises[0].id);
      assert.ok(candidate, 'generated workout should have a valid alternative');
      return toolCall('preview_session_change', { change: { type: 'replace_exercise', exerciseInstanceId: context.today.exercises[0].exerciseInstanceId, replacementExerciseId: candidate.id } });
    }
    if (context) return toolCall('find_substitutions', { exerciseInstanceId: context.today.exercises[0].exerciseInstanceId });
    return toolCall('get_training_context', {});
  });
  const f = await fixture(wire.env);
  try {
    const turn = await sendTurn(f, '换掉今天第一个动作', 'replace'); assert.equal(turn.error, undefined, turn.body);
    const action = turn.actions[0];
    assert.equal((await f.call(`/api/v1/coach/actions/${action.id}/accept`, {})).status, 200);
    const replacement = action.payload.afterWorkout.exercises[0];
    const response = await f.call(`/api/v1/workouts/${f.planId}/sets`, { occurrenceId: f.occurrence.id, dayIndex: 0, exerciseId: replacement.id,
      setIndex: 0, setType: 'working', weightKg: 10, reps: 8, rir: 2, completed: true, clientMutationId: 'replacement-set' });
    assert.equal(response.status, 201, await response.text());
    assert.equal(f.DB.sql.prepare('SELECT exercise_id FROM workout_occurrence_sets').get().exercise_id, replacement.id);
    const unchanged = JSON.parse(f.DB.sql.prepare('SELECT plan_json FROM plans WHERE id=?').get(f.planId).plan_json);
    assert.equal(unchanged.schedule[0].exercises[0].id, f.plan.schedule[0].exercises[0].id);
  } finally { f.close(); await wire.close(); }
});

test('request cancellation aborts the upstream request, persists cancellation, refunds quota and emits no suggestion', async () => {
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const wire = await wireServer((_body, _n, response) => { started(); return new Promise(resolve => response.on('close', () => resolve(null))); });
  const f = await fixture(wire.env);
  try {
    const controller = new AbortController();
    const response = await f.call(`/api/v1/coach/conversations/${f.conversation.id}/messages`,
      { message: '帮我看看今天训练', clientMutationId: 'cancelled' }, { signal: controller.signal });
    const reading = response.text(); await ready; controller.abort(); await reading;
    assert.equal(f.DB.sql.prepare("SELECT status FROM coach_turns WHERE client_mutation_id='cancelled'").get().status, 'cancelled');
    assert.equal(f.DB.sql.prepare('SELECT used FROM feature_usage WHERE capability=\'coach.chat\'').get().used, 0);
    assert.equal(f.DB.sql.prepare("SELECT COUNT(*) AS n FROM coach_messages WHERE role='assistant'").get().n, 0);
  } finally { f.close(); await wire.close(); }
});

test('historical read tool uses this user’s actual SQL sets, not model-supplied user IDs', async () => {
  const wire = await wireServer(body => {
    const history = lastTool(body, 'get_exercise_history');
    if (history) {
      assert.equal(history.records.length, 1); assert.equal(history.records[0].weight_kg, 35);
      return finalAnswer({ reply: '你今天记录了35公斤、8次，余力2次。', evidenceIds: [history.evidence[0].id] });
    }
    return toolCall('get_exercise_history', { exerciseId: 'bench', days: 42 });
  }); const f = await fixture(wire.env);
  try {
    f.DB.sql.prepare(`INSERT INTO workout_occurrence_sets(id,occurrence_id,user_id,plan_id,day_index,exercise_id,set_index,set_type,weight_kg,reps,rir,completed,created_at,updated_at)
      VALUES ('history',?,'alice',?,0,'bench',0,'working',35,8,2,1,?,?)`).run(f.occurrence.id, f.planId, new Date().toISOString(), new Date().toISOString());
    const result = await sendTurn(f, '看看最近六周卧推', 'history'); assert.equal(result.error, undefined);
    const metadata = result.events.find(item => item.event === 'message.metadata').data;
    assert.equal(metadata.basis[0].value, '35 kg × 8 · RIR 2');
  } finally { f.close(); await wire.close(); }
});

test('OpenAI Responses adapter uses actual Responses tool-call/output protocol with store=false', async () => {
  const wire = await wireServer((body, n) => {
    assert.equal(body.store, false);
    assert.ok(body.tools.some(item => item.name === 'get_training_context'));
    if (n === 1) return { output: [{ type: 'function_call', id: 'fc1', call_id: 'call1', name: 'get_training_context', arguments: '{}' }] };
    const toolOutput = body.input.find(item => item.type === 'function_call_output' && item.call_id === 'call1');
    assert.ok(toolOutput, 'Responses tool output must preserve the call ID');
    const actual = JSON.parse(toolOutput.output);
    assert.equal(actual.today.profile.weight, 60);
    return { output: [{ id: 'msg1', type: 'message', role: 'assistant', status: 'completed',
      content: [{ type: 'output_text', text: finalAnswer().content, annotations: [] }] }] };
  }, { responses: true });
  const f = await fixture(wire.env);
  try {
    const result = await sendTurn(f, '结合我的资料解释今天训练', 'responses');
    assert.equal(result.error, undefined, result.body);
    assert.equal(wire.requests.length, 2);
    assert.equal(f.DB.sql.prepare('SELECT COUNT(*) AS n FROM coach_model_attempts WHERE request_id IS NOT NULL').get().n, 2);
  } finally { f.close(); await wire.close(); }
});

test('a database failure rolls back session changes and its receipt together; retry can apply exactly once', async () => {
  const wire = await wireServer(shorten); const f = await fixture(wire.env);
  try {
    const turn = await sendTurn(f, '缩短到20分钟', 'rollback'); assert.equal(turn.error, undefined);
    f.DB.sql.exec("CREATE TRIGGER fail_execution BEFORE INSERT ON coach_action_executions BEGIN SELECT RAISE(ABORT,'test persistence failure'); END");
    const route = `/api/v1/coach/actions/${turn.actions[0].id}/accept`;
    assert.equal((await f.call(route, {})).status, 409);
    assert.equal(f.DB.sql.prepare('SELECT revision FROM workout_occurrences WHERE id=?').get(f.occurrence.id).revision, 0);
    assert.equal(f.DB.sql.prepare('SELECT COUNT(*) AS n FROM coach_session_changes').get().n, 0);
    f.DB.sql.exec('DROP TRIGGER fail_execution');
    assert.equal((await (await f.call(route, {})).json()).status, 'accepted');
    assert.equal(f.DB.sql.prepare('SELECT revision FROM workout_occurrences WHERE id=?').get(f.occurrence.id).revision, 1);
  } finally { f.close(); await wire.close(); }
});

test('simultaneous turns cannot both consume the final quota slot', async () => {
  const wire = await wireServer(() => finalAnswer()); const f = await fixture(wire.env);
  try {
    f.DB.sql.prepare("UPDATE site_settings SET value_json='1' WHERE key='pro_coach_message_limit'").run();
    const results = await Promise.all([sendTurn(f, '今天练什么', 'quota-one'), sendTurn(f, '解释今天计划', 'quota-two')]);
    assert.equal(results.filter(result => !result.error).length, 1);
    assert.equal(results.filter(result => result.error?.error === 'COACH_LIMIT_REACHED').length, 1);
    assert.equal(wire.requests.length, 1);
    assert.equal(f.DB.sql.prepare('SELECT used FROM feature_usage WHERE capability=\'coach.chat\'').get().used, 1);
  } finally { f.close(); await wire.close(); }
});

test('another authenticated account cannot accept or reject this user’s proposal', async () => {
  const wire = await wireServer(shorten); const f = await fixture(wire.env);
  try {
    const turn = await sendTurn(f, '缩短到20分钟', 'owned'); assert.equal(turn.error, undefined);
    await (await import('./helpers/coach-harness.mjs')).backend.createSession(f.env, 'bob', 'bob-test-token');
    const response = await f.call(`/api/v1/coach/actions/${turn.actions[0].id}/accept`, {},
      { headers: { cookie: 'cmine_fit_session=bob-test-token', origin: 'http://localhost', 'content-type': 'application/json' } });
    assert.equal(response.status, 404);
    assert.equal(f.DB.sql.prepare('SELECT revision FROM workout_occurrences WHERE id=?').get(f.occurrence.id).revision, 0);
  } finally { f.close(); await wire.close(); }
});

test('maintenance rollback preserves a saved preview and training reads while blocking paid calls and confirmation', async () => {
  const wire = await wireServer(shorten); const f = await fixture(wire.env);
  try {
    const turn = await sendTurn(f, '缩短到20分钟', 'before-maintenance');
    assert.equal(turn.error, undefined);
    const calls = wire.requests.length;
    f.env.COACH_RUNTIME_PAUSED = 'true';
    const message = await f.call(`/api/v1/coach/conversations/${f.conversation.id}/messages`, { message: '缩短今天', clientMutationId: 'paused' });
    assert.equal(message.status, 503);
    const action = await f.call(`/api/v1/coach/actions/${turn.actions[0].id}/accept`, {});
    assert.equal(action.status, 503);
    assert.equal((await (await f.call('/api/health')).json()).coachChat, false);
    assert.equal((await f.call('/api/v1/coach/home')).status, 200);
    assert.equal(wire.requests.length, calls);
    assert.equal(f.DB.sql.prepare('SELECT COUNT(*) AS n FROM coach_session_changes').get().n, 0);
    assert.equal(f.DB.sql.prepare('SELECT status FROM coach_action_proposals WHERE id=?').get(turn.actions[0].id).status, 'pending');
    f.env.COACH_RUNTIME_PAUSED = 'false';
    assert.equal((await (await f.call(`/api/v1/coach/actions/${turn.actions[0].id}/accept`, {})).json()).status, 'accepted');
  } finally { f.close(); await wire.close(); }
});

test('urgent symptoms remain explicitly flagged in streamed and persisted metadata for the compact coach view', async () => {
  const wire = await wireServer(shorten); const f = await fixture(wire.env);
  try {
    const turn = await sendTurn(f, '我现在胸痛、呼吸困难，快晕倒了', 'urgent-safety');
    assert.equal(turn.error, undefined);
    assert.equal(turn.events.find(event => event.event === 'message.metadata').data.safety.highRisk, true);
    assert.equal(turn.actions.length, 0);
    assert.equal(wire.requests.length, 0);
    const messages = await (await f.call(`/api/v1/coach/conversations/${f.conversation.id}/messages`)).json();
    assert.equal(messages.messages.at(-1).safety.highRisk, true);
    assert.ok(messages.messages.at(-1).content.length > 0);
  } finally { f.close(); await wire.close(); }
});
