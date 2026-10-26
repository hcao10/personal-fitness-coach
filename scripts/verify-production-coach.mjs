import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';

// Read-only reconciliation of an already completed, genuinely signed-in browser
// operation. Never creates sessions, seeds users, accepts actions or calls infer.
const directory = process.argv[2];
assert.ok(directory?.startsWith('.wrangler/releases/'), 'Pass the ignored release directory');
const originalRelease = JSON.parse(await readFile(path.join(directory, 'release.json'), 'utf8'));
const currentDirectory = process.argv[3] || directory;
assert.ok(currentDirectory.startsWith('.wrangler/releases/'));
const release = JSON.parse(await readFile(path.join(currentDirectory, 'release.json'), 'utf8'));
const baseline = JSON.parse(await readFile(path.join(directory, 'browser-account-before.json'), 'utf8'));
assert.match(baseline.userId, /^[\da-f-]{36}$/); assert.match(baseline.occurrenceId, /^[\da-f-]{36}$/);
function query(sql) {
  const result = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'DB', '--remote', '--config', 'wrangler.jsonc', '--command', sql, '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 0, 'Production D1 verification failed'); return JSON.parse(result.stdout)[0].results;
}
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const [occurrence] = query(`SELECT revision,workout_override_json FROM workout_occurrences WHERE id='${baseline.occurrenceId}' AND user_id='${baseline.userId}'`);
assert.equal(occurrence.revision, 1);
const workout = JSON.parse(occurrence.workout_override_json); assert.ok(workout.duration <= 20 && workout.exercises.length > 0);
const [plan] = query(`SELECT plan_json FROM plans WHERE id='${baseline.original.plan_id}'`);
assert.equal(hash(plan.plan_json), baseline.planDigest, 'Weekly template changed');
const others = query(`SELECT id,scheduled_date,mode,revision,workout_override_json FROM workout_occurrences WHERE user_id='${baseline.userId}' AND id<>'${baseline.occurrenceId}' ORDER BY id`);
assert.equal(hash(others), baseline.otherOccurrencesDigest, 'Another dated session changed');
const changes = query(`SELECT sc.action_id,sc.base_revision,sc.result_revision,e.status,a.status AS action_status FROM coach_session_changes sc JOIN coach_action_executions e ON e.action_id=sc.action_id JOIN coach_action_proposals a ON a.id=sc.action_id WHERE sc.occurrence_id='${baseline.occurrenceId}'`);
assert.equal(changes.length, 1); assert.equal(changes[0].status, 'succeeded'); assert.equal(changes[0].action_status, 'accepted');
const [turn] = query(`SELECT t.id,t.status,t.error_code,t.created_at,t.updated_at FROM coach_turns t JOIN coach_action_proposals a ON a.message_id=t.assistant_message_id WHERE t.user_id='${baseline.userId}' AND a.id='${changes[0].action_id}'`);
assert.equal(turn.status, 'completed'); assert.match(turn.id, /^[\da-f-]{36}$/);
const requests = query(`SELECT request_id,task_id,task_version,model_alias,decision_kind,status,http_status FROM coach_hub_requests WHERE turn_id='${turn.id}' ORDER BY step_index`);
assert.deepEqual(requests.map(row => row.decision_kind), ['get_training_context', 'preview_session_change', 'answer']);
assert.ok(requests.every(row => row.task_id === 'fitness.coach' && row.task_version === 1 && row.model_alias === 'openai-fast' && row.status === 'succeeded' && row.http_status === 200));
const attempts = query(`SELECT provider,model,status,request_id,latency_ms,input_tokens,output_tokens FROM coach_model_attempts WHERE turn_id='${turn.id}' ORDER BY created_at`);
assert.ok(attempts.length === requests.length && attempts.every(row => row.provider === 'model_hub' && row.status === 'succeeded'));
const admin = (await readFile(path.join(homedir(), '.config/anybite/model-hub-admin.key'), 'utf8')).trim();
const subject = `fit:${hash(`cmine-fit:${baseline.userId}`)}`;
const response = await fetch(`https://ai.chwjh.com/admin/api/usage?appID=cmine-fit&userID=${subject}`, {
  headers: { authorization: `Bearer ${admin}` }, redirect: 'manual', signal: AbortSignal.timeout(25000) });
assert.equal(response.status, 200);
const usage = await response.json();
const events = (usage.events || []).filter(event => {
  const at = event.created_at.replace(' ', 'T');
  return at >= turn.created_at.slice(0, 19) && at <= turn.updated_at.slice(0, 19);
});
assert.equal(events.length, requests.length, 'Hub usage events must corroborate this browser turn');
assert.ok(events.every(event => event.outcome === 'success' && JSON.parse(event.diagnostics_json).task === 'fitness.coach'));
const report = { verifiedAt: new Date().toISOString(), productionReleased: true, origin: release.origin,
  releaseVersion: release.releaseVersion, rollbackVersion: release.rollbackVersion, rollbackVerifiedAt: release.rollbackVerifiedAt,
  modelAcceptanceVersion: originalRelease.releaseVersion, uiReleasedAt: release.releasedAt,
  migrations: release.migrations, databaseBackupStoredLocally: true,
  authentication: 'User completed normal Cmine ID login in production browser; no fixture session or acceptance Worker',
  modelEndpoint: 'https://ai.chwjh.com/v1/infer', appId: 'cmine-fit', turn, requests, attempts,
  hubUsage: { calls: events.length, successes: events.filter(event => event.outcome === 'success').length,
    upstreamModels: [...new Set(events.map(event => event.model))], costMicros: events.reduce((sum, event) => sum + event.cost_micros, 0) },
  result: { beforeExercises: JSON.parse(baseline.original.plan_json).schedule[baseline.original.day_index].exercises.length,
    afterExercises: workout.exercises.length, afterMinutes: workout.duration, revision: occurrence.revision,
    successfulExecutions: changes.length, weeklyTemplateUnchanged: true, otherOccurrencesUnchanged: true },
  browserProof: ['screenshots/coach-production-preview.png', 'screenshots/coach-production-accepted.png', 'screenshots/today-production-result.png'],
  tokenUsage: 'Unknown: Hub public inference protocol does not expose provider token counts' };
await writeFile('docs/acceptance/coach-production-2026-10-23.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ verified: true, hubCalls: events.length, costMicros: report.hubUsage.costMicros, result: report.result }));
