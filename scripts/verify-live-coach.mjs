/** Real-provider acceptance run. No fallback model, no recorded responses, no production writes. */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

if (existsSync('.dev.vars')) process.loadEnvFile('.dev.vars');
const names = ['MODEL_HUB_API_KEY','MODEL_HUB_COACH_MODEL','OPENAI_API_KEY','OPENAI_MODEL','OPENAI_BASE_URL','OPENAI_REASONING_EFFORT',
  'AI_COMPAT_BASE_URL','AI_COMPAT_API_KEY','AI_COMPAT_TEXT_MODEL',
  'CLOUDFLARE_AI_ACCOUNT_ID','CLOUDFLARE_AI_TOKEN','CLOUDFLARE_AI_GATEWAY_URL','CLOUDFLARE_AI_GATEWAY_TOKEN'];
const env = Object.fromEntries(names.filter(name => process.env[name]).map(name => [name, process.env[name]]));
if (!env.MODEL_HUB_API_KEY && !(env.OPENAI_API_KEY && env.OPENAI_MODEL) && !(env.AI_COMPAT_API_KEY && env.AI_COMPAT_BASE_URL && env.AI_COMPAT_TEXT_MODEL)
  && !(env.CLOUDFLARE_AI_ACCOUNT_ID && env.CLOUDFLARE_AI_TOKEN) && !(env.CLOUDFLARE_AI_GATEWAY_URL && env.CLOUDFLARE_AI_GATEWAY_TOKEN)) {
  console.error('LIVE_COACH_NOT_RUN: configure an explicit real model and credentials in .dev.vars or environment. No model call was made.');
  process.exit(2);
}

// Same production HTTP handlers and real SQLite migrations used by integration tests.
const { fixture, sendTurn } = await import('../tests/helpers/coach-harness.mjs');
const f = await fixture(env);
try {
  const original = f.DB.sql.prepare('SELECT plan_json FROM plans WHERE id=?').get(f.planId).plan_json;
  const result = await sendTurn(f, '今天只有20分钟。请读取我的今日训练和资料，帮我把今天训练缩短到20分钟以内，并给我一个可确认的具体调整预览。', 'live-short',
    { scene: { occurrenceId: f.occurrence.id, planId: f.planId, dayIndex: 0, availableMinutes: 20 } });
  assert.equal(result.error, undefined, `Live model failed: ${result.error?.error}`);
  assert.equal(result.actions.length, 1, 'Real model must produce an actual validated preview');
  const action = result.actions[0];
  assert.ok(action.payload.afterWorkout.duration <= 20);
  const accepted = await (await f.call(`/api/v1/coach/actions/${action.id}/accept`, {})).json();
  assert.equal(accepted.status, 'accepted');
  const home = await (await f.call('/api/v1/coach/home')).json();
  assert.deepEqual(home.today.workout, action.payload.afterWorkout);
  assert.equal(home.today.revision, 1);
  assert.equal(f.DB.sql.prepare('SELECT plan_json FROM plans WHERE id=?').get(f.planId).plan_json, original);
  const beforeReplay = f.DB.sql.prepare('SELECT COUNT(*) AS n FROM coach_model_attempts').get().n;
  const replay = await sendTurn(f, '今天只有20分钟。请读取我的今日训练和资料，帮我把今天训练缩短到20分钟以内，并给我一个可确认的具体调整预览。', 'live-short',
    { scene: { occurrenceId: f.occurrence.id, planId: f.planId, dayIndex: 0, availableMinutes: 20 } });
  assert.equal(replay.error, undefined);
  assert.equal(f.DB.sql.prepare('SELECT COUNT(*) AS n FROM coach_model_attempts').get().n, beforeReplay);
  const report = { status: 'passed', timestamp: new Date().toISOString(), data: 'isolated synthetic account, real SQLite records',
    checks: ['real provider tool loop', 'validated session preview', 'confirmed SQL change', 'unchanged weekly plan', 'exact turn replay'],
    estimatedMinutes: home.today.workout.duration,
    calls: f.DB.sql.prepare('SELECT provider,model,status,request_id,input_tokens,output_tokens,estimated_cost_usd FROM coach_model_attempts').all() };
  await writeFile('.wrangler/live-coach-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { f.close(); }
