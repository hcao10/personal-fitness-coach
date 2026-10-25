/** Operator-authorized real Hub acceptance, with isolated D1 and guaranteed cleanup attempts. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { hubRequest, hubUserId } from '../worker/ai/model-hub-client.ts';
import { homedir } from 'node:os';
import path from 'node:path';
const cli = 'node_modules/wrangler/bin/wrangler.js';
if (existsSync('.dev.vars')) process.loadEnvFile('.dev.vars');
const adminFile = path.join(homedir(), '.config', 'anybite', 'model-hub-admin.key');
const adminKey = process.env.MODEL_HUB_ADMIN_KEY || (existsSync(adminFile) ? (await readFile(adminFile, 'utf8')).trim() : undefined);
if (!adminKey || !process.env.MODEL_HUB_COACH_MODEL) {
  console.error('HUB_ACCEPTANCE_NOT_RUN: configure MODEL_HUB_ADMIN_KEY locally and select MODEL_HUB_COACH_MODEL from hub:provision -- --inspect.');
  process.exitCode = 2;
} else await main();

async function run(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output += chunk.toString(); });
    child.on('error', reject);
    child.on('exit', code => {
      // Keep full outputs in ignored diagnostic files; error messages contain no provider bodies/credentials.
      if (code !== 0) reject(Object.assign(new Error(`Command failed (${code}): ${args.slice(0, 4).join(' ')}`), { diagnostic: output }));
      else resolve(output);
    });
  });
}
async function deployments() { return JSON.parse(await run([cli, 'deployments', 'list', '--config', 'wrangler.jsonc', '--json'])); }
async function adminUsage(userId) {
  const response = await fetch(`https://ai.chwjh.com/admin/api/usage?appID=cmine-fit&userID=${await hubUserId(userId)}`, {
    headers: { authorization: `Bearer ${adminKey}` }, redirect: 'manual', signal: AbortSignal.timeout(25000) });
  assert.equal(response.status, 200, 'Hub operator usage query must succeed'); return response.json();
}
function usageRows(value) {
  if (!value || typeof value !== 'object') return [];
  return [...(Number.isFinite(Number(value.calls)) ? [value] : []), ...Object.values(value).flatMap(item => usageRows(item))];
}
async function main() {
  await mkdir('.wrangler/model-hub', { recursive: true });
  let databaseName; let databaseId; let version; let original; let changedDeployment = false; let testUserId; let failure;
  try {
    const baseline = (await deployments()).at(-1);
    assert.equal(baseline.versions.length, 1, 'Do not alter a live gradual deployment');
    assert.equal(baseline.versions[0].percentage, 100); original = baseline.versions[0].version_id;
    await writeFile('.wrangler/model-hub/production-baseline.json', JSON.stringify(baseline, null, 2));
    console.log('Provisioning dedicated fitness App/task/credential through Hub operator API.');
    await run(['--experimental-strip-types', 'scripts/provision-model-hub.mjs', '--install-worker-secret']);
    process.loadEnvFile('.dev.vars');
    databaseName = `cmine-fit-coach-acceptance-hub-${randomBytes(5).toString('hex')}`;
    const created = await run([cli, 'd1', 'create', databaseName]);
    databaseId = created.match(/"database_id":\s*"([\da-f-]{36})"/)?.[1];
    assert.ok(databaseId, 'Wrangler must return the created temporary database ID');
    await run(['scripts/prepare-remote-coach.mjs', databaseId, databaseName, '--hub']);
    const config = '.wrangler/coach-acceptance/wrangler.json';
    testUserId = JSON.parse(await readFile(config, 'utf8')).vars.ACCEPTANCE_TEST_USER_ID;
    console.log('Migrating an isolated D1 and uploading a zero-traffic acceptance version.');
    await run([cli, 'd1', 'migrations', 'apply', 'DB', '--remote', '--config', config]);
    const uploaded = await run([cli, 'versions', 'upload', '--config', config, '--tag', 'coach-hub-acceptance']);
    version = uploaded.match(/Worker Version ID: ([\da-f-]{36})/)?.[1]; assert.ok(version);
    // Check again after provisioning/upload to avoid overriding a concurrent production release.
    assert.equal((await deployments()).at(-1).id, baseline.id, 'Production changed during setup; stop before traffic changes');
    await run([cli, 'versions', 'deploy', `${original}@100`, `${version}@0`, '--yes', '--config', 'wrangler.jsonc', '--message', 'Model Hub isolated acceptance; original production 100%']);
    changedDeployment = true;
    // Read-only version propagation check. This never retries a paid inference.
    let ready = false;
    for (let i = 0; i < 12; i++) {
      try { await run(['scripts/verify-remote-coach.mjs', '--models'], { COACH_ACCEPTANCE_VERSION: version }); ready = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 1000)); }
    }
    assert.ok(ready, 'Isolated version did not become available');
    const env = { COACH_ACCEPTANCE_VERSION: version, COACH_ACCEPTANCE_MODEL: process.env.MODEL_HUB_COACH_MODEL };
    await run(['scripts/verify-remote-coach.mjs', '--seed'], env);
    console.log('Running real Hub inference → training preview → confirmation → remote D1/home → replay.');
    await run(['scripts/verify-remote-coach.mjs'], env); // Paid inference is attempted once, never automatically retried.
    const report = JSON.parse(await readFile('.wrangler/coach-acceptance/report.json', 'utf8'));
    assert.ok(report.hubRequests.length >= 3 && report.hubRequests.every(row => row.status === 'succeeded'));
    const usage = await adminUsage(testUserId);
    const rows = usageRows(usage);
    const calls = rows.reduce((total, row) => total + Number(row.calls), 0);
    assert.ok(calls >= report.hubRequests.length, 'Hub operator metadata must corroborate actual inference calls');
    report.hubUsage = usage; report.hubUsageCalls = calls;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await mkdir('docs/acceptance', { recursive: true });
    const reportPath = `docs/acceptance/coach-hub-live-${stamp}.json`;
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ status: 'passed', reportPath, hubCalls: calls, model: process.env.MODEL_HUB_COACH_MODEL }));
  } catch (error) {
    failure = error;
    const secrets = [adminKey, process.env.MODEL_HUB_API_KEY].filter(Boolean);
    let diagnostic = error.diagnostic || error.message;
    for (const secret of secrets) diagnostic = diagnostic.split(secret).join('[redacted]');
    await writeFile('.wrangler/model-hub/acceptance-failure.txt', diagnostic);
    console.error(error.message); process.exitCode = 1;
  } finally {
    const cleanup = { deployment: 'unchanged', hubUser: 'not-created', database: 'not-created' };
    if (changedDeployment) {
      try {
        const current = (await deployments()).at(-1);
        assert.ok(current.versions.every(row => row.version_id === original || row.version_id === version), 'Another deployment appeared; do not overwrite it');
        await run([cli, 'versions', 'deploy', `${original}@100`, '--yes', '--config', 'wrangler.jsonc', '--message', 'Model Hub acceptance finished; remove isolated version']);
        cleanup.deployment = 'restored-original-only';
      } catch { cleanup.deployment = 'NEEDS_OPERATOR_REVIEW'; process.exitCode = 1; }
    }
    if (testUserId && process.env.MODEL_HUB_API_KEY) {
      try { await hubRequest({ MODEL_HUB_API_KEY: process.env.MODEL_HUB_API_KEY }, testUserId, '/v1/privacy/user', { method: 'DELETE' }); cleanup.hubUser = 'deleted'; }
      catch { cleanup.hubUser = 'NEEDS_OPERATOR_REVIEW'; process.exitCode = 1; }
    }
    if (databaseName && databaseId) {
      try { await run([cli, 'd1', 'delete', databaseName, '--skip-confirmation', '--config', 'wrangler.jsonc']); cleanup.database = 'deleted'; }
      catch { cleanup.database = 'NEEDS_OPERATOR_REVIEW'; process.exitCode = 1; }
    }
    await rm('.wrangler/coach-acceptance/access.json', { force: true });
    await writeFile('.wrangler/model-hub/cleanup.json', JSON.stringify(cleanup, null, 2));
    console.log(JSON.stringify({ cleanup, ...(failure ? { status: 'not-passed' } : {}) }));
  }
}
