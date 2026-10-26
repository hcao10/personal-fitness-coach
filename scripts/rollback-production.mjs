import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const [filename, mode] = process.argv.slice(2);
assert.ok(filename && ['--dry-run', '--execute'].includes(mode), 'Usage: node scripts/rollback-production.mjs <release.json> --dry-run|--execute');
const manifest = JSON.parse(await readFile(filename, 'utf8'));
assert.equal(manifest.worker, 'cmine-fit');
assert.equal(manifest.databaseId, 'eb042b40-024b-42c1-9224-6b067d77dfd5');
assert.match(manifest.rollbackVersion, /^[\da-f-]{36}$/);
assert.ok(manifest.rollbackVerifiedAt, 'The rollback artifact must have passed its production health check');
console.log(JSON.stringify({ worker: manifest.worker, rollbackVersion: manifest.rollbackVersion,
  effect: 'Pause coach inference/acceptance; preserve occurrence overrides, login, exercise viewer and all database records', mode }));
if (mode === '--execute') {
  const child = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'versions', 'deploy', `${manifest.rollbackVersion}@100`,
    '--yes', '--config', 'wrangler.jsonc', '--message', 'Schema-compatible coach maintenance rollback'], { stdio: 'inherit', env: process.env });
  assert.equal(child.status, 0, 'Rollback deployment failed');
  const response = await fetch('https://fit.chwjh.com/api/health', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  const health = await response.json();
  assert.ok(health.ok && health.schemaReady && !health.coachChat, 'Verify health and deployment propagation manually');
  console.log('Rollback verified. D1 was not restored or downgraded.');
}
