import Constants from "expo-constants";
import * as AuthSession from "expo-auth-session";
import * as SecureStore from "expo-secure-store";

const extra = Constants.expoConfig?.extra as { cmineIssuer?: string; cmineClientId?: string } | undefined;
const issuer = extra?.cmineIssuer || "https://identity.chwjh.com";
const clientId = extra?.cmineClientId || "";
const redirectUri = AuthSession.makeRedirectUri({ native: "https://fit.chwjh.com/auth/mobile/callback", scheme: "cminefit", path: "auth/callback" });
const discovery = { authorizationEndpoint: `${issuer}/oauth/authorize`, tokenEndpoint: `${issuer}/oauth/token`, revocationEndpoint: `${issuer}/oauth/revoke` };

export async function signIn() {
  if (!clientId) throw new Error("CMINE_MOBILE_CLIENT_NOT_CONFIGURED");
  const request = new AuthSession.AuthRequest({ clientId, redirectUri, responseType: AuthSession.ResponseType.Code, scopes: ["openid", "profile", "email", "offline_access"], usePKCE: true });
  const result = await request.promptAsync(discovery);
  if (result.type !== "success" || !result.params.code || !request.codeVerifier) throw new Error("CMINE_LOGIN_CANCELLED");
  const token = await AuthSession.exchangeCodeAsync({ clientId, code: result.params.code, redirectUri, extraParams: { code_verifier: request.codeVerifier } }, discovery);
  await SecureStore.setItemAsync("cmine_access_token", token.accessToken);
  if (token.refreshToken) await SecureStore.setItemAsync("cmine_refresh_token", token.refreshToken);
  if (token.expiresIn) await SecureStore.setItemAsync("cmine_token_expires_at", String(Date.now() + token.expiresIn * 1000));
  return token;
}

async function persistToken(token: AuthSession.TokenResponse) {
  await SecureStore.setItemAsync("cmine_access_token", token.accessToken);
  if (token.refreshToken) await SecureStore.setItemAsync("cmine_refresh_token", token.refreshToken);
  if (token.expiresIn) await SecureStore.setItemAsync("cmine_token_expires_at", String(Date.now() + token.expiresIn * 1000));
}

export async function accessToken() {
  const [token, expiry] = await Promise.all([SecureStore.getItemAsync("cmine_access_token"), SecureStore.getItemAsync("cmine_token_expires_at")]);
  if (token && (!expiry || Number(expiry) > Date.now() + 60_000)) return token;
  const refreshToken = await SecureStore.getItemAsync("cmine_refresh_token");
  if (!refreshToken || !clientId) return token;
  try {
    const refreshed = await AuthSession.refreshAsync({ clientId, refreshToken }, discovery);
    await persistToken(refreshed);
    return refreshed.accessToken;
  } catch {
    await signOut();
    return null;
  }
}
export async function deviceId() {
  const existing = await SecureStore.getItemAsync("cmine_device_id");
  if (existing) return existing;
  const value = crypto.randomUUID(); await SecureStore.setItemAsync("cmine_device_id", value); return value;
}
export async function signOut() {
  const token = await SecureStore.getItemAsync("cmine_access_token");
  if (token && clientId) await AuthSession.revokeAsync({ clientId, token }, discovery).catch(() => undefined);
  await Promise.all(["cmine_access_token", "cmine_refresh_token", "cmine_token_expires_at"].map((key) => SecureStore.deleteItemAsync(key)));
}
