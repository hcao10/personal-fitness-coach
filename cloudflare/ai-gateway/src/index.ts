interface AiBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

interface Env {
  AI: AiBinding;
  INTERNAL_API_TOKEN: string;
}

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<{
    type?: string;
    text?: string;
    image_url?: { url?: string };
  }>;
};

type ChatRequest = {
  model?: unknown;
  messages?: unknown;
  max_completion_tokens?: unknown;
  response_format?: {
    type?: unknown;
    json_schema?: {
      schema?: Record<string, unknown>;
    } & Record<string, unknown>;
  };
};

const ALLOWED_MODELS = new Set([
  "@cf/meta/llama-3.1-8b-instruct-fast",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/meta/llama-3.2-11b-vision-instruct",
  "@cf/moonshotai/kimi-k2.6",
]);

function secureEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function normalizeMessages(messages: ChatMessage[]): {
  messages: Array<{ role: string; content: string }>;
  image?: string;
} {
  let image: string | undefined;
  const normalized = messages.map((message) => {
    if (typeof message.content === "string") {
      return { role: message.role, content: message.content };
    }
    const text: string[] = [];
    for (const part of message.content) {
      if (part?.type === "text" && typeof part.text === "string") text.push(part.text);
      const imageUrl = part?.image_url?.url;
      if (!image && typeof imageUrl === "string" && /^data:image\/(?:jpeg|png|webp);base64,/i.test(imageUrl)) {
        image = imageUrl;
      }
    }
    return { role: message.role, content: text.join("\n") };
  });
  return { messages: normalized, ...(image ? { image } : {}) };
}

const handler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const authorization = request.headers.get("authorization") || "";
    const suppliedToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!env.INTERNAL_API_TOKEN || !secureEqual(suppliedToken, env.INTERNAL_API_TOKEN)) {
      return json({ error: { message: "Unauthorized" } }, 401);
    }
    if (request.method !== "POST") return json({ error: { message: "Method not allowed" } }, 405);
    const url = new URL(request.url);
    if (url.pathname === "/internal/accept-meta-vision") {
      try {
        const result = await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", { prompt: "agree" });
        return json({ ok: true, result });
      } catch (error) {
        return json({ error: { message: error instanceof Error ? error.message.slice(0, 240) : "License request failed" } }, 502);
      }
    }
    if (Number(request.headers.get("content-length") || 0) > 4_000_000) {
      return json({ error: { message: "Request too large" } }, 413);
    }

    const body = await request.json().catch(() => null) as ChatRequest | null;
    const model = typeof body?.model === "string" ? body.model : "";
    if (!ALLOWED_MODELS.has(model)) return json({ error: { message: "Model is not allowed" } }, 400);
    if (!Array.isArray(body?.messages) || body.messages.length < 1 || body.messages.length > 12) {
      return json({ error: { message: "Messages are invalid" } }, 400);
    }
    const messages = body.messages.filter((item): item is ChatMessage => {
      if (!item || typeof item !== "object") return false;
      const message = item as ChatMessage;
      return ["system", "user", "assistant"].includes(message.role) &&
        (typeof message.content === "string" || Array.isArray(message.content));
    });
    if (messages.length !== body.messages.length) return json({ error: { message: "Messages are invalid" } }, 400);

    const normalized = normalizeMessages(messages);
    const maxTokens = Math.min(9000, Math.max(128, Number(body.max_completion_tokens) || 2048));
    const wrappedSchema = body.response_format?.json_schema;
    const jsonSchema = wrappedSchema?.schema || wrappedSchema;
    const input: Record<string, unknown> = {
      ...normalized,
      max_tokens: maxTokens,
      ...(body.response_format?.type === "json_schema" && jsonSchema
        ? { response_format: { type: "json_schema", json_schema: jsonSchema } }
        : {}),
    };

    try {
      const result = await env.AI.run(model, input) as {
        response?: unknown;
        usage?: unknown;
      };
      const response = typeof result?.response === "string"
        ? result.response
        : JSON.stringify(result?.response ?? result);
      return json({
        result: { response, usage: result?.usage || null },
        id: crypto.randomUUID(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 240) : "Workers AI request failed";
      return json({ error: { message } }, 502);
    }
  },
};

export default handler;
