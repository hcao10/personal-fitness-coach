/** Real Hub permission checks. All inference requests must fail before paid generation. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { hubRequest, hubUserId, ModelHubError } from '../worker/ai/model-hub-client.ts';
import { HUB_COACH_TASK_ID, HUB_COACH_TASK_VERSION } from '../packages/integrations/src/model-hub/coach-task.ts';
process.loadEnvFile('.dev.vars');
const env = { MODEL_HUB_API_KEY: process.env.MODEL_HUB_API_KEY };
const user = `coach-policy-${randomUUID()}`;
const admin = (await readFile(path.join(homedir(), '.config/anybite/model-hub-admin.key'), 'utf8')).trim();
const checks = [];
try {
  const catalog = (await hubRequest(env, user, '/v1/tasks')).body;
  assert.ok(Array.isArray(catalog.tasks) && catalog.tasks.length === 1);
  assert.equal(catalog.tasks[0].id, HUB_COACH_TASK_ID); assert.equal(catalog.tasks[0].version, HUB_COACH_TASK_VERSION);
  checks.push({ check: 'dedicated App exposes only fitness.coach@1', status: 200 });
  const response = await fetch('https://ai.chwjh.com/admin/api/overview', { headers: { authorization: `Bearer ${env.MODEL_HUB_API_KEY}` }, redirect: 'manual' });
  assert.ok([401,403].includes(response.status)); checks.push({ check: 'application credential cannot access operator API', status: response.status });
  const input = JSON.stringify({ locale: 'zh', highRisk: false, message: '合成权限边界验证', scene: '{}', history: '{}', evidence: '[]', observations: [] });
  for (const [check, override, expected] of [
    ['ungranted food task refused', { task: 'inventory' }, 403],
    ['ungranted model refused', { model: 'not-granted-policy-check' }, 403],
    ['ungranted immutable task version refused', { taskVersion: 2 }, 409],
  ]) {
    const requestId = randomUUID(); let result;
    try { await hubRequest(env, user, '/v1/infer', { requestId, body: { task: HUB_COACH_TASK_ID, taskVersion: HUB_COACH_TASK_VERSION, requestID: requestId, input, ...override } }); }
    catch (error) { if (!(error instanceof ModelHubError)) throw error; result = error; }
    assert.equal(result?.status, expected, check); checks.push({ check, status: result.status, code: result.code });
  }
  const usageResponse = await fetch(`https://ai.chwjh.com/admin/api/usage?appID=cmine-fit&userID=${await hubUserId(user)}`, {
    headers: { authorization: `Bearer ${admin}` }, redirect: 'manual' });
  assert.equal(usageResponse.status, 200); const usage = await usageResponse.json();
  const calls = (usage.rows || []).reduce((sum, row) => sum + Number(row.calls || 0), 0);
  assert.equal(calls, 0, 'Policy rejections must not launch paid model calls');
  const report = { status: 'passed', timestamp: new Date().toISOString(), appID: 'cmine-fit', checks, paidCalls: calls };
  await writeFile('.wrangler/model-hub/policy-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await hubRequest(env, user, '/v1/privacy/user', { method: 'DELETE' }); }
