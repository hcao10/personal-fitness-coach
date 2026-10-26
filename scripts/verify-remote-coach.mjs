/** Real Cloudflare Worker + real D1 + deployed provider secret. No fixtures. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
async function main() {
  const dir = '.wrangler/coach-acceptance';
  const access = JSON.parse(await readFile(`${dir}/access.json`, 'utf8'));
  if (Date.now() >= Date.parse(access.expiresAt)) throw new Error('Acceptance credential has expired');
  const version = process.env.COACH_ACCEPTANCE_VERSION;
  if (!/^[\da-f-]{36}$/.test(version || '')) throw new Error('Set COACH_ACCEPTANCE_VERSION to the uploaded isolated version ID');
  async function call(path, body) {
    return fetch(`https://fit.chwjh.com${path}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'x-coach-acceptance': access.token, 'Cloudflare-Workers-Version-Overrides': `cmine-fit="${version}"`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(115000), redirect: 'error' });
  }
  async function json(path, body) {
    const response = await call(path, body);
    const text = await response.text();
    assert.ok(response.headers.get('content-type')?.includes('application/json'), `${path}: ${response.status} non-JSON response; verify the version is active at 0% and has propagated`);
    const result = JSON.parse(text);
    assert.ok(response.ok, `${path}: ${response.status} ${JSON.stringify(result)}`); return result;
  }
  if (process.argv.includes('--models')) {
    console.log(JSON.stringify(await json('/__acceptance/models'), null, 2)); return;
  }
  if (process.argv.includes('--seed')) {
    const model = process.env.COACH_ACCEPTANCE_MODEL;
    assert.ok(model, 'Set COACH_ACCEPTANCE_MODEL from the verified catalog');
    const scene = await json('/__acceptance/setup', { model });
    await writeFile(`${dir}/scene.json`, JSON.stringify(scene));
    await writeFile(`${dir}/baseline.json`, JSON.stringify(await json('/__acceptance/state')));
    console.log(JSON.stringify({ seeded: true, model, ...scene })); return;
  }
  const initial = JSON.parse(await readFile(`${dir}/baseline.json`, 'utf8'));
  const scene = JSON.parse(await readFile(`${dir}/scene.json`, 'utf8'));
  const homeBefore = await json('/api/v1/coach/home');
  let conversation;
  try { conversation = JSON.parse(await readFile(`${dir}/conversation.json`, 'utf8')); }
  catch {
    conversation = (await json('/api/v1/coach/conversations', { title: '真实模型远端验收' })).conversation;
    await writeFile(`${dir}/conversation.json`, JSON.stringify(conversation));
  }
  const input = { message: '今天只有20分钟。请读取我的今日训练和资料，帮我把今天训练缩短到20分钟以内，并给我一个可确认的具体调整预览。',
    clientMutationId: 'remote-live-short', scene: { ...scene, dayIndex: 0, availableMinutes: 20 },
    ...(process.argv.includes('--retry') ? { retry: true } : {}) };
  async function send() {
    const response = await call(`/api/v1/coach/conversations/${conversation.id}/messages`, input);
    const body = await response.text();
    const events = body.split('\n\n').filter(Boolean).map(block => ({ event: block.match(/^event: (.+)$/m)?.[1], data: JSON.parse(block.match(/^data: (.+)$/m)?.[1] || '{}') }));
    assert.ok(response.ok, `Chat ${response.status}: ${body}`);
    assert.equal(events.find(e => e.event === 'message.error'), undefined, body);
    assert.ok(events.some(e => e.event === 'message.completed'), body);
    return events;
  }
  try {
    const events = await send();
    const actions = events.filter(e => e.event === 'action.proposed').map(e => e.data);
    assert.equal(actions.length, 1, 'Real model must produce exactly one validated preview');
    const action = actions[0];
    const pending = await json('/api/v1/coach/home');
    assert.equal(pending.today.revision, homeBefore.today.revision, 'Preview must not write the session');
    assert.ok(action.payload.afterWorkout.duration <= 20);
    const accepted = await json(`/api/v1/coach/actions/${action.id}/accept`, {});
    assert.equal(accepted.status, 'accepted');
    assert.equal((await json(`/api/v1/coach/actions/${action.id}/accept`, {})).status, 'accepted');
    const home = await json('/api/v1/coach/home');
    const state = await json('/__acceptance/state');
    assert.equal(home.today.revision, 1);
    assert.deepEqual(home.today.workout, action.payload.afterWorkout);
    assert.deepEqual(state.plan, initial.plan, 'Weekly plan unchanged');
    assert.deepEqual(state.occurrences.filter(o => o.id !== scene.occurrenceId), initial.occurrences.filter(o => o.id !== scene.occurrenceId));
    assert.equal(state.changes.length, 1); assert.equal(state.executions.length, 1);
    const replay = await send();
    assert.equal(replay.at(-1).data.id, events.at(-1).data.id);
    const afterReplay = await json('/__acceptance/state');
    assert.equal(afterReplay.calls.length, state.calls.length);
    if (state.provider === 'model_hub') {
      assert.ok(state.calls.length >= 3 && state.calls.every(c => c.provider === 'model_hub' && c.status === 'succeeded' && c.request_id));
      const decisions = state.hubRequests.map(r => r.decision_kind);
      assert.ok(decisions.indexOf('get_training_context') >= 0 && decisions.indexOf('get_training_context') < decisions.indexOf('preview_session_change'));
      assert.equal(decisions.at(-1), 'answer');
      assert.ok(state.hubRequests.every(r => r.task_id === 'fitness.coach' && r.task_version === 1 && r.http_status === 200));
      assert.deepEqual(afterReplay.hubRequests, state.hubRequests);
    } else assert.ok(state.calls.some(c => c.status === 'succeeded' && c.request_id && c.input_tokens > 0 && c.output_tokens > 0));
    const report = { status: 'passed', timestamp: new Date().toISOString(), version, data: 'real remote Cloudflare D1; isolated synthetic account',
      provider: state.provider === 'model_hub' ? 'ai.chwjh.com; dedicated Cmine Fit App credential; no direct provider fallback' : 'existing Cloudflare Worker OPENAI_API_KEY; key never exported',
      checks: ['real provider tool loop', 'validated preview without write', 'confirmed D1 change', 'idempotent confirm', 'home reflects applied workout',
        'weekly plan and other dates unchanged', 'exact replay without provider call'], estimatedMinutes: home.today.workout.duration, calls: state.calls,
      ...(state.provider === 'model_hub' ? { hubRequests: state.hubRequests, usageNote: 'Provider tokens are not exposed by Hub public contract; reconcile usage through operator API.' } : {}),
      reply: events.filter(e => e.event === 'message.delta').map(e => e.data.delta).join('') };
    await writeFile(`${dir}/report.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    const state = await json('/__acceptance/state');
    await writeFile(`${dir}/failure.json`, JSON.stringify({ message: error.message, calls: state.calls }, null, 2));
    console.error(error.message); console.log(JSON.stringify({ calls: state.calls })); process.exitCode = 1;
  }
}
await main();
