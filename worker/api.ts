import { generatePlan, type Activity, type Equipment, type Experience, type Goal, type Profile, type Sex } from "../app/lib/coach";
import { adminSummary, createSession, deleteSession, getSessionUser, pointsForUser, recordConsent, savePlan, upsertCmineUser } from "./db";
import { generateLlmPlan } from "./llm";
import type { WorkerEnv } from "./platform";
import { cookie, parseCookies, randomToken, safeReturnPath, sha256, signPayload, verifyPayload } from "./security";

const json = (body: unknown, status = 200, headers?: HeadersInit) => Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
const goals = new Set<Goal>(["fat_loss", "muscle", "recomp", "arms", "strength"]);
const sexes = new Set<Sex>(["female", "male"]);
const activities = new Set<Activity>(["sedentary", "light", "moderate", "active"]);
const experiences = new Set<Experience>(["beginner", "intermediate", "advanced"]);
const equipment = new Set<Equipment>(["bodyweight", "dumbbell", "gym"]);

function profileFrom(value: unknown): Profile | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  const profile: Profile = { sex: body.sex as Sex, age: Number(body.age), height: Number(body.height), weight: Number(body.weight), targetWeight: Number(body.targetWeight), activity: body.activity as Activity, goal: body.goal as Goal, experience: body.experience as Experience, days: Number(body.days), equipment: body.equipment as Equipment, limitations: typeof body.limitations === "string" ? body.limitations.slice(0, 500) : "" };
  if (!sexes.has(profile.sex) || !activities.has(profile.activity) || !goals.has(profile.goal) || !experiences.has(profile.experience) || !equipment.has(profile.equipment)) return null;
  if (![profile.age, profile.height, profile.weight, profile.targetWeight, profile.days].every(Number.isFinite)) return null;
  if (profile.age < 16 || profile.age > 85 || profile.height < 130 || profile.height > 220 || profile.weight < 35 || profile.weight > 250 || profile.targetWeight < 35 || profile.targetWeight > 250 || profile.days < 2 || profile.days > 6) return null;
  return profile;
}

function isAdminRequest(request: Request): boolean {
  return Boolean(request.headers.get("oai-authenticated-user-email"));
}

function oauthError(request: Request, message: string): Response {
  const target = new URL("/", request.url);
  target.searchParams.set("auth_error", message);
  return Response.redirect(target.toString(), 302);
}

async function authStart(request: Request, env: WorkerEnv): Promise<Response> {
  if (!env.CMINE_CLIENT_ID || !env.SESSION_SECRET || !env.DB) return json({ error: "CMINE_NOT_CONFIGURED", message: "Cmine ID 服务端登录仍需配置 client_id、会话密钥与数据库。" }, 503);
  const url = new URL(request.url);
  const issuer = (env.CMINE_ISSUER || "https://identity.chwjh.com").replace(/\/$/, "");
  const verifier = randomToken(48);
  const state = randomToken(24);
  const redirectUri = `${url.origin}/api/auth/cmine/callback`;
  const payload = await signPayload({ verifier, state, returnTo: safeReturnPath(url.searchParams.get("returnTo")), redirectUri, exp: Date.now() + 10 * 60_000 }, env.SESSION_SECRET);
  const authorize = new URL(`${issuer}/oauth/authorize`);
  authorize.search = new URLSearchParams({ response_type: "code", client_id: env.CMINE_CLIENT_ID, redirect_uri: redirectUri, scope: "openid profile email", state, code_challenge: await sha256(verifier), code_challenge_method: "S256" }).toString();
  const headers = new Headers({ location: authorize.toString(), "cache-control": "no-store" });
  headers.append("set-cookie", cookie("cmine_fit_oauth", payload, request, 600));
  return new Response(null, { status: 302, headers });
}

async function authCallback(request: Request, env: WorkerEnv): Promise<Response> {
  if (!env.CMINE_CLIENT_ID || !env.SESSION_SECRET || !env.DB) return oauthError(request, "Cmine ID 尚未完成服务端配置");
  const url = new URL(request.url);
  if (url.searchParams.get("error")) return oauthError(request, url.searchParams.get("error_description") || url.searchParams.get("error") || "登录未完成");
  const codeValue = url.searchParams.get("code");
  const stateValue = url.searchParams.get("state");
  type OauthState = { verifier: string; state: string; returnTo: string; redirectUri: string; exp: number };
  const state = await verifyPayload<OauthState>(parseCookies(request).cmine_fit_oauth, env.SESSION_SECRET);
  if (!codeValue || !stateValue || !state || state.state !== stateValue || state.exp < Date.now() || state.redirectUri !== `${url.origin}/api/auth/cmine/callback`) return oauthError(request, "登录状态已过期，请重试");
  const issuer = (env.CMINE_ISSUER || "https://identity.chwjh.com").replace(/\/$/, "");
  const tokenHeaders: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (env.CMINE_CLIENT_SECRET) tokenHeaders.authorization = `Basic ${btoa(`${env.CMINE_CLIENT_ID}:${env.CMINE_CLIENT_SECRET}`)}`;
  const tokenResponse = await fetch(`${issuer}/oauth/token`, { method: "POST", headers: tokenHeaders, body: new URLSearchParams({ grant_type: "authorization_code", client_id: env.CMINE_CLIENT_ID, code: codeValue, redirect_uri: state.redirectUri, code_verifier: state.verifier }) });
  const tokens = await tokenResponse.json().catch(() => null) as { access_token?: string; error?: string } | null;
  if (!tokenResponse.ok || !tokens?.access_token) return oauthError(request, `Cmine ID 令牌交换失败（${tokens?.error || tokenResponse.status}）`);
  const userResponse = await fetch(`${issuer}/oauth/userinfo`, { headers: { authorization: `Bearer ${tokens.access_token}` } });
  const identity = await userResponse.json().catch(() => null) as { sub?: string; email?: string; name?: string; picture?: string } | null;
  if (!userResponse.ok || !identity?.sub) return oauthError(request, "无法读取 Cmine ID 用户信息");
  const user = await upsertCmineUser(env, { sub: identity.sub, email: identity.email, name: identity.name, picture: identity.picture });
  const sessionToken = randomToken(48);
  await createSession(env, user.id, sessionToken);
  const headers = new Headers({ location: new URL(state.returnTo, url.origin).toString(), "cache-control": "no-store" });
  headers.append("set-cookie", cookie("cmine_fit_session", sessionToken, request, 7 * 86400));
  headers.append("set-cookie", cookie("cmine_fit_oauth", "", request, 0));
  return new Response(null, { status: 302, headers });
}

async function planRequest(request: Request, env: WorkerEnv): Promise<Response> {
  const body = await request.json().catch(() => null) as { profile?: unknown; consent?: unknown } | null;
  const profile = profileFrom(body?.profile);
  if (!profile) return json({ error: "INVALID_PROFILE", message: "训练档案不完整或超出安全范围。" }, 400);
  if (body?.consent !== true) return json({ error: "CONSENT_REQUIRED", message: "生成前需要确认健康免责声明与数据处理说明。" }, 412);
  const fallbackPlan = generatePlan(profile);
  if (!env.OPENAI_API_KEY) return json({ error: "AI_NOT_CONFIGURED", message: "LLM 连接尚未配置；当前展示的是规则安全预览。", fallbackPlan }, 503);
  try {
    const result = await generateLlmPlan(env, profile);
    const user = await getSessionUser(request, env);
    const planId = user && env.DB ? await savePlan(env, user.id, profile, result.plan, result.source, result.model) : null;
    return json({ ...result, planId, persisted: Boolean(planId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI_UNKNOWN_ERROR";
    console.error("plan_generation_failed", message.split(":").slice(0, 2).join(":"));
    return json({ error: "AI_GENERATION_FAILED", message: "AI 计划生成未通过安全校验，已保留规则预览，请稍后重试。", fallbackPlan }, 502);
  }
}

export async function handleApi(request: Request, env: WorkerEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return null;
  if (request.method === "GET" && url.pathname === "/api/health") return json({ ok: true, database: Boolean(env.DB), llm: Boolean(env.OPENAI_API_KEY), cmine: Boolean(env.CMINE_CLIENT_ID && env.SESSION_SECRET), model: env.OPENAI_MODEL || "gpt-5.6" });
  if (request.method === "GET" && url.pathname === "/api/auth/config") return json({ cmine: Boolean(env.CMINE_CLIENT_ID && env.SESSION_SECRET && env.DB) });
  if (request.method === "GET" && url.pathname === "/api/auth/cmine/start") return authStart(request, env);
  if (request.method === "GET" && url.pathname === "/api/auth/cmine/callback") return authCallback(request, env);
  if (request.method === "GET" && url.pathname === "/api/auth/me") {
    const user = await getSessionUser(request, env);
    return json({ user: user ? { sub: user.sub, email: user.email, name: user.name, picture: user.picture } : null, points: user ? await pointsForUser(env, user.id) : 0 });
  }
  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    await deleteSession(request, env);
    return json({ ok: true }, 200, { "set-cookie": cookie("cmine_fit_session", "", request, 0) });
  }
  if (request.method === "POST" && url.pathname === "/api/plans") return planRequest(request, env);
  if (request.method === "POST" && url.pathname === "/api/consents") {
    const body = await request.json().catch(() => ({})) as { locale?: string };
    const user = await getSessionUser(request, env);
    if (!env.DB) return json({ error: "DATABASE_NOT_CONFIGURED" }, 503);
    await recordConsent(request, env, user?.id || null, body.locale === "en" ? "en" : "zh");
    return json({ ok: true }, 201);
  }
  if (request.method === "POST" && url.pathname === "/api/points/claim-ad") return json({ error: "REWARD_AD_NOT_CONFIGURED", message: "奖励广告供应商尚未接入，系统不会发放虚构积分。" }, 501);
  if (request.method === "GET" && url.pathname === "/api/admin/summary") {
    if (!isAdminRequest(request)) return json({ error: "UNAUTHORIZED" }, 401);
    if (!env.DB) return json({ error: "DATABASE_NOT_CONFIGURED" }, 503);
    return json({ metrics: await adminSummary(env), services: { database: true, llm: Boolean(env.OPENAI_API_KEY), cmine: Boolean(env.CMINE_CLIENT_ID && env.SESSION_SECRET), rewardAds: Boolean(env.REWARD_AD_PROVIDER), model: env.OPENAI_MODEL || "gpt-5.6" } });
  }
  return json({ error: "NOT_FOUND" }, 404);
}
