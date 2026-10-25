/** Manual browser QA server: actual built UI + actual handlers/SQL; protocol-fixture provider, not a real LLM. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import worker from '../dist/server/index.js';
import { fixture } from '../tests/helpers/coach-harness.mjs';
import { wireServer, lastTool, toolCall, finalAnswer } from '../tests/helpers/coach-wire-server.mjs';

const wire = await wireServer(body => {
  const preview = lastTool(body, 'preview_session_change');
  if (preview) return finalAnswer({ proposalIds: [preview.proposalId] });
  if (lastTool(body, 'get_training_context')) return toolCall('preview_session_change', { change: { type: 'shorten_session', availableMinutes: 20 } });
  return toolCall('get_training_context', {});
});
const f = await fixture({ ...wire.env, CMINE_CLIENT_ID: 'local-browser-fixture', CMINE_CLIENT_SECRET: 'local-browser-fixture', SESSION_SECRET: 'local-browser-fixture-only' });
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/__fixture/login') { res.writeHead(302, { 'set-cookie': 'cmine_fit_session=local-test-user-token; Path=/; HttpOnly; SameSite=Lax', location: '/coach' }); res.end(); return; }
    if (url.pathname === '/__fixture/state') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(f.DB.sql.prepare('SELECT id,revision,workout_override_json FROM workout_occurrences').all())); return; }
    if (url.pathname.startsWith('/assets/')) {
      const pathname = path.resolve('dist/client', `.${url.pathname}`);
      if (!pathname.startsWith(path.resolve('dist/client') + path.sep)) throw new Error('invalid path');
      const file = await readFile(pathname);
      res.setHeader('content-type', pathname.endsWith('.js') ? 'application/javascript' : pathname.endsWith('.css') ? 'text/css' : 'application/octet-stream'); res.end(file); return;
    }
    const body = []; for await (const chunk of req) body.push(chunk);
    const cancellation = new AbortController(); res.on('close', () => { if (!res.writableEnded) cancellation.abort(); });
    const request = new Request(url, { method: req.method, headers: req.headers, signal: cancellation.signal,
      ...(body.length ? { body: Buffer.concat(body), duplex: 'half' } : {}) });
    const response = await worker.fetch(request, f.env, { waitUntil: promise => promise.catch(() => {}) });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) for await (const chunk of response.body) res.write(chunk);
    res.end();
  } catch (error) { console.error(error); if (!res.headersSent) res.writeHead(500); res.end('Fixture failed'); }
});
await new Promise(resolve => server.listen(4317, '127.0.0.1', resolve));
console.log('Browser QA ready: http://127.0.0.1:4317/__fixture/login (protocol fixture; not live model validation)');
async function close() { server.closeAllConnections(); server.close(); f.close(); await wire.close(); process.exit(); }
process.on('SIGINT', close); process.on('SIGTERM', close);
