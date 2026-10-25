import type { WorkerEnv } from '../platform.ts';

const ORIGIN = 'https://ai.chwjh.com';
export class ModelHubError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 0) { super(code); this.name = 'ModelHubError'; this.code = code; this.status = status; }
}
export async function hubUserId(userId: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`cmine-fit:${userId}`));
  return `fit:${Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join('')}`;
}
export async function hubRequest(env: WorkerEnv, userId: string, path: '/v1/infer' | '/v1/tasks' | '/v1/models' | '/v1/privacy/export' | '/v1/privacy/user', options: {
  body?: unknown; requestId?: string; method?: string; signal?: AbortSignal;
} = {}) {
  if (!env.MODEL_HUB_API_KEY) throw new ModelHubError('MODEL_HUB_NOT_CONFIGURED');
  const response = await fetch(`${ORIGIN}${path}`, {
    method: options.method || (options.body === undefined ? 'GET' : 'POST'), redirect: 'manual',
    headers: { authorization: `Bearer ${env.MODEL_HUB_API_KEY}`, 'X-User-ID': await hubUserId(userId),
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(options.requestId ? { 'Idempotency-Key': options.requestId } : {}) },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    signal: AbortSignal.any([options.signal || new AbortController().signal, AbortSignal.timeout(25000)]),
  });
  if (response.status >= 300 && response.status < 400) throw new ModelHubError('MODEL_HUB_REDIRECT_REFUSED', response.status);
  // Stream bounded responses; do not read an arbitrarily large body before checking its size.
  const reader = response.body?.getReader(); let bytes = 0; const chunks: Uint8Array[] = [];
  try {
    while (reader) {
      const next = await reader.read(); if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 128 * 1024) { await reader.cancel(); throw new ModelHubError('MODEL_HUB_RESPONSE_TOO_LARGE', response.status); }
      chunks.push(next.value);
    }
  } finally { reader?.releaseLock(); }
  const buffer = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  let body: Record<string, unknown>;
  try { body = JSON.parse(new TextDecoder().decode(buffer)); }
  catch { throw new ModelHubError('MODEL_HUB_INVALID_RESPONSE', response.status); }
  if (!response.ok) {
    const code = typeof body.error === 'string' && /^[a-z_]{1,70}$/.test(body.error) ? body.error.toUpperCase() : `HTTP_${response.status}`;
    throw new ModelHubError(`MODEL_HUB_${code}`, response.status);
  }
  return { body, status: response.status };
}
