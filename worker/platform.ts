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
  MODEL_HUB_API_KEY?: string;
  MODEL_HUB_COACH_MODEL?: string;
  COACH_RUNTIME_PAUSED?: string;
  OPENAI_MODEL?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_REASONING_EFFORT?: string;
  OPENAI_EMBEDDING_MODEL?: string;
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
  REVENUECAT_WEBHOOK_SECRET?: string;
  REVENUECAT_PROJECT_ID?: string;
  REVENUECAT_API_KEY?: string;
  REVENUECAT_API_BASE?: string;
  REVENUECAT_ALLOW_SANDBOX?: string;
  EXPO_ACCESS_TOKEN?: string;
  EXPO_PUSH_URL?: string;
  CMINE_MOBILE_CLIENT_IDS?: string;
  MAINTENANCE_SECRET?: string;
  APPLE_APP_TEAM_ID?: string;
  ANDROID_APP_SHA256_CERT_FINGERPRINT?: string;
}
