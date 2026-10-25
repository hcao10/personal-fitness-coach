import type { WorkerEnv } from "./platform";

export type EmbeddingBatch = { model: string; vectors: number[][] };

function embeddingsUrl(env: WorkerEnv) {
  if (!env.OPENAI_BASE_URL) return "https://api.openai.com/v1/embeddings";
  const url = new URL(env.OPENAI_BASE_URL);
  url.pathname = url.pathname.replace(/\/responses\/?$/, "/embeddings");
  if (!url.pathname.endsWith("/embeddings")) url.pathname = `${url.pathname.replace(/\/$/, "")}/embeddings`;
  url.search = "";
  return url.toString();
}

export async function embedTexts(env: WorkerEnv, texts: string[], signal?: AbortSignal): Promise<EmbeddingBatch | null> {
  if (!env.OPENAI_API_KEY || !texts.length) return null;
  const model = env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
  const response = await fetch(embeddingsUrl(env), {
    signal,
    method: "POST", headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model, input: texts.map((text) => text.slice(0, 6000)), encoding_format: "float" }),
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null) as { data?: Array<{ index?: number; embedding?: number[] }>; model?: string } | null;
  const vectors = (payload?.data || []).sort((a, b) => Number(a.index || 0) - Number(b.index || 0)).map((item) => item.embedding || []);
  return vectors.length === texts.length && vectors.every((vector) => vector.length > 0) ? { model: payload?.model || model, vectors } : null;
}

