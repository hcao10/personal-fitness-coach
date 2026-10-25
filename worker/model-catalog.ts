import type { WorkerEnv } from "./platform";

const MODELS_DEV_URL = "https://models.dev/api.json";
const CATALOG_TTL_MS = 60 * 60 * 1000;

type CatalogModelRecord = {
  name?: string;
  description?: string;
  reasoning?: boolean;
  reasoning_options?: { type?: string; values?: string[] } | Array<{ type?: string; values?: string[] }>;
  structured_output?: boolean;
  status?: string;
  release_date?: string;
  last_updated?: string;
  modalities?: { input?: string[]; output?: string[] };
  cost?: { input?: number; output?: number };
  limit?: { context?: number; output?: number };
};

type CatalogProviderRecord = {
  name?: string;
  npm?: string;
  doc?: string;
  models?: Record<string, CatalogModelRecord>;
};

type ModelsDevCatalog = Record<string, CatalogProviderRecord>;

let cachedCatalog: { expiresAt: number; value: ModelsDevCatalog } | null = null;
const cachedConnections = new Map<string, { expiresAt: number; value: Awaited<ReturnType<typeof testProviderKey>> }>();

async function modelsDevCatalog(): Promise<ModelsDevCatalog> {
  if (cachedCatalog && cachedCatalog.expiresAt > Date.now()) return cachedCatalog.value;
  const response = await fetch(MODELS_DEV_URL, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`MODELS_DEV_${response.status}`);
  const value = await response.json() as ModelsDevCatalog;
  cachedCatalog = { value, expiresAt: Date.now() + CATALOG_TTL_MS };
  return value;
}

function reasoningEfforts(model: CatalogModelRecord): string[] {
  const options = Array.isArray(model.reasoning_options) ? model.reasoning_options : model.reasoning_options ? [model.reasoning_options] : [];
  return options.flatMap((option) => option.type === "effort" && Array.isArray(option.values) ? option.values : []);
}

function openAiModelsUrl(env: WorkerEnv): string {
  if (!env.OPENAI_BASE_URL) return "https://api.openai.com/v1/models";
  const url = new URL(env.OPENAI_BASE_URL);
  url.pathname = url.pathname.replace(/\/responses\/?$/, "/models");
  if (!url.pathname.endsWith("/models")) url.pathname = `${url.pathname.replace(/\/$/, "")}/models`;
  url.search = "";
  return url.toString();
}

function providerModelsRequest(env: WorkerEnv, provider: string): { url: string; token: string } | null {
  if (provider === "openai" && env.OPENAI_API_KEY) return { url: openAiModelsUrl(env), token: env.OPENAI_API_KEY };
  if (provider === "compatible" && env.AI_COMPAT_BASE_URL && env.AI_COMPAT_API_KEY) {
    return { url: `${env.AI_COMPAT_BASE_URL.replace(/\/$/, "")}/models`, token: env.AI_COMPAT_API_KEY };
  }
  return null;
}

function friendlyProviderError(status: number): string {
  if (status === 401) return "API Key 无效、已撤销，或并非这个提供商的密钥。";
  if (status === 403) return "API Key 已识别，但没有读取模型目录的权限。";
  if (status === 429) return "提供商暂时限制了请求频率，请稍后重试。";
  return `提供商返回了 ${status}，暂时无法读取可用模型。`;
}

export async function testProviderKey(env: WorkerEnv, provider: string, model?: string) {
  const request = providerModelsRequest(env, provider);
  if (!request) return { ok: false, configured: false, latencyMs: 0, modelIds: [] as string[], message: "该提供商尚未配置 API Key 或接口地址。" };
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(request.url, {
      headers: { authorization: `Bearer ${request.token}`, accept: "application/json" },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null) as { data?: Array<{ id?: unknown }> } | null;
    const modelIds = Array.isArray(payload?.data)
      ? payload.data.map((entry) => typeof entry.id === "string" ? entry.id : "").filter(Boolean).sort()
      : [];
    if (!response.ok) return { ok: false, configured: true, latencyMs: Date.now() - startedAt, modelIds: [], message: friendlyProviderError(response.status) };
    if (model && !modelIds.includes(model)) {
      return { ok: false, configured: true, latencyMs: Date.now() - startedAt, modelIds, message: `API Key 有效，但当前账号没有模型 ${model}。` };
    }
    return { ok: true, configured: true, latencyMs: Date.now() - startedAt, modelIds, message: `API Key 有效，读取到 ${modelIds.length} 个可用模型。` };
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    return { ok: false, configured: true, latencyMs: Date.now() - startedAt, modelIds: [], message: timedOut ? "连接提供商超时。" : "无法连接提供商的模型接口。" };
  } finally {
    clearTimeout(timer);
  }
}

async function cachedProviderConnection(env: WorkerEnv, provider: string) {
  const request = providerModelsRequest(env, provider);
  const key = `${provider}:${request?.url || "unconfigured"}`;
  const cached = cachedConnections.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await testProviderKey(env, provider);
  cachedConnections.set(key, { value, expiresAt: Date.now() + 10 * 60 * 1000 });
  return value;
}

export async function modelCatalogSnapshot(env: WorkerEnv, providerId: string) {
  const selectedProvider = providerId.trim().slice(0, 80) || "openai";
  const [catalogResult, connection] = await Promise.all([
    modelsDevCatalog().then((catalog) => ({ catalog, error: "" })).catch(() => ({ catalog: {} as ModelsDevCatalog, error: "开源模型目录暂时不可用。" })),
    selectedProvider === "openai" || selectedProvider === "compatible"
      ? cachedProviderConnection(env, selectedProvider)
      : Promise.resolve({ ok: false, configured: false, latencyMs: 0, modelIds: [] as string[], message: "此提供商当前仅供目录浏览。" }),
  ]);
  const available = new Set(connection.modelIds);
  const provider = catalogResult.catalog[selectedProvider];
  const models = Object.entries(provider?.models || {}).map(([id, model]) => ({
    id,
    name: model.name || id,
    description: model.description || "",
    reasoning: model.reasoning === true,
    reasoningEfforts: reasoningEfforts(model),
    structuredOutput: model.structured_output === true,
    status: model.status || "active",
    releaseDate: model.release_date || null,
    lastUpdated: model.last_updated || null,
    modalities: model.modalities || { input: [], output: [] },
    cost: model.cost || null,
    limits: model.limit || null,
    available: available.has(id),
    selectable: selectedProvider === "openai" && available.has(id) && model.reasoning === true && model.structured_output === true && model.status !== "deprecated" && model.modalities?.output?.includes("text"),
  })).sort((a, b) => Number(b.selectable) - Number(a.selectable) || String(b.releaseDate || "").localeCompare(String(a.releaseDate || "")) || a.name.localeCompare(b.name));
  const providers = Object.entries(catalogResult.catalog).map(([id, item]) => ({
    id,
    name: item.name || id,
    npm: item.npm || "",
    doc: item.doc || "",
    modelCount: Object.keys(item.models || {}).length,
    configured: id === "openai" ? Boolean(env.OPENAI_API_KEY) : false,
    runtime: id === "openai" ? "direct" : item.npm === "@ai-sdk/openai-compatible" ? "compatible_catalog" : "catalog_only",
  })).sort((a, b) => Number(b.configured) - Number(a.configured) || a.name.localeCompare(b.name));
  return { source: "models.dev", sourceUrl: MODELS_DEV_URL, error: catalogResult.error, selectedProvider, providers, models, connection };
}
