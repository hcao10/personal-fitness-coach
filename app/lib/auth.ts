"use client";

export type CmineUser = { sub: string; email?: string; name?: string; picture?: string };
export const AUTH_PROVIDERS = [
  { id: "cmine", label: "Cmine ID", enabled: true },
  { id: "apple", label: "Apple", enabled: false },
  { id: "google", label: "Google", enabled: false },
  { id: "wechat", label: "WeChat", enabled: false },
] as const;

const CMINE_ISSUER = process.env.NEXT_PUBLIC_CMINE_ISSUER || "https://identity.chwjh.com";
const CMINE_CLIENT_ID = process.env.NEXT_PUBLIC_CMINE_CLIENT_ID || "";
const TOKEN_KEY = "forma_cmine_access_token";
const USER_KEY = "forma_cmine_user";

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function getCmineUser(): CmineUser | null {
  if (typeof window === "undefined") return null;
  const value = sessionStorage.getItem(USER_KEY);
  if (!value) return null;
  try { return JSON.parse(value) as CmineUser; } catch { return null; }
}

export async function beginCmineLogin(): Promise<{ ok: boolean; message?: string }> {
  if (!CMINE_CLIENT_ID) {
    return { ok: false, message: "Cmine ID 接口已就绪；请先在部署环境配置 NEXT_PUBLIC_CMINE_CLIENT_ID 并登记回调地址。" };
  }
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(48)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = base64Url(new Uint8Array(digest));
  const state = crypto.randomUUID();
  sessionStorage.setItem("forma_pkce_verifier", verifier);
  sessionStorage.setItem("forma_oauth_state", state);
  const redirectUri = window.location.origin + "/auth/cmine/callback";
  const authorize = new URL(CMINE_ISSUER + "/oauth/authorize");
  authorize.search = new URLSearchParams({
    response_type: "code", client_id: CMINE_CLIENT_ID, redirect_uri: redirectUri,
    scope: "openid profile email", state, code_challenge: challenge, code_challenge_method: "S256",
  }).toString();
  window.location.assign(authorize.toString());
  return { ok: true };
}

export async function finishCmineLogin(code: string, returnedState: string): Promise<CmineUser> {
  const verifier = sessionStorage.getItem("forma_pkce_verifier");
  const expectedState = sessionStorage.getItem("forma_oauth_state");
  if (!verifier || !expectedState || expectedState !== returnedState) throw new Error("登录状态已过期或校验失败，请重新登录。");
  if (!CMINE_CLIENT_ID) throw new Error("Cmine ID client_id 未配置。");
  const response = await fetch(CMINE_ISSUER + "/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code", client_id: CMINE_CLIENT_ID, code,
      redirect_uri: window.location.origin + "/auth/cmine/callback", code_verifier: verifier,
    }),
  });
  if (!response.ok) throw new Error("Cmine ID 令牌交换失败，请重试。");
  const tokens = await response.json() as { access_token: string };
  const userResponse = await fetch(CMINE_ISSUER + "/oauth/userinfo", { headers: { authorization: "Bearer " + tokens.access_token } });
  if (!userResponse.ok) throw new Error("无法读取 Cmine ID 用户信息。");
  const user = await userResponse.json() as CmineUser;
  sessionStorage.setItem(TOKEN_KEY, tokens.access_token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  sessionStorage.removeItem("forma_pkce_verifier");
  sessionStorage.removeItem("forma_oauth_state");
  return user;
}

export function signOutCmine(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}
