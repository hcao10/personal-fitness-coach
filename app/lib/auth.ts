"use client";

import { translator, type Locale } from "../../packages/i18n/src";

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

export async function beginCmineLogin(returnTo: string, locale: Locale): Promise<{ ok: boolean; message?: string }> {
  // Not a component, so useT() is unavailable here. Following app/lib/api-error.ts,
  // the locale is a required parameter: every caller is a component and already
  // holds useLocale(), whose value came from resolveLocale() — cookie, then
  // Accept-Language, then the default.
  //
  // Required, not optional. readLocale() reads only the cookie, so on a first
  // visit from an `accept-language: en` browser it answers Chinese while the
  // rest of the page renders English. An optional parameter that no caller
  // passes is the same bug with a wider signature — and that is exactly what
  // this was before the compiler was made to find the call sites.
  const t = translator(locale);
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
