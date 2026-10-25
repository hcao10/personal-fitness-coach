import { DatabaseSync } from 'node:sqlite';
import { readdir, readFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// Real SQL and real production handlers. No query matching or mocked DB responses.
const out = path.resolve('.wrangler/coach-test-runtime.mjs');
await mkdir(path.dirname(out), { recursive: true });
await build({ stdin: { contents: `export { handleApi } from './worker/api.ts';
export { savePlan, saveProfile, createSession, deleteUserData } from './worker/db.ts';
export { generatePlan } from './packages/coach-core/src/index.ts';`, resolveDir: process.cwd(), loader: 'ts' },
  outfile: out, bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'es2022', logLevel: 'silent' });
export const backend = await import(pathToFileURL(out).href);

export class SqliteD1 {
  constructor(filename = ':memory:') { this.sql = new DatabaseSync(filename); this.sql.exec('PRAGMA foreign_keys=ON'); }
  prepare(query) {
    const sql = this.sql; const values = [];
    const statement = {
      query, values,
      bind(...args) { values.splice(0, values.length, ...args); return statement; },
      async first(column) { const row = sql.prepare(query).get(...values) || null; return column && row ? row[column] : row; },
      async all() { return { success: true, results: sql.prepare(query).all(...values) }; },
      async run() { const result = sql.prepare(query).run(...values); return { success: true, meta: { changes: Number(result.changes) } }; },
    };
    return statement;
  }
  async batch(statements) {
    this.sql.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      // Execute synchronously inside the transaction, just as D1 batches are atomic.
      for (const statement of statements) {
        const query = this.sql.prepare(statement.query);
        if (/\bRETURNING\b/i.test(statement.query)) results.push({ success: true, results: query.all(...statement.values) });
        else { const result = query.run(...statement.values); results.push({ success: true, meta: { changes: Number(result.changes) } }); }
      }
      this.sql.exec('COMMIT'); return results;
    } catch (error) { this.sql.exec('ROLLBACK'); throw error; }
  }
  close() { this.sql.close(); }
}

export const profile = { sex: 'female', age: 28, height: 165, weight: 60, targetWeight: 56,
  activity: 'moderate', goal: 'strength', experience: 'intermediate', days: 3, equipment: 'gym', limitations: '', sessionMinutes: 45 };

export async function fixture(extraEnv = {}) {
  const DB = new SqliteD1();
  for (const name of (await readdir('drizzle')).filter(name => name.endsWith('.sql')).sort()) DB.sql.exec(await readFile(path.join('drizzle', name), 'utf8'));
  const now = new Date().toISOString(); const token = 'local-test-user-token';
  for (const id of ['alice', 'bob']) DB.sql.prepare(`INSERT INTO users(id,cmine_sub,locale,timezone,status,created_at,updated_at) VALUES (?,?,'zh','UTC','active',?,?)`).run(id, `test-${id}`, now, now);
  const env = { DB, ...extraEnv };
  await backend.createSession(env, 'alice', token);
  await backend.saveProfile(env, 'alice', profile);
  const plan = backend.generatePlan(profile);
  // Place a real generated training day today, independent of the weekday of the test run.
  const first = plan.schedule.find(day => !day.restDay);
  plan.schedule[0] = { ...first, dayIndex: 0 };
  const planId = await backend.savePlan(env, 'alice', profile, plan, 'rules', 'test-fixture', { startDate: now.slice(0, 10), timezone: 'UTC' });
  const occurrence = DB.sql.prepare(`SELECT * FROM workout_occurrences WHERE user_id='alice' AND scheduled_date=?`).get(now.slice(0, 10));
  const call = async (url, body, options = {}) => backend.handleApi(new Request(`http://localhost${url}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { cookie: `cmine_fit_session=${token}`, origin: 'http://localhost', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...options,
  }), env);
  const response = await call('/api/v1/coach/conversations', { title: '真实数据链路验收' });
  const created = await response.json();
  if (!created.conversation) throw new Error(`Conversation fixture failed: ${JSON.stringify(created)}`);
  const conversation = created.conversation;
  return { DB, env, call, plan, planId, occurrence, conversation, close: () => DB.close() };
}

export async function sendTurn(f, message, id, extra = {}) {
  const response = await f.call(`/api/v1/coach/conversations/${f.conversation.id}/messages`,
    { message, clientMutationId: id, ...extra });
  const body = await response.text();
  const events = body.split('\n\n').filter(Boolean).map(block => ({ event: block.match(/^event: (.+)$/m)?.[1], data: JSON.parse(block.match(/^data: (.+)$/m)?.[1] || '{}') }));
  return { response, body, events, error: events.find(item => item.event === 'message.error')?.data,
    actions: events.filter(item => item.event === 'action.proposed').map(item => item.data) };
}
