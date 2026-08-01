import Constants from "expo-constants";
import { accessToken } from "./auth";
export const origin = (Constants.expoConfig?.extra as { apiOrigin?: string } | undefined)?.apiOrigin || "https://fit.chwjh.com";

export async function apiRequest(path: string, init: RequestInit = {}) {
  const token = await accessToken();
  return fetch(`${origin}${path}`, { ...init, headers: { accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers } });
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiRequest(path, init);
  const value = await response.json().catch(() => null) as T & { message?: string };
  if (!response.ok) throw new Error(value?.message || `API_${response.status}`);
  return value;
}
