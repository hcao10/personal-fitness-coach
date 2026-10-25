"use client";

import { errorMessage, type Locale } from "../../../packages/i18n/src";

/**
 * One way to call this product's API.
 *
 * There were 87 bare `fetch("/api/...")` call sites, each with its own idea of
 * what a failure is. Some parsed JSON on a 500 and threw; some treated a 401 as
 * a redirect; most had no timeout, which is how a hung request became a
 * permanent spinner. This module answers those four questions once:
 *
 *   - a request that does not answer within `timeoutMs` fails as `timeout`,
 *     never as silence;
 *   - a 401 is `auth`, and the caller decides whether that means guest mode or
 *     a sign-in prompt — the client never navigates on its own;
 *   - a refusal because the deployment lacks credentials is `capability`, which
 *     is not an error to show in red;
 *   - the body is parsed at most once, and a non-JSON body is a `server`
 *     failure rather than a thrown SyntaxError.
 */

export type ApiFailureKind = "auth" | "capability" | "network" | "timeout" | "server" | "client" | "aborted" | "rate_limited";

export type ApiFailure = {
  ok: false;
  status: number;
  /** Stable machine code from the server, or a client-side one. */
  code: string;
  kind: ApiFailureKind;
  retryable: boolean;
  /** Server-authored text, in the language the server was written in. */
  serverMessage?: string;
};

export type ApiResult<T> = { ok: true; status: number; data: T } | ApiFailure;

export const DEFAULT_TIMEOUT_MS = 15_000;

/** Codes the server uses to say "this deployment does not have that". */
const CAPABILITY_CODES = new Set([
  "DATABASE_NOT_CONFIGURED", "STRIPE_NOT_CONFIGURED", "REWARD_AD_NOT_CONFIGURED",
  "MOBILE_LINK_NOT_CONFIGURED", "EXERCISE_CATALOG_UNAVAILABLE", "AI_NOT_CONFIGURED",
]);

function classify(status: number, code: string): { kind: ApiFailureKind; retryable: boolean } {
  if (status === 401) return { kind: "auth", retryable: false };
  if (status === 429) return { kind: "rate_limited", retryable: true };
  if (status === 503 || CAPABILITY_CODES.has(code) || code.endsWith("_NOT_CONFIGURED")) return { kind: "capability", retryable: false };
  if (status >= 500) return { kind: "server", retryable: true };
  return { kind: "client", retryable: false };
}

export type ApiOptions = RequestInit & { timeoutMs?: number; signal?: AbortSignal };

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<ApiResult<T>> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...init } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("timeout", "TimeoutError")), timeoutMs);
  // A caller's own abort (a user pressing stop, a component unmounting) has to
  // reach the same request as the timeout, and stay distinguishable from it.
  const onExternalAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", onExternalAbort, { once: true });
  try {
    const response = await fetch(path, {
      cache: "no-store",
      ...init,
      headers: init.body ? { "content-type": "application/json", ...init.headers } : init.headers,
      signal: controller.signal,
    });
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try { body = JSON.parse(text); } catch {
        return { ok: false, status: response.status, code: "INVALID_RESPONSE", kind: "server", retryable: true };
      }
    }
    if (response.ok) return { ok: true, status: response.status, data: body as T };
    const error = (body || {}) as { error?: string; message?: string };
    const code = error.error || `HTTP_${response.status}`;
    return { ok: false, status: response.status, code, serverMessage: error.message, ...classify(response.status, code) };
  } catch (caught) {
    if (signal?.aborted) return { ok: false, status: 0, code: "ABORTED", kind: "aborted", retryable: false };
    const isTimeout = caught instanceof DOMException && caught.name === "TimeoutError";
    return isTimeout
      ? { ok: false, status: 0, code: "TIMEOUT", kind: "timeout", retryable: true }
      : { ok: false, status: 0, code: "NETWORK_UNREACHABLE", kind: "network", retryable: true };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onExternalAbort);
  }
}

export const apiPost = <T>(path: string, body: unknown, options: ApiOptions = {}): Promise<ApiResult<T>> =>
  apiFetch<T>(path, { ...options, method: "POST", body: JSON.stringify(body) });

export const apiPut = <T>(path: string, body: unknown, options: ApiOptions = {}): Promise<ApiResult<T>> =>
  apiFetch<T>(path, { ...options, method: "PUT", body: JSON.stringify(body) });

/**
 * The catalog entry that describes a whole class of failure, for the cases the
 * server never got to name — a request that timed out has no server code.
 */
const KIND_MESSAGE_CODE: Record<ApiFailureKind, string> = {
  auth: "AUTH_REQUIRED",
  capability: "CAPABILITY_UNAVAILABLE",
  network: "NETWORK_UNREACHABLE",
  timeout: "REQUEST_TIMEOUT",
  server: "SERVER_ERROR",
  client: "REQUEST_REJECTED",
  aborted: "REQUEST_ABORTED",
  rate_limited: "RATE_LIMITED",
};

/**
 * A failure in the reader's language.
 *
 * Resolution order matters and the obvious one is wrong — see
 * app/lib/api-error.ts, whose reasoning this reuses: `serverMessage` is authored
 * in Chinese, so it is only ever shown to a reader of Chinese.
 */
export function describeFailure(failure: ApiFailure, locale: Locale, fallback: string): string {
  const translated = errorMessage(failure.code, locale);
  if (translated) return translated;
  const byKind = errorMessage(KIND_MESSAGE_CODE[failure.kind], locale);
  if (byKind) return byKind;
  if (locale === "zh" && failure.serverMessage) return failure.serverMessage;
  return fallback;
}
