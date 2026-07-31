import { generatePlan, type Activity, type Equipment, type Experience, type Goal, type Profile, type Sex } from "../app/lib/coach";
import { verifyCmineAccessToken } from "./cmine-jwt";
import {
  accountSnapshot,
  addMeasurement,
  adminOverview,
  adminSettings,
  adminSummary,
  adminUsers,
  createSession,
  deleteSession,
  deleteUserData,
  exportUserData,
  getSessionUser,
  listPlansForUser,
  measurementsForUser,
  planForUser,
  pointsForUser,
  profileForUser,
  progressForUser,
  recordAdminAudit,
  recordConsent,
  recordGenerationRun,
  recordWorkoutCompletion,
  savePlan,
  saveProfile,
  saveWorkoutSession,
  settingValue,
  updateAdminSetting,
  updateUserStatus,
  upsertCmineUser,
  type MeasurementInput,
  type StoredUser,
} from "./db";
import { generateLlmPlan } from "./llm";
import type { WorkerEnv } from "./platform";
import { cookie, parseCookies, randomToken, safeReturnPath, sha256, signPayload, verifyPayload } from "./security";

const json = (body: unknown, status = 200, headers?: HeadersInit) => Response.json(body, {
  status,
  headers: { "cache-control": "no-store", ...headers },
});
const errorJson = (error: string, message: string, status: number) => json({ error, message }, status);
const goals = new Set<Goal>(["fat_loss", "muscle", "recomp", "arms", "strength"]);
const sexes = new Set<Sex>(["female", "male"]);
const activities = new Set<Activity>(["sedentary", "light", "moderate", "active"]);
const experiences = new Set<Experience>(["beginner", "intermediate", "advanced"]);
const equipment = new Set<Equipment>(["bodyweight", "dumbbell", "gym"]);
const editableSettings = new Set(["announcement", "maintenance_mode", "disclaimer_version"]);

function profileFrom(value: unknown): Profile | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  const profile: Profile = {
    sex: body.sex as Sex,
    age: Number(body.age),
    height: Number(body.height),
    weight: Number(body.weight),
    targetWeight: Number(body.targetWeight),
    activity: body.activity as Activity,
    goal: body.goal as Goal,
    experience: body.experience as Experience,
    days: Number(body.days),
    equipment: body.equipment as Equipment,
    limitations: typeof body.limitations === "string" ? body.limitations.trim().slice(0, 500) : "",
  };
  if (!sexes.has(profile.sex) || !activities.has(profile.activity) || !goals.has(profile.goal) || !experiences.has(profile.experience) || !equipment.has(profile.equipment)) return null;
  if (![profile.age, profile.height, profile.weight, profile.targetWeight, profile.days].every(Number.isFinite)) return null;
  if (profile.age < 16 || profile.age > 85 || profile.height < 130 || profile.height > 220 || profile.weight < 35 || profile.weight > 250 || profile.targetWeight < 35 || profile.targetWeight > 250 || profile.days < 2 || profile.days > 6) return null;
  return profile;
}

function publicOrigin(request: Request, env: WorkerEnv): string {
  if (env.PUBLIC_ORIGIN) {
    try {
      const value = new URL(env.PUBLIC_ORIGIN);
      if (value.protocol === "https:") return value.origin;
    } catch { /* fall through */ }
  }
  return new URL(request.url).origin;
}

function writeOriginAllowed(request: Request, env: WorkerEnv): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const requestOrigin = new URL(request.url).origin;
  return origin === requestOrigin || origin === publicOrigin(request, env);
}

function oauthError(request: Request, env: WorkerEnv, message: string): Response {
  const target = new URL("/", publicOrigin(request, env));
  target.searchParams.set("auth_error", message);
  return Response.redirect(target.toString(), 302);
}

async function requireUser(request: Request, env: WorkerEnv): Promise<StoredUser | Response> {
  const user = await getSessionUser(request, env);
  return user || errorJson("AUTH_REQUIRED", "请先登录 Cmine ID。", 401);
}

async function authStart(request: Request, env: WorkerEnv): Promise<Response> {
  if (!env.CMINE_CLIENT_ID || !env.CMINE_CLIENT_SECRET || !env.SESSION_SECRET || !env.DB) {
    return errorJson("CMINE_NOT_CONFIGURED", "登录服务正在完成安全配置，请稍后再试。", 503);
  }
  const url = new URL(request.url);
  const issuer = (env.CMINE_ISSUER || "https://identity.chwjh.com").replace(/\/$/, "");
  const verifier = randomToken(48);
  const state = randomToken(24);
  const redirectUri = `${publicOrigin(request, env)}/api/auth/cmine/callback`;
  const payload = await signPayload({
    verifier,
    state,
    returnTo: safeReturnPath(url.searchParams.get("returnTo")),
    redirectUri,
    exp: Date.now() + 10 * 60_000,
  }, env.SESSION_SECRET);
  const authorize = new URL(`${issuer}/oauth/authorize`);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: env.CMINE_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: "openid profile email",
    state,
    code_challenge: await sha256(verifier),
    code_challenge_method: "S256",
  }).toString();
  const headers = new Headers({ location: authorize.toString(), "cache-control": "no-store" });
  headers.append("set-cookie", cookie("cmine_fit_oauth", payload, request, 600));
  return new Response(null, { status: 302, headers });
}

async function authCallback(request: Request, env: WorkerEnv): Promise<Response> {
  if (!env.CMINE_CLIENT_ID || !env.CMINE_CLIENT_SECRET || !env.SESSION_SECRET || !env.DB) return oauthError(request, env, "Cmine ID 尚未完成服务端配置");
  const url = new URL(request.url);
  if (url.searchParams.get("error")) return oauthError(request, env, url.searchParams.get("error_description") || url.searchParams.get("error") || "登录未完成");
  const codeValue = url.searchParams.get("code");
  const stateValue = url.searchParams.get("state");
  type OauthState = { verifier: string; state: string; returnTo: string; redirectUri: string; exp: number };
  const state = await verifyPayload<OauthState>(parseCookies(request).cmine_fit_oauth, env.SESSION_SECRET);
  const expectedRedirect = `${publicOrigin(request, env)}/api/auth/cmine/callback`;
  if (!codeValue || !stateValue || !state || state.state !== stateValue || state.exp < Date.now() || state.redirectUri !== expectedRedirect) {
    return oauthError(request, env, "登录状态已过期，请重试");
  }

  const issuer = (env.CMINE_ISSUER || "https://identity.chwjh.com").replace(/\/$/, "");
  const tokenHeaders: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
  tokenHeaders.authorization = `Basic ${btoa(`${env.CMINE_CLIENT_ID}:${env.CMINE_CLIENT_SECRET}`)}`;
  const tokenResponse = await fetch(`${issuer}/oauth/token`, {
    method: "POST",
    headers: tokenHeaders,
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env.CMINE_CLIENT_ID,
      code: codeValue,
      redirect_uri: state.redirectUri,
      code_verifier: state.verifier,
    }),
  }).catch(() => null);
  if (!tokenResponse) return oauthError(request, env, "Cmine ID 暂时无法连接，请稍后重试");
  const tokens = await tokenResponse.json().catch(() => null) as { access_token?: string; error?: string } | null;
  if (!tokenResponse.ok || !tokens?.access_token) return oauthError(request, env, `Cmine ID 令牌交换失败（${tokens?.error || tokenResponse.status}）`);

  let claims: { sub: string };
  try {
    claims = await verifyCmineAccessToken(tokens.access_token, issuer, env.CMINE_CLIENT_ID);
  } catch (error) {
    console.error("cmine_token_verification_failed", error instanceof Error ? error.message : "unknown");
    return oauthError(request, env, "Cmine ID 安全校验失败，请重新登录");
  }

  const userResponse = await fetch(`${issuer}/oauth/userinfo`, {
    headers: { authorization: `Bearer ${tokens.access_token}`, accept: "application/json" },
  }).catch(() => null);
  if (!userResponse) return oauthError(request, env, "暂时无法读取 Cmine ID 用户信息");
  const identity = await userResponse.json().catch(() => null) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
    avatar_url?: string;
    role?: string;
  } | null;
  if (!userResponse.ok || !identity?.sub || identity.sub !== claims.sub) return oauthError(request, env, "Cmine ID 用户信息校验失败");
  if (!identity.email || identity.email_verified !== true) return oauthError(request, env, "请先在 Cmine ID 完成邮箱验证");

  const user = await upsertCmineUser(env, {
    sub: identity.sub,
    email: identity.email,
    name: identity.name,
    picture: identity.picture || identity.avatar_url,
    role: identity.role,
  });
  if (user.status !== "active") return oauthError(request, env, "该账户目前无法登录，请联系支持");
  const sessionToken = randomToken(48);
  await createSession(env, user.id, sessionToken);
  const headers = new Headers({
    location: new URL(state.returnTo, publicOrigin(request, env)).toString(),
    "cache-control": "no-store",
  });
  headers.append("set-cookie", cookie("cmine_fit_session", sessionToken, request, 7 * 86400));
  headers.append("set-cookie", cookie("cmine_fit_oauth", "", request, 0));
  return new Response(null, { status: 302, headers });
}

async function planRequest(request: Request, env: WorkerEnv): Promise<Response> {
  const body = await request.json().catch(() => null) as { profile?: unknown; consent?: unknown } | null;
  const profile = profileFrom(body?.profile);
  if (!profile) return errorJson("INVALID_PROFILE", "训练档案不完整或超出安全范围。", 400);
  if (body?.consent !== true) return errorJson("CONSENT_REQUIRED", "生成前需要确认健康免责声明与数据处理说明。", 412);
  const user = await getSessionUser(request, env);
  if (await settingValue<boolean>(env, "maintenance_mode", false)) {
    return errorJson("MAINTENANCE_MODE", "AI 教练正在进行短暂维护，请稍后再试。", 503);
  }
  const fallbackPlan = generatePlan(profile);
  const model = env.OPENAI_MODEL || "gpt-5.6";
  const startedAt = Date.now();
  if (!env.OPENAI_API_KEY) {
    await recordGenerationRun(env, { userId: user?.id || null, status: "failed", model, latencyMs: 0, errorCode: "AI_NOT_CONFIGURED" }).catch(() => undefined);
    return json({ error: "AI_NOT_CONFIGURED", message: "AI 教练暂时离线，计划没有生成。", fallbackPlan }, 503);
  }
  try {
    const result = await generateLlmPlan(env, profile, user?.id);
    const planId = user && env.DB ? await savePlan(env, user.id, profile, result.plan, result.source, result.model) : null;
    await recordGenerationRun(env, {
      userId: user?.id || null,
      status: "succeeded",
      model: result.model,
      latencyMs: Date.now() - startedAt,
      requestId: result.requestId,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      reasoningTokens: result.usage.reasoningTokens,
    }).catch(() => undefined);
    return json({
      plan: result.plan,
      source: result.source,
      model: result.model,
      requestId: result.requestId,
      planId,
      persisted: Boolean(planId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI_UNKNOWN_ERROR";
    const errorCode = message.split(":")[0].slice(0, 80);
    console.error("plan_generation_failed", errorCode);
    await recordGenerationRun(env, {
      userId: user?.id || null,
      status: "failed",
      model,
      latencyMs: Date.now() - startedAt,
      errorCode,
    }).catch(() => undefined);
    return json({ error: "AI_GENERATION_FAILED", message: "这次计划没有通过完整校验，请稍后重新生成。", fallbackPlan }, 502);
  }
}

function measurementFrom(value: unknown): MeasurementInput | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  const optional = (key: string, min: number, max: number): number | null | undefined => {
    if (body[key] === "" || body[key] === null || body[key] === undefined) return null;
    const number = Number(body[key]);
    return Number.isFinite(number) && number >= min && number <= max ? number : undefined;
  };
  const weightKg = optional("weightKg", 35, 250);
  const bodyFatPct = optional("bodyFatPct", 2, 70);
  const waistCm = optional("waistCm", 40, 220);
  const armCm = optional("armCm", 15, 80);
  if ([weightKg, bodyFatPct, waistCm, armCm].some((item) => item === undefined)) return null;
  if ([weightKg, bodyFatPct, waistCm, armCm].every((item) => item === null)) return null;
  const date = typeof body.measuredAt === "string" ? new Date(body.measuredAt) : new Date();
  if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now() + 86400_000) return null;
  return {
    weightKg: weightKg ?? null,
    bodyFatPct: bodyFatPct ?? null,
    waistCm: waistCm ?? null,
    armCm: armCm ?? null,
    note: typeof body.note === "string" ? body.note.trim().slice(0, 300) : "",
    measuredAt: date.toISOString(),
  };
}

function services(env: WorkerEnv) {
  return {
    database: Boolean(env.DB),
    llm: Boolean(env.OPENAI_API_KEY),
    cmine: Boolean(env.CMINE_CLIENT_ID && env.CMINE_CLIENT_SECRET && env.SESSION_SECRET && env.DB),
    rewardAds: Boolean(env.REWARD_AD_PROVIDER),
    model: env.OPENAI_MODEL || "gpt-5.6",
    reasoningEffort: env.OPENAI_REASONING_EFFORT || "medium",
  };
}

async function handleAdmin(request: Request, env: WorkerEnv, url: URL): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/v1/admin/") && url.pathname !== "/api/admin/summary") return null;
  const admin = await getSessionUser(request, env);
  if (!admin) return errorJson("AUTH_REQUIRED", "请先使用 Cmine ID 登录。", 401);
  if (admin.role !== "admin") return errorJson("FORBIDDEN", "当前 Cmine ID 没有 Cmine Fit 管理权限。", 403);
  const actor = admin.email || admin.sub;
  if (!env.DB) return errorJson("DATABASE_NOT_CONFIGURED", "数据库尚未连接。", 503);
  if (url.pathname === "/api/admin/summary" && request.method === "GET") {
    return json({ metrics: await adminSummary(env), services: services(env) });
  }
  if (url.pathname === "/api/v1/admin/overview" && request.method === "GET") {
    return json({
      ...(await adminOverview(env)),
      admin: { email: admin.email, name: admin.name, role: admin.role },
      services: services(env),
      settings: await adminSettings(env),
    });
  }
  if (url.pathname === "/api/v1/admin/users" && request.method === "GET") {
    return json({ users: await adminUsers(env, url.searchParams.get("q") || "", Number(url.searchParams.get("limit") || 30)) });
  }
  const userMatch = url.pathname.match(/^\/api\/v1\/admin\/users\/([^/]+)$/);
  if (userMatch && request.method === "PATCH") {
    const body = await request.json().catch(() => null) as { status?: unknown } | null;
    if (body?.status !== "active" && body?.status !== "suspended") return errorJson("INVALID_STATUS", "用户状态无效。", 400);
    const userId = decodeURIComponent(userMatch[1]);
    if (!await updateUserStatus(env, userId, body.status)) return errorJson("USER_NOT_FOUND", "没有找到该用户。", 404);
    await recordAdminAudit(env, actor, "user.status.update", "user", userId, { status: body.status });
    return json({ ok: true });
  }
  if (url.pathname === "/api/v1/admin/settings" && request.method === "GET") return json({ settings: await adminSettings(env) });
  if (url.pathname === "/api/v1/admin/settings" && request.method === "PUT") {
    const body = await request.json().catch(() => null) as { key?: unknown; value?: unknown } | null;
    if (typeof body?.key !== "string" || !editableSettings.has(body.key)) return errorJson("INVALID_SETTING", "该设置不能从管理后台修改。", 400);
    if (body.key === "maintenance_mode" && typeof body.value !== "boolean") return errorJson("INVALID_SETTING_VALUE", "维护状态必须是布尔值。", 400);
    if ((body.key === "announcement" || body.key === "disclaimer_version") && (typeof body.value !== "string" || body.value.length > 300)) {
      return errorJson("INVALID_SETTING_VALUE", "设置内容无效。", 400);
    }
    await updateAdminSetting(env, body.key, body.value, actor);
    await recordAdminAudit(env, actor, "site.setting.update", "setting", body.key, { value: body.value });
    return json({ ok: true });
  }
  return errorJson("NOT_FOUND", "没有找到该管理接口。", 404);
}

export async function handleApi(request: Request, env: WorkerEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return null;
  if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method) && !writeOriginAllowed(request, env)) {
    return errorJson("ORIGIN_REJECTED", "请求来源校验失败。", 403);
  }

  const adminResponse = await handleAdmin(request, env, url);
  if (adminResponse) return adminResponse;

  if (request.method === "GET" && url.pathname === "/api/health") {
    return json({ ok: true, ...services(env) });
  }
  if (request.method === "GET" && url.pathname === "/api/auth/config") {
    return json({ cmine: services(env).cmine });
  }
  if (request.method === "GET" && url.pathname === "/api/auth/cmine/start") return authStart(request, env);
  if (request.method === "GET" && url.pathname === "/api/auth/cmine/callback") return authCallback(request, env);
  if (request.method === "GET" && url.pathname === "/api/auth/me") {
    const user = await getSessionUser(request, env);
    return json({
      user: user ? { sub: user.sub, email: user.email, name: user.name, picture: user.picture, role: user.role } : null,
      points: user ? await pointsForUser(env, user.id) : 0,
    });
  }
  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    await deleteSession(request, env);
    return json({ ok: true }, 200, { "set-cookie": cookie("cmine_fit_session", "", request, 0) });
  }

  if (request.method === "POST" && (url.pathname === "/api/plans" || url.pathname === "/api/v1/plans")) {
    return planRequest(request, env);
  }
  if (request.method === "POST" && url.pathname === "/api/completions") {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    const body = await request.json().catch(() => null) as { planId?: unknown; dayIndex?: unknown; exerciseId?: unknown } | null;
    const planId = typeof body?.planId === "string" ? body.planId : "";
    const exerciseId = typeof body?.exerciseId === "string" ? body.exerciseId : "";
    const dayIndex = Number(body?.dayIndex);
    if (!planId || !exerciseId || !Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) return errorJson("INVALID_COMPLETION", "训练记录无效。", 400);
    try { return json(await recordWorkoutCompletion(env, user.id, planId, dayIndex, exerciseId), 201); }
    catch { return errorJson("PLAN_NOT_FOUND", "没有找到对应计划。", 404); }
  }
  if (request.method === "POST" && url.pathname === "/api/consents") {
    const body = await request.json().catch(() => ({})) as { locale?: string };
    const user = await getSessionUser(request, env);
    if (!env.DB) return errorJson("DATABASE_NOT_CONFIGURED", "数据库尚未连接。", 503);
    await recordConsent(request, env, user?.id || null, body.locale === "en" ? "en" : "zh");
    return json({ ok: true }, 201);
  }
  if (request.method === "POST" && url.pathname === "/api/points/claim-ad") {
    return errorJson("REWARD_AD_NOT_CONFIGURED", "激励广告尚未接入，系统不会发放未验证积分。", 501);
  }

  if (url.pathname === "/api/v1/me" && request.method === "GET") {
    const user = await requireUser(request, env);
    return user instanceof Response ? user : json(await accountSnapshot(env, user));
  }
  if (url.pathname === "/api/v1/me" && request.method === "DELETE") {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    await deleteUserData(env, user.id);
    return json({ ok: true }, 200, { "set-cookie": cookie("cmine_fit_session", "", request, 0) });
  }
  if (url.pathname === "/api/v1/export" && request.method === "GET") {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    return json(await exportUserData(env, user), 200, {
      "content-disposition": `attachment; filename="cmine-fit-export-${new Date().toISOString().slice(0, 10)}.json"`,
    });
  }
  if (url.pathname === "/api/v1/profile" && request.method === "GET") {
    const user = await requireUser(request, env);
    return user instanceof Response ? user : json({ profile: await profileForUser(env, user.id) });
  }
  if (url.pathname === "/api/v1/profile" && request.method === "PUT") {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    const body = await request.json().catch(() => null) as { profile?: unknown } | null;
    const profile = profileFrom(body?.profile);
    if (!profile) return errorJson("INVALID_PROFILE", "训练档案不完整或超出安全范围。", 400);
    await saveProfile(env, user.id, profile);
    return json({ profile });
  }
  if (url.pathname === "/api/v1/plans" && request.method === "GET") {
    const user = await requireUser(request, env);
    return user instanceof Response ? user : json({ plans: await listPlansForUser(env, user.id, Number(url.searchParams.get("limit") || 20)) });
  }
  const planMatch = url.pathname.match(/^\/api\/v1\/plans\/([^/]+)$/);
  if (planMatch && request.method === "GET") {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    const plan = await planForUser(env, user.id, decodeURIComponent(planMatch[1]));
    return plan ? json(plan) : errorJson("PLAN_NOT_FOUND", "没有找到该计划。", 404);
  }
  if (url.pathname === "/api/v1/measurements" && request.method === "GET") {
    const user = await requireUser(request, env);
    return user instanceof Response ? user : json({ measurements: await measurementsForUser(env, user.id, Number(url.searchParams.get("limit") || 50)) });
  }
  if (url.pathname === "/api/v1/measurements" && request.method === "POST") {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    const measurement = measurementFrom(await request.json().catch(() => null));
    if (!measurement) return errorJson("INVALID_MEASUREMENT", "请至少填写一项有效身体数据。", 400);
    return json({ measurement: await addMeasurement(env, user.id, measurement) }, 201);
  }
  if (url.pathname === "/api/v1/progress" && request.method === "GET") {
    const user = await requireUser(request, env);
    return user instanceof Response ? user : json(await progressForUser(env, user.id));
  }
  const workoutMatch = url.pathname.match(/^\/api\/v1\/workouts\/([^/]+)\/(complete|feedback)$/);
  if (workoutMatch && request.method === "POST") {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const dayIndex = Number(body?.dayIndex);
    const durationMinutes = body?.durationMinutes === null || body?.durationMinutes === undefined ? null : Number(body.durationMinutes);
    const rpe = body?.rpe === null || body?.rpe === undefined ? null : Number(body.rpe);
    if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6 || (durationMinutes !== null && (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 240)) || (rpe !== null && (!Number.isInteger(rpe) || rpe < 1 || rpe > 10))) {
      return errorJson("INVALID_WORKOUT", "训练反馈超出有效范围。", 400);
    }
    try {
      await saveWorkoutSession(env, user.id, decodeURIComponent(workoutMatch[1]), {
        dayIndex,
        status: workoutMatch[2] === "complete" ? "completed" : "in_progress",
        durationMinutes,
        rpe,
        pain: body?.pain === true,
        notes: typeof body?.notes === "string" ? body.notes.trim().slice(0, 500) : "",
      });
      return json({ ok: true }, 201);
    } catch {
      return errorJson("PLAN_NOT_FOUND", "没有找到对应计划。", 404);
    }
  }

  return errorJson("NOT_FOUND", "没有找到该接口。", 404);
}
