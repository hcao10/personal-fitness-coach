"use client";

export type CmineUser = { sub: string; email?: string | null; name?: string | null; picture?: string | null };
export const AUTH_PROVIDERS = [
  { id: "cmine", label: "Cmine ID", enabled: true },
  { id: "apple", label: "Apple", enabled: false },
  { id: "google", label: "Google", enabled: false },
  { id: "wechat", label: "WeChat", enabled: false },
] as const;

export async function getCmineSession(): Promise<{ user: CmineUser | null; points: number }> {
  try {
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    if (!response.ok) return { user: null, points: 0 };
    return await response.json() as { user: CmineUser | null; points: number };
  } catch {
    return { user: null, points: 0 };
  }
}

export async function beginCmineLogin(): Promise<{ ok: boolean; message?: string }> {
  try {
    const response = await fetch("/api/auth/config", { cache: "no-store" });
    const config = await response.json() as { cmine?: boolean };
    if (!config.cmine) return { ok: false, message: "Cmine ID 服务端登录代码已接入，但生产 client_id 尚未配置。" };
    window.location.assign("/api/auth/cmine/start?returnTo=/");
    return { ok: true };
  } catch {
    return { ok: false, message: "暂时无法连接登录服务，请稍后重试。" };
  }
}

export async function signOutCmine(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
}
