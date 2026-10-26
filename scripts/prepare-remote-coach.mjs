// Generates ignored, expiring remote-dev configuration. Never exports deployed secrets.
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
const databaseId = process.argv[2];
const databaseName = process.argv[3];
if (!/^[\da-f-]{36}$/.test(databaseId || '') || !/^cmine-fit-coach-acceptance-[\w-]+$/.test(databaseName || '')
  || databaseId === 'eb042b40-024b-42c1-9224-6b067d77dfd5') throw new Error('An isolated acceptance D1 is required');
const token = randomBytes(32).toString('hex');
const expiresAt = new Date(Date.now() + 90 * 60000).toISOString();
await mkdir('.wrangler/coach-acceptance', { recursive: true });
// A fresh database must never reuse a conversation ID or baseline from an older run.
await Promise.all(['scene.json', 'baseline.json', 'conversation.json', 'failure.json', 'report.json']
  .map(name => rm(path.resolve('.wrangler/coach-acceptance', name), { force: true })));
await writeFile('.wrangler/coach-acceptance/access.json', JSON.stringify({ token, expiresAt, url: 'http://127.0.0.1:8791' }));
await writeFile('.wrangler/coach-acceptance/wrangler.json', JSON.stringify({ name: 'cmine-fit',
  account_id: 'eec4d223ffc55199e88ae515a67323fe', main: path.resolve('cloudflare/coach-acceptance/index.ts'),
  compatibility_date: '2026-05-15', compatibility_flags: ['nodejs_compat'], workers_dev: true, preview_urls: false,
  vars: { ACCEPTANCE_TOKEN_HASH: createHash('sha256').update(token).digest('hex'), ACCEPTANCE_EXPIRES_AT: expiresAt,
    ACCEPTANCE_PROVIDER: process.argv.includes('--hub') ? 'model_hub' : 'openai',
    ACCEPTANCE_TEST_USER_ID: `coach-acceptance-${randomBytes(12).toString('hex')}`,
    ACCEPTANCE_DATABASE_ID: databaseId },
  d1_databases: [{ binding: 'DB', database_name: databaseName, database_id: databaseId, preview_database_id: databaseId, migrations_dir: path.resolve('drizzle') }],
}, null, 2));
console.log(JSON.stringify({ config: '.wrangler/coach-acceptance/wrangler.json', expiresAt, databaseName }));
