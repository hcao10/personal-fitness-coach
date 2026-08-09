"use client";

import { translator } from "../../packages/i18n/src";
import { readLocale } from "./locale-client";

export type CmineUser = {
  sub: string;
  email?: string | null;
  name?: string | null;
  picture?: string | null;
  role?: "user" | "admin";
};
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
  // Not a component, so useT() is unavailable here. The locale is read from the
  // cookie the language switcher persists, at call time rather than at module
  // scope, so a switch during the session is picked up.
  const t = translator(readLocale());
  try {
    const response = await fetch("/api/auth/config", { cache: "no-store" });
    const config = await response.json() as { cmine?: boolean };
    if (!config.cmine) return { ok: false, message: t("auth.signInUnavailable") };
    const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
    window.location.assign(`/api/auth/cmine/start?returnTo=${encodeURIComponent(safeReturnTo)}`);
    return { ok: true };
  } catch {
    return { ok: false, message: t("auth.signInServiceUnreachable") };
  }
}

export async function signOutCmine(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
}
