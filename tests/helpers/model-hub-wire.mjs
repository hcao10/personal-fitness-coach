import { createServer } from 'node:http';
/** Explicit protocol fixture. Real HTTP + production adapter/SQL; not real inference. */
export async function hubWire(answer) {
  const original = globalThis.fetch; const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString(); const body = raw ? JSON.parse(raw) : null;
    requests.push({ path: request.url, method: request.method, headers: request.headers, body });
    try {
      const result = await answer(requests.at(-1), requests.length);
      response.writeHead(result.status || 200, { 'content-type': 'application/json', ...result.headers });
      response.end(JSON.stringify(result.body));
    } catch { response.writeHead(500); response.end('{}'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  globalThis.fetch = (url, init) => {
    if (String(url).startsWith('https://ai.chwjh.com/')) return original(String(url).replace('https://ai.chwjh.com', origin), init);
    throw new Error('Test forbids provider fallback and other outbound network requests');
  };
  return { requests, env: { MODEL_HUB_API_KEY: 'mh_explicit_protocol_fixture', MODEL_HUB_COACH_MODEL: 'test-fast' },
    async close() { globalThis.fetch = original; server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
export const decision = (kind = 'answer', override = {}) => ({ kind, reply: kind === 'answer' ? '已按今天的实际训练生成预览，确认后生效。' : '',
  intent: 'adjust_today', safety: { highRisk: false, category: 'none', detail: '' }, evidenceIds: ['today'], knowledgeIds: [], proposalIds: [], limitations: ['时长为估算。'],
  changeType: 'none', availableMinutes: null, exerciseInstanceId: null, replacementExerciseId: null, loadMultiplier: null,
  exerciseId: null, days: null, question: null, ...override });
