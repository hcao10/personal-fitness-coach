"use client";

export type CmineUser = { sub: string; email?: string | null; name?: string | null; picture?: string | null };
export const AUTH_PROVIDERS = [
  { id: "cmine", label: "Cmine ID", enabled: true },
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

export async function beginCmineLogin(returnTo = "/"): Promise<{ ok: boolean; message?: string }> {
  try {
    const response = await fetch("/api/auth/config", { cache: "no-store" });
    const config = await response.json() as { cmine?: boolean };
    if (!config.cmine) return { ok: false, message: "Cmine ID 登录暂时不可用，请稍后再试。" };
    const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
    window.location.assign(`/api/auth/cmine/start?returnTo=${encodeURIComponent(safeReturnTo)}`);
    return { ok: true };
  } catch {
    return { ok: false, message: "暂时无法连接登录服务，请稍后重试。" };
  }
}

export async function signOutCmine(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
}
