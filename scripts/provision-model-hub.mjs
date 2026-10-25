/** Operator API onboarding. Credentials are read locally and never printed. */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import { hubCoachTask } from '../packages/integrations/src/model-hub/coach-task.ts';

if (existsSync('.dev.vars')) process.loadEnvFile('.dev.vars');
const adminFile = path.join(homedir(), '.config', 'anybite', 'model-hub-admin.key');
const admin = process.env.MODEL_HUB_ADMIN_KEY || (existsSync(adminFile) ? (await readFile(adminFile, 'utf8')).trim() : undefined);
if (process.argv.includes('--definition')) {
  console.log(JSON.stringify(hubCoachTask, null, 2));
} else {
  if (!admin) { console.error('MODEL_HUB_ADMIN_KEY_REQUIRED: configure it locally; never paste it in chat.'); process.exitCode = 2; }
  else await main().catch(error => {
    let message = error instanceof Error ? error.message : 'MODEL_HUB_PROVISIONING_FAILED';
    for (const secret of [admin, process.env.MODEL_HUB_API_KEY].filter(Boolean)) message = message.split(secret).join('[redacted]');
    console.error(message); process.exitCode = 1;
  });
}
async function api(path, body) {
  const response = await fetch(`https://ai.chwjh.com${path}`, { redirect: 'manual', method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${admin}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(25000) });
  const result = await response.json();
  if (!response.ok) throw new Error(`HUB_ADMIN_${response.status}:${typeof result.error === 'string' ? result.error.replace(/[^a-z_]/gi, '').slice(0, 70) : 'failed'}`);
  return result;
}
async function saveEnv(name, value) {
  const original = existsSync('.dev.vars') ? await readFile('.dev.vars', 'utf8') : '';
  const line = `${name}=${JSON.stringify(value)}`;
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  await writeFile('.dev.vars', pattern.test(original) ? original.replace(pattern, () => line) : `${original.trimEnd()}\n${line}\n`);
}
async function main() {
  const overview = await api('/admin/api/overview');
  const enabled = overview.models.filter(model => model.enabled && model.provider === 'openai');
  if (process.argv.includes('--inspect')) {
    console.log(JSON.stringify({ inferenceEnabled: overview.inferenceEnabled, providerConfigured: overview.providerConfigured,
      models: enabled.map(({ alias, upstream, input_price, output_price }) => ({ alias, upstream, input_price, output_price })),
      fitnessApp: overview.applications.filter(app => app.id === 'cmine-fit') }, null, 2)); return;
  }
  const model = process.env.MODEL_HUB_COACH_MODEL;
  if (!model || !enabled.some(item => item.alias === model)) throw new Error('Set MODEL_HUB_COACH_MODEL to an enabled alias returned by --inspect');
  const appID = 'cmine-fit';
  await mkdir('.wrangler/model-hub', { recursive: true });
  const existing = overview.applications.find(app => app.id === appID);
  const newPolicy = { id: appID, name: 'Cmine Fit', models: [model], defaultModel: model,
    enabled: false, monthlyRequests: 100, userDailyMicros: 200000, dailyMicros: 2000000, rpm: 12, userConcurrency: 1 };
  if (!existing) {
    await api('/admin/api/apps', newPolicy);
    await writeFile('.wrangler/model-hub/app-setup.json', JSON.stringify(newPolicy));
  } else if (!(Array.isArray(existing.models) ? existing.models : JSON.parse(existing.models)).includes(model)) {
    throw new Error('Existing cmine-fit App policy does not allow this model; operator must review it before changes');
  }
  let setupPolicy;
  if (!existing?.enabled) {
    if (!existsSync('.wrangler/model-hub/app-setup.json')) throw new Error('Existing disabled App has no local setup record; operator must review before enabling');
    setupPolicy = JSON.parse(await readFile('.wrangler/model-hub/app-setup.json', 'utf8'));
    if (setupPolicy.id !== appID || !setupPolicy.models.includes(model)) throw new Error('Local App setup record does not match requested policy');
  }
  await api('/admin/api/tasks', { definition: hubCoachTask });
  const tasks = await api('/admin/api/tasks');
  const grant = tasks.grants.find(item => item.app_id === appID && item.task_id === hubCoachTask.id);
  if (grant && grant.version !== hubCoachTask.version) throw new Error('Existing grant points at another task version; review migration before replacing it');
  await api('/admin/api/task-grants', { appID, taskID: hubCoachTask.id, version: hubCoachTask.version, models: [model], defaultModel: model, enabled: true });
  let key = process.env.MODEL_HUB_API_KEY; let keyID = null;
  if (key) {
    const hash = createHash('sha256').update(key).digest('hex');
    const keyRecord = overview.keys.find(item => item.hash === hash);
    if (!keyRecord || keyRecord.app_id !== appID || keyRecord.revoked) {
      throw new Error('Existing MODEL_HUB_API_KEY cannot be verified as an active cmine-fit key. Do not reuse another App key; remove the local binding to issue a dedicated key.');
    }
    keyID = keyRecord.hash;
  }
  if (!key) {
    const created = await api('/admin/api/keys', { appID });
    if (typeof created.key !== 'string' || !created.key.startsWith('mh_')) throw new Error('Invalid issued application credential');
    key = created.key; keyID = created.keyID ?? created.keyId ?? created.id ?? null;
    // Preserve the once-only issued value in an ignored local secret file before any next operation.
    await saveEnv('MODEL_HUB_API_KEY', key);
  }
  await saveEnv('MODEL_HUB_COACH_MODEL', model);
  // Only the App created by this setup is enabled; never replace another App's policy.
  if (setupPolicy) await api('/admin/api/apps', { ...setupPolicy, enabled: true });
  const userId = 'fit:provisioning-check';
  const catalog = await fetch('https://ai.chwjh.com/v1/tasks', { headers: { authorization: `Bearer ${key}`, 'X-User-ID': userId }, redirect: 'manual' });
  if (!catalog.ok) throw new Error(`Issued App credential cannot load task catalog: ${catalog.status}`);
  const available = await catalog.json();
  if (!Array.isArray(available.tasks) || !available.tasks.some(item => (item.id ?? item.taskID ?? item.task_id) === hubCoachTask.id
    && Number(item.version ?? item.taskVersion) === hubCoachTask.version)) throw new Error('Dedicated App catalog does not expose the registered coach task/version');
  await mkdir('.wrangler/model-hub', { recursive: true });
  const record = { appID, taskID: hubCoachTask.id, version: hubCoachTask.version, model, keyID, provisionedAt: new Date().toISOString() };
  await writeFile('.wrangler/model-hub/provisioning.json', JSON.stringify(record, null, 2));
  if (process.argv.includes('--install-worker-secret')) {
    // argv contains only the binding name. The application key travels over stdin; admin key never leaves this process.
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'versions', 'secret', 'put', 'MODEL_HUB_API_KEY',
        '--config', 'wrangler.jsonc', '--tag', 'model-hub-credential', '--message', 'Dedicated Cmine Fit Model Hub credential; no traffic change'],
        { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, MODEL_HUB_ADMIN_KEY: undefined } });
      let safeOutput = '';
      const capture = chunk => { safeOutput += chunk.toString().split(key).join('[redacted]').split(admin).join('[redacted]'); };
      child.stdout.on('data', capture); child.stderr.on('data', capture);
      child.stdin.end(`${key}\n`);
      child.on('exit', code => code === 0 ? (console.log(safeOutput.split(key).join('[redacted]').split(admin).join('[redacted]')), resolve()) : reject(new Error('Cloudflare application secret installation failed; issued key remains in ignored local .dev.vars')));
      child.on('error', reject);
    });
  }
  console.log(JSON.stringify({ ...record, appKey: 'saved in ignored .dev.vars; value omitted', workerSecret: process.argv.includes('--install-worker-secret') }, null, 2));
}
