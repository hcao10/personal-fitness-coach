import type { WorkerEnv } from "../platform";
import { embedTexts } from "../embeddings";

type KnowledgeRow = { id: string; title: string; summary: string; keywords: string; source_title: string; publisher: string; url: string };
export type KnowledgeResult = { id: string; title: string; summary: string; publisher: string; url: string; match: "hybrid" | "lexical" };

function tokens(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z0-9]+|[\p{Script=Han}]/gu) || [];
  const han = words.filter((token) => /\p{Script=Han}/u.test(token));
  const bigrams = han.slice(0, -1).map((token, index) => `${token}${han[index + 1]}`);
  return [...new Set([...words.filter((token) => token.length >= 2 || /\p{Script=Han}/u.test(token)), ...bigrams])];
}
function lexicalScore(question: string, row: KnowledgeRow): number {
  const query = tokens(question); if (!query.length) return 0;
  const title = row.title.toLowerCase(); const keywords = row.keywords.toLowerCase(); const summary = row.summary.toLowerCase();
  return query.reduce((score, term) => score + (title.includes(term) ? 3 : 0) + (keywords.includes(term) ? 2 : 0) + (summary.includes(term) ? 1 : 0), 0) / (query.length * 6);
}
function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0; let dot = 0; let aa = 0; let bb = 0;
  for (let index = 0; index < a.length; index += 1) { dot += a[index] * b[index]; aa += a[index] ** 2; bb += b[index] ** 2; }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
function fingerprint(value: string) { let hash = 0x811c9dc5; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 0x01000193) >>> 0; } return hash.toString(16).padStart(8, "0"); }

export async function knowledgeForQuestion(env: WorkerEnv, question: string, signal?: AbortSignal): Promise<KnowledgeResult[]> {
  if (!env.DB) return [];
  const result = await env.DB.prepare(`SELECT a.id,a.title,a.summary,a.keywords,s.title AS source_title,s.publisher,s.url
    FROM knowledge_articles a JOIN knowledge_sources s ON s.id=a.source_id WHERE a.status='active' AND s.status='active' LIMIT 60`).all<KnowledgeRow>();
  const rows = result.results || []; if (!rows.length) return [];
  const lexical = new Map(rows.map((row) => [row.id, lexicalScore(question, row)]));
  try {
    const stored = await env.DB.prepare("SELECT article_id,model,content_hash,embedding_json FROM knowledge_embeddings").all<{ article_id: string; model: string; content_hash: string; embedding_json: string }>();
    const byId = new Map((stored.results || []).map((entry) => [entry.article_id, entry]));
    const expectedModel = env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
    const missing = rows.filter((row) => byId.get(row.id)?.model !== expectedModel || byId.get(row.id)?.content_hash !== fingerprint(`${row.title}\n${row.summary}\n${row.keywords}`));
    const batch = await embedTexts(env, [question, ...missing.map((row) => `${row.title}\n${row.summary}\n${row.keywords}`)], signal);
    if (batch) {
      const now = new Date().toISOString();
      if (missing.length) await env.DB.batch(missing.map((row, index) => env.DB!.prepare(`INSERT INTO knowledge_embeddings
        (article_id,model,dimensions,content_hash,embedding_json,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(article_id) DO UPDATE SET
        model=excluded.model,dimensions=excluded.dimensions,content_hash=excluded.content_hash,embedding_json=excluded.embedding_json,updated_at=excluded.updated_at`)
        .bind(row.id, batch.model, batch.vectors[index + 1].length, fingerprint(`${row.title}\n${row.summary}\n${row.keywords}`), JSON.stringify(batch.vectors[index + 1]), now)));
      const fresh = new Map(missing.map((row, index) => [row.id, batch.vectors[index + 1]]));
      return rows.map((row) => { const entry = byId.get(row.id); let vector = fresh.get(row.id); if (!vector && entry) try { vector = JSON.parse(entry.embedding_json) as number[]; } catch { /* lexical fallback */ }
        return { row, score: (vector ? Math.max(0, cosine(batch.vectors[0], vector)) : 0) * .65 + (lexical.get(row.id) || 0) * .35 }; })
        .filter((item) => item.score >= .18).sort((a, b) => b.score - a.score).slice(0, 4)
        .map(({ row }) => ({ id: row.id, title: row.title, summary: row.summary, publisher: row.publisher, url: row.url, match: "hybrid" as const }));
    }
  } catch { signal?.throwIfAborted(); /* Embeddings enhance retrieval; reviewed lexical retrieval remains available. */ }
  return rows.map((row) => ({ row, score: lexical.get(row.id) || 0 })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 4)
    .map(({ row }) => ({ id: row.id, title: row.title, summary: row.summary, publisher: row.publisher, url: row.url, match: "lexical" as const }));
}
