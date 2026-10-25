import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Run only after build/checks. All backups and CLI diagnostics remain ignored.
const config = 'dist/server/wrangler.json';
const cli = 'node_modules/wrangler/bin/wrangler.js';
const args = process.argv.slice(2);
const phase = args[0];
assert.ok(['prepare', 'publish'].includes(phase), 'Usage: node scripts/release-production.mjs prepare | publish <release directory>');
const directory = phase === 'prepare' ? `.wrangler/releases/${new Date().toISOString().replaceAll(':', '-')}` : args[1];
assert.ok(directory?.startsWith('.wrangler/releases/'), 'Release directory must stay in ignored local storage');
await mkdir(directory, { recursive: true });
const filename = path.join(directory, 'release.json');
const save = value => writeFile(filename, JSON.stringify(value, null, 2));

async function run(label, parameters) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...parameters], { env: { ...process.env, CI: 'true' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', code => resolve({ code, stdout, stderr }));
  });
  await writeFile(path.join(directory, `${label}.log`), result.stdout + result.stderr);
  assert.equal(result.code, 0, `${label} failed; inspect ignored diagnostic log`);
  return result.stdout;
}
const deployments = async () => JSON.parse(await run('deployments', ['deployments', 'list', '--config', config, '--json']));
const built = JSON.parse(await readFile(config, 'utf8'));
assert.equal(built.name, 'cmine-fit');
assert.equal(built.d1_databases[0].database_id, 'eb042b40-024b-42c1-9224-6b067d77dfd5');
assert.equal(built.vars.PUBLIC_ORIGIN, 'https://fit.chwjh.com');
assert.equal(built.vars.MODEL_HUB_COACH_MODEL, 'openai-fast');
assert.ok(built.assets?.directory, 'Release must contain the full website assets');

if (phase === 'prepare') {
  const baseline = (await deployments()).at(-1);
  assert.equal(baseline.versions.length, 1, 'Do not replace a gradual deployment');
  assert.equal(baseline.versions[0].percentage, 100);
  const bookmark = JSON.parse(await run('time-travel', ['d1', 'time-travel', 'info', 'DB', '--config', config, '--json']));
  await run('database-export', ['d1', 'export', 'DB', '--remote', '--config', config, '--output', path.resolve(directory, 'database-before.sql')]);
  const manifest = { preparedAt: new Date().toISOString(), worker: built.name, origin: built.vars.PUBLIC_ORIGIN,
    databaseId: built.d1_databases[0].database_id, baseline, bookmark, migrations: ['0016_coach_runtime.sql', '0017_coach_model_hub.sql'] };
  await save(manifest);
  await run('migrations-before', ['d1', 'migrations', 'list', 'DB', '--remote', '--config', 'wrangler.jsonc']);
  await run('migrations-apply', ['d1', 'migrations', 'apply', 'DB', '--remote', '--config', 'wrangler.jsonc']);
  await run('migrations-after', ['d1', 'migrations', 'list', 'DB', '--remote', '--config', 'wrangler.jsonc']);
  manifest.migratedAt = new Date().toISOString(); await save(manifest);
  console.log(JSON.stringify({ directory, migrated: true, baselineVersion: baseline.versions[0].version_id }));
} else {
  const manifest = JSON.parse(await readFile(filename, 'utf8'));
  assert.ok(manifest.migratedAt && !manifest.releasedAt, 'Prepare migrations first; do not publish twice');
  assert.equal((await deployments()).at(-1).id, manifest.baseline.id, 'Production changed since prepare');
  const paused = await run('upload-rollback', ['versions', 'upload', '--config', config, '--var', 'COACH_RUNTIME_PAUSED:true', '--tag', 'coach-safe-rollback']);
  manifest.rollbackVersion = paused.match(/Worker Version ID: ([\da-f-]{36})/)?.[1];
  assert.ok(manifest.rollbackVersion); await save(manifest);
  const uploaded = await run('upload-release', ['versions', 'upload', '--config', config, '--var', 'COACH_RUNTIME_PAUSED:false', '--tag', 'coach-hub-production']);
  manifest.releaseVersion = uploaded.match(/Worker Version ID: ([\da-f-]{36})/)?.[1];
  assert.ok(manifest.releaseVersion); await save(manifest);
  assert.equal((await deployments()).at(-1).id, manifest.baseline.id, 'Production changed while uploading');
  // Exercise the rollback artifact first; no inference or user-data writes.
  await run('deploy-rollback-check', ['versions', 'deploy', `${manifest.rollbackVersion}@100`, '--yes', '--config', config, '--message', 'Verify schema-compatible coach maintenance rollback']);
  const pausedHealth = await health(false); manifest.rollbackVerifiedAt = new Date().toISOString(); manifest.rollbackHealth = pausedHealth; await save(manifest);
  await run('deploy-release', ['versions', 'deploy', `${manifest.releaseVersion}@100`, '--yes', '--config', config, '--message', 'Cmine Fit: Model Hub coach and workout details']);
  manifest.health = await health(true); manifest.releasedAt = new Date().toISOString(); await save(manifest);
  console.log(JSON.stringify({ directory, releaseVersion: manifest.releaseVersion, rollbackVersion: manifest.rollbackVersion, health: manifest.health }));
}

async function health(expectedChat) {
  let last;
  for (let attempt = 0; attempt < 10; attempt++) {
    const response = await fetch(`https://fit.chwjh.com/api/health?releaseCheck=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (response.ok) {
      last = await response.json();
      if (last.ok && last.schemaReady && last.coachChat === expectedChat) return last;
    }
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  throw new Error(`Production health did not reach expected coach state: ${JSON.stringify(last)}`);
}
