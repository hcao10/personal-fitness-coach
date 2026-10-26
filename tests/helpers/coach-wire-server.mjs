import { createServer } from 'node:http';

/** Protocol fixture, explicitly NOT an LLM. Requests travel over actual HTTP through the real SDK. */
export async function wireServer(answer, { responses = false } = {}) {
  const requests = [];
  const server = createServer(async (request, response) => {
    let text = ''; for await (const chunk of request) text += chunk;
    const body = JSON.parse(text); requests.push(body);
    try {
      const message = await answer(body, requests.length, response);
      if (!message || response.destroyed) return;
      response.writeHead(200, { 'content-type': 'application/json' });
      if (responses) {
        response.end(JSON.stringify({ id: `resp-wire-${requests.length}`, object: 'response', created_at: 1, status: 'completed', model: body.model,
          error: null, incomplete_details: null, output: message.output,
          usage: { input_tokens: 100, output_tokens: 80, total_tokens: 180, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } }));
        return;
      }
      response.end(JSON.stringify({ id: `wire-response-${requests.length}`, object: 'chat.completion', created: 1,
        model: body.model, choices: [{ index: 0, message: { role: 'assistant', ...message }, finish_reason: message.tool_calls ? 'tool_calls' : 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 80, total_tokens: 180 } }));
    } catch { response.writeHead(500); response.end('{}'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { requests, env: responses
    ? { OPENAI_BASE_URL: `http://127.0.0.1:${server.address().port}/v1/responses`, OPENAI_API_KEY: 'local-wire-fixture', OPENAI_MODEL: 'responses-test-model' }
    : { AI_COMPAT_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`, AI_COMPAT_API_KEY: 'local-wire-fixture', AI_COMPAT_TEXT_MODEL: 'wire-test-model' },
    async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}

export const toolCall = (name, args, id = name) => ({ content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] });
export function lastTool(body, name) {
  const messages = body.messages.filter(message => message.role === 'tool');
  const calls = body.messages.flatMap(message => message.tool_calls || []);
  const call = [...calls].reverse().find(call => call.function.name === name);
  const result = messages.find(message => message.tool_call_id === call?.id);
  return result ? JSON.parse(result.content) : null;
}
export const finalAnswer = (overrides = {}) => ({ content: JSON.stringify({ reply: '我已结合今天的实际训练生成调整预览，请确认后再执行。', intent: 'adjust_today',
  safety: { highRisk: false, category: 'none', detail: '' }, evidenceIds: ['today'], knowledgeIds: [], proposalIds: [], limitations: ['训练时长是估算值。'], ...overrides }) });
