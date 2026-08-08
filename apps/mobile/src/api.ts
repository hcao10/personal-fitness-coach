import Constants from "expo-constants";
import { accessToken } from "./auth";
export const origin = (Constants.expoConfig?.extra as { apiOrigin?: string } | undefined)?.apiOrigin || "https://fit.chwjh.com";

export async function apiRequest(path: string, init: RequestInit = {}) {
  const token = await accessToken();
  return fetch(`${origin}${path}`, { ...init, headers: { accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers } });
}

// Carries the HTTP status so callers can tell a server rejection (4xx — do not
// retry/enqueue) from being offline or a transient server failure.
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export const isRetryableApiError = (error: unknown) =>
  !(error instanceof ApiError) || error.status === 408 || error.status === 429 || error.status >= 500;

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiRequest(path, init);
  const value = await response.json().catch(() => null) as T & { message?: string };
  if (!response.ok) throw new ApiError(value?.message || `API_${response.status}`, response.status);
  return value;
}
