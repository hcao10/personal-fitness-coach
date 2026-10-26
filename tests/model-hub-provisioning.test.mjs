import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

test('operator onboarding uses actual HTTP, grants only dedicated App, saves key without output, and reruns without issuing another key', async () => {
  // Deliberately synthetic operator server; this does not assert a real Hub has been provisioned.
  const dir = await mkdtemp(path.join(tmpdir(), 'fit-hub-provision-'));
  const state = { applications: [], models: [{ alias: 'fixture-model', upstream: 'fixture-upstream', provider: 'openai', enabled: 1 }], keys: [] };
  const grants = []; const mutations = []; let definition; let issued = 0;
  const appKey = 'mh_synthetic_onboarding_key'; const adminKey = 'mh_synthetic_operator_key';
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString(); const body = raw ? JSON.parse(raw) : undefined;
    let result = {}; let status = 200;
    if (req.url.startsWith('/admin/') && req.headers.authorization !== `Bearer ${adminKey}`) status = 401;
    else if (req.method === 'GET' && req.url === '/admin/api/overview') result = state;
    else if (req.method === 'GET' && req.url === '/admin/api/tasks') result = { grants };
    else if (req.method === 'POST' && req.url === '/admin/api/apps') {
      mutations.push(req.url); const index = state.applications.findIndex(app => app.id === body.id);
      if (index < 0) state.applications.push({ ...body, default_model: body.defaultModel });
      else state.applications[index] = { ...body, default_model: body.defaultModel };
    }
    else if (req.method === 'POST' && req.url === '/admin/api/tasks') {
      if (definition && JSON.stringify(definition) !== JSON.stringify(body.definition)) { status = 409; result = { error: 'immutable_version' }; }
      else definition = body.definition;
    } else if (req.method === 'POST' && req.url === '/admin/api/task-grants') {
      mutations.push(req.url); grants.splice(0, grants.length, { app_id: body.appID, task_id: body.taskID, version: body.version, models: body.models });
    } else if (req.method === 'POST' && req.url === '/admin/api/keys') {
      issued++; mutations.push(req.url); assert.equal(body.appID, 'cmine-fit');
      state.keys.push({ app_id: body.appID, hash: createHash('sha256').update(appKey).digest('hex'), revoked: false });
      result = { key: appKey, keyID: 'fixture-key-id' };
    } else if (req.method === 'GET' && req.url === '/v1/tasks') {
      assert.equal(req.headers.authorization, `Bearer ${appKey}`); assert.equal(req.headers['x-user-id'], 'fit:provisioning-check');
      result = { tasks: [{ id: definition.id, version: definition.version }] };
    } else status = 404;
    res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(result));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const preload = path.join(dir, 'redirect.mjs');
  await writeFile(preload, `const original=globalThis.fetch;globalThis.fetch=(url,options)=>{if(!String(url).startsWith('https://ai.chwjh.com/'))throw new Error('Unapproved fixture destination');return original(String(url).replace('https://ai.chwjh.com','http://127.0.0.1:${server.address().port}'),options)};`);
  const run = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', '--import', pathToFileURL(preload).href, path.resolve('scripts/provision-model-hub.mjs')],
      { cwd: dir, env: { ...process.env, MODEL_HUB_ADMIN_KEY: adminKey, MODEL_HUB_COACH_MODEL: 'fixture-model', MODEL_HUB_API_KEY: undefined }, stdio: ['ignore','pipe','pipe'] });
    let output = ''; child.stdout.on('data', part => output += part); child.stderr.on('data', part => output += part);
    child.on('error', reject); child.on('exit', code => resolve({ code, output }));
  });
  try {
    const first = await run(); assert.equal(first.code, 0, first.output);
    assert.equal(issued, 1); assert.equal(state.applications.length, 1); assert.equal(grants[0].app_id, 'cmine-fit');
    assert.equal(definition.id, 'fitness.coach');
    assert.ok(!first.output.includes(appKey) && !first.output.includes(adminKey));
    const local = await readFile(path.join(dir, '.dev.vars'), 'utf8'); assert.ok(local.includes(appKey)); assert.ok(!local.includes(adminKey));
    const second = await run(); assert.equal(second.code, 0, second.output); assert.equal(issued, 1, 'do not create duplicate application credentials');
    assert.equal(mutations.filter(p => p === '/admin/api/apps').length, 2, 'create disabled, then explicitly enable after setup');
    // A credential belonging to another App must be refused before use.
    state.keys[0].app_id = 'another-app';
    const refused = await run(); assert.equal(refused.code, 1); assert.match(refused.output, /cannot be verified/); assert.equal(issued, 1);
    assert.ok(!refused.output.includes(appKey) && !refused.output.includes(adminKey));
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
