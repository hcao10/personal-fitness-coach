import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, sendTurn, backend } from './helpers/coach-harness.mjs';
import { hubWire, decision } from './helpers/model-hub-wire.mjs';
import { hubCoachTask } from '../packages/integrations/src/model-hub/coach-task.ts';

const success = output => ({ body: { output, model: 'test-fast', quota: { remaining: 10 } } });
const shortening = request => {
  const input = JSON.parse(request.body.input);
  const preview = input.observations.find(x => x.tool === 'preview_session_change');
  if (preview) return success(decision('answer', { proposalIds: [JSON.parse(preview.data).proposalId] }));
  if (input.observations.some(x => x.tool === 'get_training_context')) return success(decision('preview_session_change', { changeType: 'shorten_session', availableMinutes: 20 }));
  return success(decision('get_training_context'));
};
test('Hub task → real SDK tools → real SQL preview/confirm/home; stable UUID and exact completed replay', async () => {
  const wire = await hubWire(shortening); const f = await fixture(wire.env);
  try {
    const original = f.DB.sql.prepare('SELECT plan_json FROM plans WHERE id=?').get(f.planId);
    const result = await sendTurn(f, '今天只有20分钟，请调整今天训练', 'hub-real-chain');
    assert.equal(result.error, undefined, result.body); assert.equal(result.actions.length, 1);
    assert.equal(wire.requests.length, 3);
    for (const request of wire.requests) {
      assert.equal(request.path, '/v1/infer'); assert.equal(request.body.task, 'fitness.coach'); assert.equal(request.body.taskVersion, 1);
      assert.equal(request.body.requestID, request.headers['idempotency-key']);
      assert.match(request.headers['x-user-id'], /^fit:[a-f0-9]{64}$/);
      assert.equal(request.body.system, undefined); assert.equal(request.body.tools, undefined);
      assert.ok(Buffer.byteLength(request.body.input) <= 8000);
    }
    const context = JSON.parse(JSON.parse(wire.requests[1].body.input).observations[0].data);
    assert.equal(context.profile.weight, 60); assert.equal(context.today.exercises.length, f.plan.schedule[0].exercises.length);
    assert.equal(context.today.exercises[0].exerciseInstanceId, `${f.occurrence.id}:0`);
    assert.equal(context.activePlan, undefined);
    const rows = f.DB.sql.prepare('SELECT request_id,status,decision_kind FROM coach_hub_requests ORDER BY step_index').all();
    assert.deepEqual(rows.map(x => x.request_id), wire.requests.map(x => x.body.requestID));
    assert.deepEqual(rows.map(x => x.decision_kind), ['get_training_context','preview_session_change','answer']);
    assert.ok(rows.every(x => x.status === 'succeeded'));
    const action = result.actions[0];
    assert.equal((await (await f.call(`/api/v1/coach/actions/${action.id}/accept`, {})).json()).status, 'accepted');
    assert.equal((await (await f.call(`/api/v1/coach/actions/${action.id}/accept`, {})).json()).status, 'accepted');
    const home = await (await f.call('/api/v1/coach/home')).json();
    assert.equal(home.today.revision, 1); assert.deepEqual(home.today.workout, action.payload.afterWorkout);
    assert.deepEqual(f.DB.sql.prepare('SELECT plan_json FROM plans WHERE id=?').get(f.planId), original);
    assert.equal((await sendTurn(f, '今天只有20分钟，请调整今天训练', 'hub-real-chain')).error, undefined);
    assert.equal(wire.requests.length, 3);
    assert.equal(f.DB.sql.prepare('SELECT COUNT(*) AS n FROM coach_session_changes').get().n, 1);
    const usage = f.DB.sql.prepare('SELECT input_tokens,output_tokens FROM coach_model_attempts').all();
    assert.ok(usage.every(x => x.input_tokens === null && x.output_tokens === null), 'Hub does not expose provider tokens; do not fabricate them');
  } finally { f.close(); await wire.close(); }
});

test('Hub refusal/uncertain response does not retry or fall back; retry requires explicit new attempt', async () => {
  const wire = await hubWire(() => ({ status: 429, body: { error: 'request_replayed' } }));
  const f = await fixture({ ...wire.env, OPENAI_API_KEY: 'must-never-be-used', OPENAI_MODEL: 'must-never-be-used' });
  try {
    const result = await sendTurn(f, '今天训练怎么调整', 'hub-refused');
    assert.equal(result.error.error, 'MODEL_HUB_REQUEST_REPLAYED'); assert.equal(wire.requests.length, 1);
    assert.equal((await sendTurn(f, '今天训练怎么调整', 'hub-refused')).error.error, 'COACH_RETRY_REQUIRED');
    assert.equal(wire.requests.length, 1);
    assert.equal(f.DB.sql.prepare('SELECT http_status FROM coach_hub_requests').get().http_status, 429);
    const retried = await sendTurn(f, '今天训练怎么调整', 'hub-refused', { retry: true });
    assert.equal(retried.error.error, 'MODEL_HUB_REQUEST_REPLAYED'); assert.equal(wire.requests.length, 2);
    assert.notEqual(wire.requests[0].body.requestID, wire.requests[1].body.requestID);
    assert.equal(f.DB.sql.prepare('SELECT COUNT(*) AS n FROM coach_messages WHERE role=\'assistant\'').get().n, 0);
  } finally { f.close(); await wire.close(); }
});

test('Hub hallucinated IDs cannot produce a visible answer or write a session', async () => {
  const wire = await hubWire(() => success(decision('answer', { proposalIds: ['invented'] })));
  const f = await fixture(wire.env);
  try {
    const result = await sendTurn(f, '调整今日训练', 'hub-bad-evidence');
    assert.equal(result.error.error, 'COACH_UNGROUNDED_OUTPUT');
    assert.equal(result.events.some(e => e.event === 'message.delta'), false);
    assert.equal(f.DB.sql.prepare('SELECT COUNT(*) AS n FROM coach_action_proposals').get().n, 0);
  } finally { f.close(); await wire.close(); }
});

test('Hub prompt checks UTF-8 bytes before each network call; current instruction is not silently truncated', async () => {
  const wire = await hubWire(shortening); const f = await fixture(wire.env);
  try {
    const result = await sendTurn(f, '训练'.repeat(1000), 'hub-large');
    // 6KB user text fits alone, but later actual observations can exceed 8KB.
    assert.equal(result.error.error, 'MODEL_HUB_INPUT_TOO_LARGE');
    assert.ok(wire.requests.length <= 2);
    for (const request of wire.requests) {
      assert.ok(Buffer.byteLength(request.body.input) <= 8000);
      assert.equal(JSON.parse(request.body.input).message, '训练'.repeat(1000));
    }
    assert.equal(result.actions.length, 0);
    assert.equal(f.DB.sql.prepare('SELECT COUNT(*) AS n FROM generation_runs').get().n, wire.requests.length, 'local size rejection is not a billed inference');
  } finally { f.close(); await wire.close(); }
});

test('Hub identity is derived from verified session; exports and deletion use same identity; cleanup fails closed', async () => {
  let failDelete = true;
  const wire = await hubWire(request => request.path === '/v1/privacy/user' && failDelete
    ? { status: 503, body: { error: 'unavailable' } } : { body: { metadata: [], deleted: true } });
  const f = await fixture(wire.env);
  try {
    const exported = await (await f.call('/api/v1/export')).json();
    assert.ok(exported.modelHub); assert.equal(wire.requests[0].path, '/v1/privacy/export');
    const { deleteUserData } = await import('../.wrangler/coach-test-runtime.mjs');
    assert.ok(deleteUserData);
    await assert.rejects(() => deleteUserData(f.env, 'alice'), /MODEL_HUB_UNAVAILABLE/);
    assert.ok(f.DB.sql.prepare('SELECT id FROM users WHERE id=\'alice\'').get());
    failDelete = false; await deleteUserData(f.env, 'alice');
    assert.equal(f.DB.sql.prepare('SELECT id FROM users WHERE id=\'alice\'').get(), undefined);
    assert.equal(new Set(wire.requests.map(x => x.headers['x-user-id'])).size, 1);
    await backend.createSession(f.env, 'bob', 'bob-hub-token');
  } finally { f.close(); await wire.close(); }
});

test('registered Hub schema fits bounded subset, has no unions/refs or optional properties', () => {
  for (const schema of [hubCoachTask.inputSchema, hubCoachTask.outputSchema]) {
    let nodes = 0;
    function visit(node, depth = 1) {
      nodes++; assert.ok(depth <= 6); assert.equal(node.$ref, undefined); assert.equal(node.oneOf, undefined); assert.equal(node.anyOf, undefined);
      if (node.type === 'object') { assert.equal(node.additionalProperties, false); assert.deepEqual(node.required, Object.keys(node.properties)); for (const v of Object.values(node.properties)) visit(v, depth+1); }
      if (node.type === 'array') { assert.ok(node.maxItems); visit(node.items, depth+1); }
      if (node.type === 'string' || Array.isArray(node.type) && node.type.includes('string')) assert.ok(node.maxLength);
    }
    visit(schema); assert.ok(nodes <= 80); assert.ok(Buffer.byteLength(JSON.stringify(schema)) <= 6000);
  }
});
