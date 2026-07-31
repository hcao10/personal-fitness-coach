export interface D1Result<T = Record<string, unknown>> {
  success: boolean;
  results?: T[];
  meta?: Record<string, unknown>;
  error?: string;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

export interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface R2ObjectBody {
  body: ReadableStream;
  arrayBuffer(): Promise<ArrayBuffer>;
  httpMetadata?: { contentType?: string };
}

export interface R2Bucket {
  put(key: string, value: ArrayBuffer | ReadableStream | Uint8Array, options?: {
    httpMetadata?: { contentType?: string; cacheControl?: string };
    customMetadata?: Record<string, string>;
  }): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(key: string): Promise<void>;
}

export interface WorkerEnv {
  ASSETS: Fetcher;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
  DB?: D1Database;
  R2?: R2Bucket;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_REASONING_EFFORT?: string;
  CLOUDFLARE_AI_ACCOUNT_ID?: string;
  CLOUDFLARE_AI_TOKEN?: string;
  CLOUDFLARE_AI_GATEWAY_URL?: string;
  CLOUDFLARE_AI_GATEWAY_TOKEN?: string;
  AI_COMPAT_BASE_URL?: string;
  AI_COMPAT_API_KEY?: string;
  AI_COMPAT_TEXT_MODEL?: string;
  AI_COMPAT_VISION_MODEL?: string;
  USDA_API_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_MONTHLY?: string;
  STRIPE_PRICE_YEARLY?: string;
  STRIPE_TAX_ENABLED?: string;
  ADMOB_SSV_KEY_URL?: string;
  CMINE_ISSUER?: string;
  CMINE_CLIENT_ID?: string;
  CMINE_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
  PUBLIC_ORIGIN?: string;
  ADMIN_EMAILS?: string;
  REWARD_AD_PROVIDER?: string;
}
