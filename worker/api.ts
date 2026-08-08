import { type Activity, type BeginnerBarrier, type Equipment, type Experience, type Goal, type Profile, type Sex, type TrainingTrack } from "../app/lib/coach";
import { verifyCmineAccessToken } from "./cmine-jwt";
import {
  accountSnapshot,
  activatePlan,
  addMeasurement,
  adminOverview,
  adminAuditEvents,
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
  planVersionStatus,
  pointsForUser,
  profileForUser,
  progressForUser,
  recordAdminAudit,
  recordConsent,
  recordGenerationRun,
  recordWorkoutCompletion,
  rescheduleOccurrence,
  savePlan,
  saveProfile,
  saveWorkoutOccurrenceSession,
  saveWorkoutSession,
  settingValue,
  updateAdminSetting,
  updateAiRoute,
  updateUserStatus,
  upsertWorkoutSet,
  upsertCmineUser,
  workoutSetsForDay,
  type MeasurementInput,
  type StoredUser,
  type WorkoutSetInput,
} from "./db";
import { aiServices, generateLlmPlan } from "./llm";
import { billingCatalog, createCheckout, createPortal, processStripeEvent, stripeConfigured, verifyStripeWebhook } from "./billing";
import { consumeCapability, entitlementSnapshot, limitForCapability, redeemPoints, refundCapability, tierForUser, usageForUser } from "./product";
import {
  analyzeMeal,
  confirmMeal,
  createCustomFood,
  createManualMeal,
  createMealTemplate,
  createRecipe,
  dailyNutrition,
  deleteMealImage,
  foodByBarcode,
  foodDataConfigured,
  foodReference,
  mealTemplatesForUser,
  mealsForUser,
  recipesForUser,
  recalculateRecipe,
  searchFoods,
  submitFoodCorrection,
  uploadMealImage,
} from "./nutrition";
import { processAdmobReward, rewardAdsConfigured } from "./rewards";
import type { WorkerEnv } from "./platform";
import { cookie, parseCookies, randomToken, safeReturnPath, sha256, signPayload, verifyPayload } from "./security";
import { completeOnboarding, onboardingSnapshot, saveOnboardingDraft, skipOnboarding } from "./modules/onboarding";
import { createConversation, conversationMessages, decideCoachAction, listConversations, sendCoachMessage } from "./modules/coach";
import { coachHome, coachMemorySnapshot, deleteCoachMemory, saveCoachCheckin, saveCoachFeedback, updateCoachPreferences, upsertCoachMemory } from "./modules/coach-orchestrator";
import { decideReview, generateReview, listReviews, reviewDetail, saveReviewCheckin } from "./modules/reviews";
import { deleteDevice, deleteHealthConnection, importHealthObservations, registerDevice, syncBatch, syncChanges, upsertHealthConnection } from "./modules/mobile";
import { processRevenueCatEvent, revenueCatConfigured, verifyRevenueCatWebhook } from "./modules/revenuecat";
import { runMaintenance, verifyMaintenanceRequest } from "./modules/maintenance";
import { runNotifications } from "./modules/notifications";
import { habitSummary, upsertHabitCommitment } from "./modules/habits";
import { enforceRateLimit, RATE_RULES } from "./modules/rate-limit";

const json = (body: unknown, status = 200, headers?: HeadersInit) => Response.json(body, {
  status,
  headers: { "cache-control": "no-store", ...headers },
});
const errorJson = (error: string, message: string, status: number) => json({ error, message }, status);
function coachStream(run: (emit: (event: string, data: unknown) => void) => Promise<{ assistantMessage: { id: string; content: string; actions?: unknown[]; intent?: string; basis?: unknown[]; limitations?: string[]; sources?: unknown[] }; duplicate?: boolean }>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let emitted = false;
      const emit = (event: string, data: unknown) => { emitted = emitted || event === "message.delta"; controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); };
      try {
        emit("message.started", { at: new Date().toISOString() });
        const result = await run(emit);
        if (!emitted && result.assistantMessage.content) emit("message.delta", { delta: result.assistantMessage.content });
        emit("message.metadata", { intent: result.assistantMessage.intent, basis: result.assistantMessage.basis || [], limitations: result.assistantMessage.limitations || [], sources: result.assistantMessage.sources || [] });
        for (const action of result.assistantMessage.actions || []) emit("action.proposed", action);
        emit("message.completed", { id: result.assistantMessage.id, duplicate: Boolean(result.duplicate) });
      } catch (error) {
        const code = error instanceof Error ? error.message.split(":")[0] : "COACH_FAILED";
        emit("message.error", { error: code, message: code === "COACH_LIMIT_REACHED" ? "本周期的 Coach 体验额度已用完。" : "Coach 暂时无法完成回复，请稍后再试。" });
      } finally { controller.close(); }
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive" } });
}
const goals = new Set<Goal>(["fat_loss", "muscle", "recomp", "arms", "strength"]);
const sexes = new Set<Sex>(["female", "male"]);
const activities = new Set<Activity>(["sedentary", "light", "moderate", "active"]);
const experiences = new Set<Experience>(["beginner", "intermediate", "advanced"]);
const equipment = new Set<Equipment>(["bodyweight", "dumbbell", "gym"]);
const trainingTracks = new Set<TrainingTrack>(["beginner_fat_loss", "intermediate_hypertrophy", "general"]);
const beginnerBarriers = new Set<BeginnerBarrier>(["time", "confidence", "consistency", "food", "feedback"]);
const editableSettings = new Set([
  "announcement", "maintenance_mode", "disclaimer_version", "privacy_version", "trial_days",
  "ai_daily_warning_usd", "ai_daily_hard_usd", "ai_monthly_warning_usd", "ai_monthly_hard_usd", "ai_user_daily_hard_usd",
  "free_plan_limit", "free_meal_scan_limit", "free_coach_message_limit", "pro_plan_limit", "pro_meal_scan_limit", "pro_coach_message_limit",
]);

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
    sessionMinutes: Number(body.sessionMinutes || 50),
    trainingLocation: (["home", "gym", "outdoors", "mixed"].includes(String(body.trainingLocation)) ? body.trainingLocation : "mixed") as Profile["trainingLocation"],
    dietaryPreference: (["balanced", "vegetarian", "high_protein", "none"].includes(String(body.dietaryPreference)) ? body.dietaryPreference : "none") as Profile["dietaryPreference"],
    exclusions: typeof body.exclusions === "string" ? body.exclusions.trim().slice(0, 500) : "",
    trainingTrack: trainingTracks.has(body.trainingTrack as TrainingTrack) ? body.trainingTrack as TrainingTrack : undefined,
    beginnerBarrier: beginnerBarriers.has(body.beginnerBarrier as BeginnerBarrier) ? body.beginnerBarrier as BeginnerBarrier : undefined,
    trainingAgeMonths: Math.max(0, Math.min(600, Number(body.trainingAgeMonths || 0))),
    currentSplit: typeof body.currentSplit === "string" ? body.currentSplit.trim().slice(0, 120) : "",
    weakPoints: typeof body.weakPoints === "string" ? body.weakPoints.trim().slice(0, 300) : "",
    acceptsWeightGain: body.acceptsWeightGain === true,
  };
  if (!sexes.has(profile.sex) || !activities.has(profile.activity) || !goals.has(profile.goal) || !experiences.has(profile.experience) || !equipment.has(profile.equipment)) return null;
  if (![profile.age, profile.height, profile.weight, profile.targetWeight, profile.days, profile.sessionMinutes].every(Number.isFinite)) return null;
  if (profile.age < 16 || profile.age > 85 || profile.height < 130 || profile.height > 220 || profile.weight < 35 || profile.weight > 250 || profile.targetWeight < 35 || profile.targetWeight > 250 || profile.days < 2 || profile.days > 6 || Number(profile.sessionMinutes) < 20 || Number(profile.sessionMinutes) > 180) return null;
  if (profile.trainingTrack === "beginner_fat_loss" && profile.days > 4) profile.days = 4;
  if (profile.trainingTrack === "intermediate_hypertrophy") {
    profile.goal = "muscle";
    if (profile.experience === "beginner") profile.experience = "intermediate";
    profile.days = Math.max(3, profile.days);
  }
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
  if (!origin) {
    // Cookie-authenticated browser writes must present an Origin header —
    // modern browsers always send one on cross-context POSTs, so its absence
    // plus a session cookie smells like header stripping. Non-browser clients
    // (Bearer-token mobile apps, curl without cookies) are exempt: they carry
    // no ambient credentials for CSRF to abuse.
    const hasSessionCookie = (request.headers.get("cookie") || "").includes("cmine_fit_session=");
    return !hasSessionCookie;
  }
  const requestOrigin = new URL(request.url).origin;
  return origin === requestOrigin || origin === publicOrigin(request, env);
}

function oauthError(request: Request, env: WorkerEnv, message: string): Response {
  const target = new URL("/", publicOrigin(request, env));
  target.searchParams.set("auth_error", message);
  return Response.redirect(target.toString(), 302);
}

// Per-isolate cache for verified bearer tokens: without it every mobile API
// call costs a JWKS verify, an outbound userinfo round-trip and two DB writes.
// 60s keeps revocation latency acceptable while removing the amplification.
const bearerCache = new Map<string, { user: StoredUser; expires: number }>();

async function tokenCacheKey(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function requestUser(request: Request, env: WorkerEnv): Promise<StoredUser | null> {
  const sessionUser = await getSessionUser(request, env);
  if (sessionUser) return sessionUser;
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ") || !env.CMINE_MOBILE_CLIENT_IDS) return null;
  const token = authorization.slice(7).trim();
  const clientIds = env.CMINE_MOBILE_CLIENT_IDS.split(",").map((value) => value.trim()).filter(Boolean);
  if (!token || !clientIds.length) return null;
  const cacheKey = await tokenCacheKey(token);
  const cached = bearerCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.user;
  const issuer = (env.CMINE_ISSUER || "https://identity.chwjh.com").replace(/\/$/, "");
  let claims: { sub: string };
  try { claims = await verifyCmineAccessToken(token, issuer, clientIds); } catch { return null; }
  const response = await fetch(`${issuer}/oauth/userinfo`, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } }).catch(() => null);
  const identity = await response?.json().catch(() => null) as { sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string; avatar_url?: string; role?: string } | null;
  if (!response?.ok || !identity?.sub || identity.sub !== claims.sub || !identity.email || identity.email_verified !== true) return null;
  const user = await upsertCmineUser(env, { sub: identity.sub, email: identity.email, name: identity.name, picture: identity.picture || identity.avatar_url, role: identity.role });
  if (bearerCache.size > 500) bearerCache.clear();
  bearerCache.set(cacheKey, { user, expires: Date.now() + 60_000 });
  return user;
}

async function requireUser(request: Request, env: WorkerEnv): Promise<StoredUser | Response> {
  const user = await requestUser(request, env);
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
  const tokens = await tokenResponse.json().catch(() => null) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  } | null;
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
  await createSession(env, user.id, sessionToken, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
  });
  const onboarding = await onboardingSnapshot(env, user);
  let destination = state.returnTo;
  if (destination === "/") {
    if (onboarding.status === "not_started" || onboarding.status === "in_progress") destination = "/onboarding";
    else if (onboarding.status === "completed") destination = "/today";
  }
  const headers = new Headers({
    location: new URL(destination, publicOrigin(request, env)).toString(),
    "cache-control": "no-store",
  });
  headers.append("set-cookie", cookie("cmine_fit_session", sessionToken, request, 7 * 86400));
  headers.append("set-cookie", cookie("cmine_fit_oauth", "", request, 0));
  return new Response(null, { status: 302, headers });
}

async function planRequest(request: Request, env: WorkerEnv): Promise<Response> {
  const body = await request.json().catch(() => null) as { profile?: unknown; consent?: unknown; startDate?: unknown; timezone?: unknown } | null;
  const profile = profileFrom(body?.profile);
  if (!profile) return errorJson("INVALID_PROFILE", "训练档案不完整或超出安全范围。", 400);
  if (body?.consent !== true) return errorJson("CONSENT_REQUIRED", "生成前需要确认健康免责声明与数据处理说明。", 412);
  const required = await requireUser(request, env);
  if (required instanceof Response) return required;
  const user = required;
  const requestedTimezone = typeof body?.timezone === "string" && body.timezone.length <= 80 ? body.timezone : user.timezone;
  const requestedStartDate = typeof body?.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.startDate) ? body.startDate : undefined;
  try { new Intl.DateTimeFormat("en", { timeZone: requestedTimezone }).format(new Date()); }
  catch { return errorJson("INVALID_TIMEZONE", "设备时区无效，请重新选择开始日期。", 400); }
  if (env.DB && requestedTimezone !== user.timezone) {
    await env.DB.prepare("UPDATE users SET timezone=?,updated_at=? WHERE id=?").bind(requestedTimezone, new Date().toISOString(), user.id).run();
  }
  if (await settingValue<boolean>(env, "maintenance_mode", false)) {
    return errorJson("MAINTENANCE_MODE", "AI 教练正在进行短暂维护，请稍后再试。", 503);
  }
  const tier = await tierForUser(env, user.id);
  const inputHash = await sha256(JSON.stringify(profile));
  const cached = env.DB ? await env.DB.prepare(`SELECT result_json FROM ai_request_cache
    WHERE user_id = ? AND task = 'training_plan' AND input_hash = ? AND expires_at > ?`)
    .bind(user.id, inputHash, new Date().toISOString()).first<{ result_json: string }>() : null;
  if (cached) {
    try {
      const result = JSON.parse(cached.result_json) as Record<string, unknown>;
      if (requestedStartDate && typeof result.planId === "string" && result.planStatus === "active") {
        await activatePlan(env, user.id, result.planId, "schedule_start_selected", { startDate: requestedStartDate, timezone: requestedTimezone });
      }
      await recordGenerationRun(env, {
        userId: user.id,
        status: "succeeded",
        model: String(result.model || "cache"),
        latencyMs: 0,
        provider: String(result.provider || "cache"),
        task: "training_plan",
        cacheHit: true,
      }).catch(() => undefined);
      return json({ ...result, cached: true, persisted: true });
    } catch { /* regenerate invalid cache */ }
  }
  const quota = await consumeCapability(env, user.id, "plan.generate");
  if (!quota.ok) return errorJson("PLAN_LIMIT_REACHED", "本周期的 AI 计划额度已用完，可使用积分兑换或升级专业版。", 429);
  // Failure-path logging only: no model has completed a generation yet, and the
  // actual route is decided inside generateLlmPlan. Success paths log result.model.
  const model = "unresolved";
  const startedAt = Date.now();
  if (!aiServices(env).planner) {
    await refundCapability(env, user.id, "plan.generate");
    await recordGenerationRun(env, {
      userId: user.id, status: "failed", model, latencyMs: 0, errorCode: "AI_NOT_CONFIGURED",
      task: "training_plan", provider: "none",
    }).catch(() => undefined);
    return errorJson("AI_NOT_CONFIGURED", "AI 教练尚未配置，计划没有生成，也不会消耗你的额度。", 503);
  }
  try {
    const result = await generateLlmPlan(env, profile, user.id, tier);
    const planId = env.DB ? await savePlan(env, user.id, profile, result.plan, result.source, result.model, { startDate: requestedStartDate, timezone: requestedTimezone,
      changeSummary: ["更新阶段目标与本周训练", "根据训练条件重新编排动作", "保留安全与恢复边界"] }) : null;
    const version = planId ? await planVersionStatus(env, user.id, planId) : null;
    const publicResult = {
      plan: result.plan,
      source: result.source,
      provider: result.provider,
      model: result.model,
      requestId: result.requestId,
      planId,
      planStatus: version?.status || "active",
      version,
    };
    if (env.DB) {
      const now = new Date();
      await env.DB.prepare(`INSERT INTO ai_request_cache
        (id, user_id, task, input_hash, result_json, provider, model, expires_at, created_at)
        VALUES (?, ?, 'training_plan', ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, task, input_hash) DO UPDATE SET result_json=excluded.result_json,
          provider=excluded.provider, model=excluded.model, expires_at=excluded.expires_at, created_at=excluded.created_at`)
        .bind(crypto.randomUUID(), user.id, inputHash, JSON.stringify(publicResult), result.provider, result.model,
          new Date(now.getTime() + 24 * 3600_000).toISOString(), now.toISOString()).run();
    }
    await recordGenerationRun(env, {
      userId: user.id,
      status: "succeeded",
      model: result.model,
      latencyMs: Date.now() - startedAt,
      requestId: result.requestId,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      reasoningTokens: result.usage.reasoningTokens,
      task: "training_plan",
      provider: result.provider,
      estimatedCostUsd: result.estimatedCostUsd,
    }).catch(() => undefined);
    return json({ ...publicResult, quota, persisted: Boolean(planId) });
  } catch (error) {
    await refundCapability(env, user.id, "plan.generate");
    const message = error instanceof Error ? error.message : "AI_UNKNOWN_ERROR";
    const errorCode = message.split(":")[0].slice(0, 80);
    console.error("plan_generation_failed", errorCode);
    await recordGenerationRun(env, {
      userId: user.id,
      status: "failed",
      model,
      latencyMs: Date.now() - startedAt,
      errorCode,
      task: "training_plan",
      provider: "router",
    }).catch(() => undefined);
    const budgetLimited = errorCode === "AI_BUDGET_EXHAUSTED";
    return errorJson(
      budgetLimited ? "AI_BUDGET_EXHAUSTED" : "AI_GENERATION_FAILED",
      budgetLimited ? "今日 AI 成本保护已触发，请稍后再试。" : "这次计划没有通过完整校验，额度已退回，请稍后重新生成。",
      budgetLimited ? 429 : 502,
    );
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
  const ai = aiServices(env);
  return {
    database: Boolean(env.DB),
    storage: Boolean(env.R2),
    planner: ai.planner,
    vision: ai.vision && Boolean(env.R2),
    llm: ai.planner,
    cmine: Boolean(env.CMINE_CLIENT_ID && env.CMINE_CLIENT_SECRET && env.SESSION_SECRET && env.DB),
    foodData: foodDataConfigured(),
    billing: stripeConfigured(env),
    mobileBilling: revenueCatConfigured(env),
    rewardAds: rewardAdsConfigured(env),
    mobileAuth: Boolean(env.CMINE_MOBILE_CLIENT_IDS),
    mobileLinks: Boolean(env.APPLE_APP_TEAM_ID && env.ANDROID_APP_SHA256_CERT_FINGERPRINT),
    maintenance: Boolean(env.MAINTENANCE_SECRET),
    providers: ai.providers,
    model: ai.providers.cloudflare ? "Cloudflare AI Router" : env.OPENAI_MODEL || env.AI_COMPAT_TEXT_MODEL || "not configured",
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
  if (url.pathname === "/api/v1/admin/audit" && request.method === "GET") {
    return json({ events: await adminAuditEvents(env, Number(url.searchParams.get("limit") || 100)) });
  }
  const aiRouteMatch = url.pathname.match(/^\/api\/v1\/admin\/ai-routes\/([^/]+)$/);
  if (aiRouteMatch && request.method === "PATCH") {
    const body = await request.json().catch(() => null) as { provider?: unknown; model?: unknown; enabled?: unknown } | null;
    if (!body || !["cloudflare", "openai", "compatible"].includes(String(body.provider)) ||
      typeof body.model !== "string" || body.model.length < 2 || body.model.length > 160 || typeof body.enabled !== "boolean") {
      return errorJson("INVALID_AI_ROUTE", "模型路由配置无效。", 400);
    }
    const updated = await updateAiRoute(env, decodeURIComponent(aiRouteMatch[1]), {
      provider: body.provider as "cloudflare" | "openai" | "compatible",
      model: body.model,
      enabled: body.enabled,
    }, actor);
    return updated ? json({ ok: true }) : errorJson("AI_ROUTE_NOT_FOUND", "没有找到该模型路由。", 404);
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
    if ((body.key === "announcement" || body.key === "disclaimer_version" || body.key === "privacy_version") && (typeof body.value !== "string" || body.value.length > 300)) {
      return errorJson("INVALID_SETTING_VALUE", "设置内容无效。", 400);
    }
    if (!["announcement", "disclaimer_version", "privacy_version", "maintenance_mode"].includes(body.key) &&
      (typeof body.value !== "number" || !Number.isFinite(body.value) || body.value < 0 || body.value > 10000)) {
      return errorJson("INVALID_SETTING_VALUE", "额度或预算必须是有效的非负数字。", 400);
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
    // Coarse capability booleans only. Provider breakdown, model names and
    // reasoning settings are configuration reconnaissance — admin overview
    // (authenticated) carries the full services() object.
    const publicServices: Record<string, unknown> = { ...services(env) };
    delete publicServices.providers;
    delete publicServices.model;
    delete publicServices.reasoningEffort;
    return json({ ok: true, ...publicServices });
  }
  if (request.method === "GET" && url.pathname === "/api/v1/site") {
    return json({
      announcement: await settingValue<string>(env, "announcement", ""),
      disclaimerVersion: await settingValue<string>(env, "disclaimer_version", "health-v2"),
      privacyVersion: await settingValue<string>(env, "privacy_version", "privacy-v1"),
      capabilities: {
        planner: services(env).planner,
        vision: services(env).vision,
        billing: services(env).billing,
        mobileBilling: services(env).mobileBilling,
        rewardAds: services(env).rewardAds,
      },
    });
  }
  if (request.method === "GET" && url.pathname === "/api/auth/config") {
    return json({ cmine: services(env).cmine });
  }
  if (request.method === "GET" && url.pathname === "/api/auth/cmine/start") {
    const limited = await enforceRateLimit(env, request, "auth_start", RATE_RULES.authStart);
    return limited || authStart(request, env);
  }
  if (request.method === "GET" && url.pathname === "/api/auth/cmine/callback") return authCallback(request, env);
  if (request.method === "GET" && url.pathname === "/api/auth/me") {
    const user = await requestUser(request, env);
    return json({
      user: user ? { sub: user.sub, email: user.email, name: user.name, picture: user.picture, role: user.role } : null,
      points: user ? await pointsForUser(env, user.id) : 0,
    });
  }
  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    await deleteSession(request, env);
    return json({ ok: true }, 200, { "set-cookie": cookie("cmine_fit_session", "", request, 0) });
  }

  if (url.pathname === "/api/v1/onboarding" && request.method === "GET") {
    const user = await requireUser(request, env);
    return user instanceof Response ? user : json(await onboardingSnapshot(env, user));
  }
  if ((url.pathname === "/api/v1/onboarding" && request.method === "PATCH") ||
      (url.pathname === "/api/v1/onboarding/import-intake" && request.method === "POST")) {
    const user = await requireUser(request, env); if (user instanceof Response) return user;
    const body = await request.json().catch(() => null) as { step?: unknown; data?: unknown; source?: unknown } | null;
    if (!body?.data || typeof body.data !== "object") return errorJson("INVALID_ONBOARDING_DRAFT", "建档资料格式无效。", 400);
    try { return json(await saveOnboardingDraft(env, user.id, { step: Number(body.step || 0), data: body.data as Record<string, unknown>,
      source: url.pathname.endsWith("import-intake") || body.source === "homepage_intake" ? "homepage_intake" : "guided" }), 201); }
    catch (error) { return errorJson(error instanceof Error ? error.message : "ONBOARDING_SAVE_FAILED", "无法保存建档草稿。", 400); }
  }
  if (url.pathname === "/api/v1/onboarding/complete" && request.method === "POST") {
    const user = await requireUser(request, env); if (user instanceof Response) return user;
    const body = await request.json().catch(() => null) as { profile?: unknown; consent?: unknown; locale?: unknown } | null;
    const profile = profileFrom(body?.profile);
    if (!profile) return errorJson("INVALID_PROFILE", "训练档案不完整或超出安全范围。", 400);
    if (body?.consent !== true) return errorJson("CONSENT_REQUIRED", "请先确认健康免责声明。", 412);
    await recordConsent(request, env, user.id, body.locale === "en" ? "en" : "zh");
    return json(await completeOnboarding(env, user.id, profile), 201);
  }
  if (url.pathname === "/api/v1/onboarding/skip" && request.method === "POST") {
    const user = await requireUser(request, env); return user instanceof Response ? user : json(await skipOnboarding(env, user.id), 201);
  }

  if (request.method === "GET" && url.pathname === "/api/v1/billing/catalog") {
    const [freePlan, freeMeal, freeCoach, proPlan, proMeal, proCoach, proReview, trialDays] = await Promise.all([
      limitForCapability(env, "free", "plan.generate"), limitForCapability(env, "free", "meal.scan"), limitForCapability(env, "free", "coach.chat"),
      limitForCapability(env, "pro", "plan.generate"), limitForCapability(env, "pro", "meal.scan"), limitForCapability(env, "pro", "coach.chat"),
      limitForCapability(env, "pro", "adaptive.review"), settingValue<number>(env, "trial_days", 7),
    ]);
    return json(await billingCatalog(env, {
      free: { planGenerate: freePlan, mealScan: freeMeal, coachChat: freeCoach },
      pro: { planGenerate: proPlan, mealScan: proMeal, coachChat: proCoach, adaptiveReview: proReview },
      trialDays: Number(trialDays) || 0,
    }));
  }
  if (request.method === "POST" && url.pathname === "/api/webhooks/revenuecat") {
    const limited = await enforceRateLimit(env, request, "webhook_rc", RATE_RULES.webhook);
    if (limited) return limited;
    try {
      verifyRevenueCatWebhook(env, request);
      const body = await request.json() as Record<string, unknown>;
      return json({ ok: true, ...(await processRevenueCatEvent(env, body)) });
    } catch (error) {
      const code = error instanceof Error ? error.message : "REVENUECAT_WEBHOOK_FAILED";
      return errorJson(code, "RevenueCat 事件未通过验证或处理失败。", code.includes("SIGNATURE") ? 401 : code.includes("NOT_CONFIGURED") ? 503 : 400);
    }
  }
  if (request.method === "POST" && url.pathname === "/api/internal/notifications/run") {
    try { await verifyMaintenanceRequest(request, env); return json({ ok: true, ...(await runNotifications(env)) }); }
    catch (error) { const code = error instanceof Error ? error.message : "NOTIFICATIONS_FAILED"; return errorJson(code, "通知任务未通过验证或执行失败。", code.includes("SIGNATURE") || code.includes("REPLAY") ? 401 : 500); }
  }
  if (request.method === "POST" && url.pathname === "/api/internal/maintenance/run") {
    try { await verifyMaintenanceRequest(request, env); return json({ ok: true, ...(await runMaintenance(env)) }); }
    catch (error) { const code = error instanceof Error ? error.message : "MAINTENANCE_FAILED"; return errorJson(code, "维护任务未通过验证或执行失败。", code.includes("SIGNATURE") || code.includes("REPLAY") ? 401 : 500); }
  }
  if (request.method === "POST" && url.pathname === "/api/webhooks/stripe") {
    const limited = await enforceRateLimit(env, request, "webhook_stripe", RATE_RULES.webhook);
    if (limited) return limited;
    try {
      const rawBody = await request.text();
      const event = await verifyStripeWebhook(env, rawBody, request.headers.get("stripe-signature"));
      return json({ ok: true, ...(await processStripeEvent(env, event)) });
    } catch (error) {
      const code = error instanceof Error ? error.message.split(":")[0] : "STRIPE_WEBHOOK_FAILED";
      return errorJson(code, "Stripe 事件未通过验证或处理失败。", code.includes("SIGNATURE") ? 400 : 500);
    }
  }
  if ((request.method === "GET" || request.method === "POST") && url.pathname === "/api/webhooks/admob") {
    try {
      return json({ ok: true, ...(await processAdmobReward(request, env)) });
    } catch (error) {
      const code = error instanceof Error ? error.message : "ADMOB_CALLBACK_FAILED";
      return errorJson(code, code === "REWARD_AD_NOT_CONFIGURED" ? "激励广告回调尚未配置，未发放任何积分。" : "广告奖励回调验证失败。", code === "REWARD_AD_NOT_CONFIGURED" ? 503 : 400);
    }
  }
  if (request.method === "GET" && url.pathname === "/api/v1/entitlements") {
    const user = await requireUser(request, env);
    return user instanceof Response ? user : json(await entitlementSnapshot(env, user.id));
  }
  if (request.method === "GET" && url.pathname === "/api/v1/usage") {
    const user = await requireUser(request, env);
    return user instanceof Response ? user : json(await usageForUser(env, user.id));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/billing/checkout") {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    const body = await request.json().catch(() => null) as { interval?: unknown } | null;
    if (body?.interval !== "monthly" && body?.interval !== "yearly") return errorJson("INVALID_INTERVAL", "请选择月付或年付。", 400);
    try {
      return json(await createCheckout(env, user, body.interval, publicOrigin(request, env)), 201);
    } catch (error) {
      const code = error instanceof Error ? error.message.split(":")[0] : "CHECKOUT_FAILED";
      return errorJson(code, code === "STRIPE_NOT_CONFIGURED" ? "支付服务尚未配置。" : "暂时无法创建结账页面。", code === "STRIPE_NOT_CONFIGURED" ? 503 : 502);
    }
  }
  if (request.method === "POST" && url.pathname === "/api/v1/billing/portal") {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    try {
      return json(await createPortal(env, user, publicOrigin(request, env)), 201);
    } catch (error) {
      const code = error instanceof Error ? error.message.split(":")[0] : "PORTAL_FAILED";
      return errorJson(code, code === "STRIPE_NOT_CONFIGURED" ? "支付服务尚未配置。" : "暂时无法打开订阅管理。", code === "STRIPE_NOT_CONFIGURED" ? 503 : 502);
    }
  }
  if (request.method === "POST" && url.pathname === "/api/v1/points/redeem") {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    const body = await request.json().catch(() => null) as { reward?: unknown } | null;
    if (body?.reward !== "meal_scan" && body?.reward !== "plan_refresh") return errorJson("INVALID_REWARD", "兑换项目无效。", 400);
    try {
      return json(await redeemPoints(env, user.id, body.reward), 201);
    } catch (error) {
      const code = error instanceof Error ? error.message : "REDEMPTION_FAILED";
      return errorJson(code, code === "INSUFFICIENT_POINTS" ? "积分不足。" : "暂时无法完成兑换。", code === "INSUFFICIENT_POINTS" ? 409 : 500);
    }
  }

  if (url.pathname === "/api/v1/coach/conversations" && request.method === "GET") {
    const user = await requireUser(request, env); return user instanceof Response ? user : json({ conversations: await listConversations(env, user.id) });
  }
  if (url.pathname === "/api/v1/coach/home" && request.method === "GET") {
    const user = await requireUser(request, env); if (user instanceof Response) return user;
    const [home, habit] = await Promise.all([
      coachHome(env, user),
      habitSummary(env, user.id, user.timezone).catch(() => null),
    ]);
    return json({ ...home, habit });
  }
  if (url.pathname === "/api/v1/habits" && request.method === "GET") {
    const user = await requireUser(request, env); return user instanceof Response ? user : json(await habitSummary(env, user.id, user.timezone));
  }
  if (url.pathname === "/api/v1/habits/commitment" && request.method === "PUT") {
    const user = await requireUser(request, env); if (user instanceof Response) return user;
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    try { return json({ ok: true, commitment: await upsertHabitCommitment(env, user.id, body || {}) }); }
    catch { return errorJson("INVALID_HABIT_COMMITMENT", "训练时间承诺无效：需要 HH:MM 时间，地点不超过 60 字。", 400); }
  }
  if ((url.pathname === "/api/v1/coach/check-ins" || url.pathname === "/api/v1/coach/session-adapt/preview") && request.method === "POST") {
    const user = await requireUser(request, env); if (user instanceof Response) return user;
    try { return json({ checkin: await saveCoachCheckin(env, user, await request.json() as Record<string, unknown>) }, 201); }
    catch { return errorJson("INVALID_CHECKIN", "训练前状态超出有效范围。", 400); }
  }
  if (url.pathname === "/api/v1/coach/memory" && request.method === "GET") {
    const user = await requireUser(request, env); return user instanceof Response ? user : json({ ...(await coachMemorySnapshot(env, user.id)), pro: await tierForUser(env, user.id) === "pro" });
  }
  if (url.pathname === "/api/v1/coach/memory" && request.method === "PUT") {
    const user = await requireUser(request, env); if (user instanceof Response) return user;
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return errorJson("INVALID_MEMORY", "Coach 记忆内容无效。", 400);
    if (body.kind !== "preferences" && await tierForUser(env, user.id) !== "pro") return errorJson("PRO_REQUIRED", "完整 Coach 记忆是专业版能力。", 403);
    try { return json(body.kind === "preferences" ? await updateCoachPreferences(env, user.id, body) : await upsertCoachMemory(env, user.id, body)); }
    catch { return errorJson("INVALID_MEMORY", "Coach 记忆内容无效。", 400); }
  }
  if (url.pathname === "/api/v1/coach/memory" && request.method === "DELETE") {
    const user = await requireUser(request, env); if (user instanceof Response) return user;
    const id = url.searchParams.get("id");
    return json(await deleteCoachMemory(env, user.id, id));
  }
  const coachFeedbackMatch = url.pathname.match(/^\/api\/v1\/coach\/messages\/([^/]+)\/feedback$/);
  if (coachFeedbackMatch && request.method === "POST") {
    const user = await requireUser(request, env); if (user instanceof Response) return user;
    try { return json(await saveCoachFeedback(env, user.id, decodeURIComponent(coachFeedbackMatch[1]), await request.json() as Record<string, unknown>), 201); }
    catch { return errorJson("MESSAGE_NOT_FOUND", "没有找到这条 Coach 回复。", 404); }
  }
  if (url.pathname === "/api/v1/coach/conversations" && request.method === "POST") {
    const user = await requireUser(request, env); if (user instanceof Response) return user;
    const body = await request.json().catch(() => ({})) as { title?: unknown };
    return json({ conversation: await createConversation(env, user.id, typeof body.title === "string" ? body.title : undefined) }, 201);
  }
  const coachMessagesMatch = url.pathname.match(/^\/api\/v1\/coach\/conversations\/([^/]+)\/messages$/);
  if (coachMessagesMatch && request.method === "GET") {
    const user = await requireUser(request, env); if (user instanceof Response) return user;
    try { return json({ messages: await conversationMessages(env, user.id, decodeURIComponent(coachMessagesMatch[1]), url.searchParams.get("before")) }); }
    catch { return errorJson("CONVERSATION_NOT_FOUND", "没有找到这段 Coach 对话。", 404); }
  }
  if (coachMessagesMatch && request.method === "POST") {
    const user = await requireUser(request, env); if (user instanceof Response) return user;
    const limited = await enforceRateLimit(env, request, "coach_chat", RATE_RULES.coachChat, user.id);
    if (limited) return limited;
    const body = await request.json().catch(() => null) as { message?: unknown; clientMutationId?: unknown } | null;
    if (typeof body?.message !== "string") return errorJson("MESSAGE_REQUIRED", "请输入要发送给 Coach 的内容。", 400);
    const message = body.message;
    const conversationId = decodeURIComponent(coachMessagesMatch[1]);
    return coachStream((emit) => sendCoachMessage(env, user, conversationId, { message,
      clientMutationId: typeof body.clientMutationId === "string" ? body.clientMutationId.slice(0, 100) : null,
      onDelta: (delta) => emit("message.delta", { delta }) }));
  }
  const coachActionMatch = url.pathname.match(/^\/api\/v1\/coach\/actions\/([^/]+)\/(accept|reject)$/);
  if (coachActionMatch && request.method === "POST") {
    const user = await requireUser(request, env); if (user instanceof Response) return user;
    try { return json(await decideCoachAction(env, user.id, decodeURIComponent(coachActionMatch[1]), coachActionMatch[2] === "accept" ? "accepted" : "rejected")); }
    catch (error) { const code = error instanceof Error ? error.message : "ACTION_NOT_FOUND"; return errorJson(code, code.includes("NOT_FOUND") ? "没有找到这条 Coach 建议。" : "这条建议已过期或无法安全执行。", code.includes("NOT_FOUND") ? 404 : 409); }
  }

  if (url.pathname === "/api/v1/reviews" && request.method === "GET") {
    const user = await requireUser(request, env); return user instanceof Response ? user : json({ reviews: await listReviews(env, user.id) });
  }
  const reviewMatch = url.pathname.match(/^\/api\/v1\/reviews\/([^/]+)(?:\/(check-in|generate|accept|reject))?$/);
  if (reviewMatch && request.method === "GET" && !reviewMatch[2]) {
    const user = await requireUser(request, env); if (user instanceof Response) return user;
    const review = await reviewDetail(env, user.id, decodeURIComponent(reviewMatch[1]));
    return review ? json({ review }) : errorJson("REVIEW_NOT_FOUND", "没有找到这次复盘。", 404);
  }
  if (reviewMatch && request.method === "POST") {
    const user = await requireUser(request, env); if (user instanceof Response) return user;
    const id = decodeURIComponent(reviewMatch[1]);
    try {
      if (reviewMatch[2] === "check-in") return json({ review: await saveReviewCheckin(env, user.id, id, await request.json() as Record<string, unknown>) }, 201);
      if (reviewMatch[2] === "generate") return json({ review: await generateReview(env, user, id) }, 201);
      if (reviewMatch[2] === "accept" || reviewMatch[2] === "reject") return json(await decideReview(env, user.id, id, reviewMatch[2] === "accept" ? "accepted" : "rejected"));
    } catch (error) {
      const code = error instanceof Error ? error.message.split(":")[0] : "REVIEW_FAILED";
      return errorJson(code,
        code === "REVIEW_LIMIT_REACHED" ? "本月的完整复盘额度已用完。"
          : code === "REVIEW_UPGRADE_REQUIRED" ? "复盘摘要免费可看；采纳教练的完整调整方案需要升级 Pro。"
          : "暂时无法完成这次周度复盘。",
        code === "REVIEW_LIMIT_REACHED" || code === "REVIEW_UPGRADE_REQUIRED" ? 403 : code.includes("NOT_FOUND") ? 404 : 400);
    }
  }

  if (url.pathname === "/api/v1/devices" && request.method === "POST") {
    const user = await requireUser(request, env); if (user instanceof Response) return user;
    try { return json({ device: await registerDevice(env, user.id, await request.json() as Record<string, unknown>) }, 201); }
    catch { return errorJson("INVALID_DEVICE", "设备信息无效。", 400); }
  }
  if (url.pathname === "/api/v1/devices" && request.method === "GET") {
    const user = await requireUser(request, env); if (user instanceof Response) return user;
    const rows = await env.DB!.prepare("SELECT id,platform,name,last_seen_at,created_at FROM devices WHERE user_id=? ORDER BY last_seen_at DESC").bind(user.id).all();
    return json({ devices: rows.results || [] });
  }
  const deviceMatch = url.pathname.match(/^\/api\/v1\/devices\/([^/]+)$/);
  if (deviceMatch && request.method === "DELETE") {
    const user = await requireUser(request, env); return user instanceof Response ? user : json(await deleteDevice(env, user.id, decodeURIComponent(deviceMatch[1])));
  }
  if (url.pathname === "/api/v1/sync/batch" && request.method === "POST") {
    const user = await requireUser(request, env); if (user instanceof Response) return user;
    const body = await request.json().catch(() => null) as { mutations?: unknown } | null;
    try { return json(await syncBatch(env, user.id, body?.mutations), 201); }
    catch { return errorJson("INVALID_SYNC_BATCH", "离线同步批次无效。", 400); }
  }
  if (url.pathname === "/api/v1/sync/changes" && request.method === "GET") {
    const user = await requireUser(request, env); return user instanceof Response ? user : json(await syncChanges(env, user.id, Number(url.searchParams.get("cursor") || 0)));
  }
  if (url.pathname === "/api/v1/health/connections" && request.method === "POST") {
    const user = await requireUser(request, env); if (user instanceof Response) return user;
    try { return json({ connection: await upsertHealthConnection(env, user.id, await request.json() as Record<string, unknown>) }, 201); }
    catch { return errorJson("INVALID_HEALTH_CONNECTION", "健康数据连接无效。", 400); }
  }
  if (url.pathname === "/api/v1/health/connections" && request.method === "GET") {
    const user = await requireUser(request, env); if (user instanceof Response) return user;
    const rows = await env.DB!.prepare("SELECT id,platform,permissions_json,status,created_at,updated_at FROM health_connections WHERE user_id=? ORDER BY updated_at DESC").bind(user.id).all();
    return json({ connections: (rows.results || []).map((row) => ({ ...row, permissions: JSON.parse(String((row as Record<string, unknown>).permissions_json || "[]")) })) });
  }
  const healthImportMatch = url.pathname.match(/^\/api\/v1\/health\/connections\/([^/]+)\/observations$/);
  if (healthImportMatch && request.method === "POST") {
    const user = await requireUser(request, env); if (user instanceof Response) return user;
    const body = await request.json().catch(() => null) as { observations?: unknown } | null;
    try { return json(await importHealthObservations(env, user.id, decodeURIComponent(healthImportMatch[1]), body?.observations as never), 201); }
    catch { return errorJson("INVALID_HEALTH_BATCH", "健康数据批次无效。", 400); }
  }
  const healthConnectionMatch = url.pathname.match(/^\/api\/v1\/health\/connections\/([^/]+)$/);
  if (healthConnectionMatch && request.method === "DELETE") {
    const user = await requireUser(request, env); return user instanceof Response ? user : json(await deleteHealthConnection(env, user.id, decodeURIComponent(healthConnectionMatch[1])));
  }
  if (url.pathname === "/api/v1/notification-preferences" && request.method === "GET") {
    const user = await requireUser(request, env); if (user instanceof Response) return user;
    const row = await env.DB!.prepare("SELECT training,coach,reviews,nutrition,billing,quiet_start,quiet_end FROM notification_preferences WHERE user_id=?").bind(user.id).first<Record<string, unknown>>();
    return json({ preferences: row || { training: 1, coach: 1, reviews: 1, nutrition: 0, billing: 1, quiet_start: "22:00", quiet_end: "08:00" } });
  }
  if (url.pathname === "/api/v1/notification-preferences" && request.method === "PUT") {
    const user = await requireUser(request, env); if (user instanceof Response) return user;
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || !/^\d{2}:\d{2}$/.test(String(body.quietStart || "")) || !/^\d{2}:\d{2}$/.test(String(body.quietEnd || ""))) return errorJson("INVALID_NOTIFICATION_PREFERENCES", "通知偏好设置无效。", 400);
    await env.DB!.prepare(`INSERT INTO notification_preferences (user_id,training,coach,reviews,nutrition,billing,quiet_start,quiet_end,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET training=excluded.training,coach=excluded.coach,reviews=excluded.reviews,nutrition=excluded.nutrition,billing=excluded.billing,quiet_start=excluded.quiet_start,quiet_end=excluded.quiet_end,updated_at=excluded.updated_at`)
      .bind(user.id, body.training === false ? 0 : 1, body.coach === false ? 0 : 1, body.reviews === false ? 0 : 1, body.nutrition === true ? 1 : 0, body.billing === false ? 0 : 1, body.quietStart, body.quietEnd, new Date().toISOString()).run();
    return json({ ok: true });
  }

  if (request.method === "POST" && url.pathname === "/api/v1/meals/upload") {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    const limited = await enforceRateLimit(env, request, "meal_upload", RATE_RULES.mealUpload, user.id);
    if (limited) return limited;
    const form = await request.formData().catch(() => null);
    const file = form?.get("image");
    const mealType = String(form?.get("mealType") || "meal").slice(0, 30);
    const eatenAtValue = String(form?.get("eatenAt") || new Date().toISOString());
    const eatenAt = new Date(eatenAtValue);
    if (!(file instanceof File) || !Number.isFinite(eatenAt.getTime())) return errorJson("INVALID_MEAL_UPLOAD", "请选择有效的饭菜图片和时间。", 400);
    try {
      return json(await uploadMealImage(env, user, file, mealType, eatenAt.toISOString()), 201);
    } catch (error) {
      const code = error instanceof Error ? error.message : "MEAL_UPLOAD_FAILED";
      const status = code === "MEAL_STORAGE_NOT_CONFIGURED" ? 503 : 400;
      return errorJson(code, status === 503 ? "图片存储尚未配置。" : "图片格式、大小或内容无效。", status);
    }
  }
  if (request.method === "POST" && url.pathname === "/api/v1/meals/analyze") {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    const body = await request.json().catch(() => null) as { mealId?: unknown } | null;
    if (typeof body?.mealId !== "string") return errorJson("INVALID_MEAL", "缺少餐食记录。", 400);
    try {
      return json(await analyzeMeal(env, user, body.mealId), 201);
    } catch (error) {
      const code = error instanceof Error ? error.message.split(":")[0] : "MEAL_ANALYSIS_FAILED";
      const status = code === "MEAL_SCAN_LIMIT_REACHED" || code === "AI_BUDGET_EXHAUSTED" ? 429 :
        code.includes("NOT_FOUND") ? 404 : code.includes("NOT_CONFIGURED") ? 503 : 502;
      const message = code === "MEAL_SCAN_LIMIT_REACHED" ? "本周期的饭菜识别额度已用完，可使用积分兑换或升级专业版。" :
        code === "AI_BUDGET_EXHAUSTED" ? "今日 AI 成本保护已触发，请稍后再试。" :
          code.includes("NOT_CONFIGURED") ? "饭菜识别模型尚未配置。" : "这张图片暂时无法可靠识别，额度已退回。";
      return errorJson(code, message, status);
    }
  }
  const mealConfirmMatch = url.pathname.match(/^\/api\/v1\/meals\/([^/]+)\/confirm$/);
  if (mealConfirmMatch && request.method === "POST") {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    const body = await request.json().catch(() => null) as Parameters<typeof confirmMeal>[3] | null;
    if (!body || !Array.isArray(body.items)) return errorJson("INVALID_MEAL_ITEMS", "请确认餐食和份量。", 400);
    try {
      return json(await confirmMeal(env, user, decodeURIComponent(mealConfirmMatch[1]), body), 201);
    } catch (error) {
      const code = error instanceof Error ? error.message : "MEAL_CONFIRM_FAILED";
      return errorJson(code, code === "NUTRITION_REFERENCE_REQUIRED" ? "部分食物缺少营养数据，请选择数据库结果或手动填写。" : "餐食内容无效。", code === "MEAL_NOT_FOUND" ? 404 : 400);
    }
  }
  if (url.pathname === "/api/v1/meals" && request.method === "GET") {
    const user = await requireUser(request, env);
    return user instanceof Response ? user : json({ meals: await mealsForUser(env, user.id, Number(url.searchParams.get("limit") || 30)) });
  }
  if (url.pathname === "/api/v1/meals" && request.method === "POST") {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    const body = await request.json().catch(() => null) as Parameters<typeof createManualMeal>[2] | null;
    if (!body || !Array.isArray(body.items) || typeof body.mealType !== "string" || typeof body.eatenAt !== "string") {
      return errorJson("INVALID_MEAL_ITEMS", "请填写完整的餐食信息。", 400);
    }
    try { return json(await createManualMeal(env, user, body), 201); }
    catch (error) { return errorJson(error instanceof Error ? error.message : "MEAL_CREATE_FAILED", "餐食内容无效。", 400); }
  }
  if (url.pathname === "/api/v1/nutrition/daily" && request.method === "GET") {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return errorJson("INVALID_DATE", "日期格式无效。", 400);
    return json(await dailyNutrition(env, user.id, date));
  }
  if (url.pathname === "/api/v1/exercises/search" && request.method === "GET") {
    const user = await requireUser(request, env); if (user instanceof Response) return user;
    const limited = await enforceRateLimit(env, request, "exercise_search", RATE_RULES.exerciseSearch, user.id);
    if (limited) return limited;
    const query = (url.searchParams.get("q") || "").trim().toLocaleLowerCase().slice(0, 80);
    const equipmentFilter = (url.searchParams.get("equipment") || "").trim().toLocaleLowerCase();
    const targetFilter = (url.searchParams.get("target") || "").trim().toLocaleLowerCase();
    const assetResponse = await env.ASSETS.fetch(new Request(new URL("/exercise-catalog.json", request.url)));
    if (!assetResponse.ok) return errorJson("EXERCISE_CATALOG_UNAVAILABLE", "动作目录暂时不可用。", 503);
    const catalog = await assetResponse.json() as { count: number; mediaPolicy: string; exercises: Array<Record<string, unknown>> };
    const results = catalog.exercises.filter((item) => {
      const text = `${item.name || ""} ${item.bodyPart || ""} ${item.target || ""} ${item.muscleGroup || ""}`.toLocaleLowerCase();
      return (!query || text.includes(query)) && (!equipmentFilter || String(item.equipment || "").toLocaleLowerCase() === equipmentFilter) && (!targetFilter || text.includes(targetFilter));
    }).slice(0, Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 24))));
    return json({ total: catalog.count, count: results.length, mediaPolicy: catalog.mediaPolicy, exercises: results });
  }
  const exerciseDetailMatch = url.pathname.match(/^\/api\/v1\/exercises\/([^/]+)$/);
  if (exerciseDetailMatch && request.method === "GET") {
    const user = await requireUser(request, env); if (user instanceof Response) return user;
    const assetResponse = await env.ASSETS.fetch(new Request(new URL("/exercise-catalog.json", request.url)));
    const catalog = assetResponse.ok ? await assetResponse.json() as { exercises: Array<Record<string, unknown>> } : null;
    const exercise = catalog?.exercises.find((item) => String(item.id) === decodeURIComponent(exerciseDetailMatch[1]));
    return exercise ? json({ exercise }) : errorJson("EXERCISE_NOT_FOUND", "没有找到该动作。", 404);
  }
  if (url.pathname === "/api/v1/foods/search" && request.method === "GET") {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    // Upstream USDA/OFF quotas are a shared resource — throttle before proxying.
    const limited = await enforceRateLimit(env, request, "food_search", RATE_RULES.foodSearch, user.id);
    if (limited) return limited;
    return json({ foods: await searchFoods(env, url.searchParams.get("q") || "", { userId: user.id,
      locale: url.searchParams.get("locale") || user.locale, region: url.searchParams.get("region"),
      source: url.searchParams.get("source"), limit: Number(url.searchParams.get("limit") || 15) }) });
  }
  if (url.pathname === "/api/v1/foods/custom" && request.method === "POST") {
    const user = await requireUser(request, env); if (user instanceof Response) return user;
    const body = await request.json().catch(() => null) as Parameters<typeof createCustomFood>[2] | null;
    try { return json({ food: await createCustomFood(env, user, body as Parameters<typeof createCustomFood>[2]) }, 201); }
    catch { return errorJson("INVALID_CUSTOM_FOOD", "自定义食品的营养信息无效。", 400); }
  }
  const barcodeMatch = url.pathname.match(/^\/api\/v1\/foods\/barcode\/([^/]+)$/);
  if (barcodeMatch && request.method === "GET") {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    const food = await foodByBarcode(env, decodeURIComponent(barcodeMatch[1]));
    return food ? json({ food }) : errorJson("FOOD_NOT_FOUND", "食品数据库中没有找到该条码。", 404);
  }
  const foodCorrectionMatch = url.pathname.match(/^\/api\/v1\/foods\/([^/]+)\/corrections$/);
  if (foodCorrectionMatch && request.method === "POST") {
    const user = await requireUser(request, env); if (user instanceof Response) return user;
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    try { return json({ correction: await submitFoodCorrection(env, user.id, decodeURIComponent(foodCorrectionMatch[1]), body || {}) }, 201); }
    catch { return errorJson("INVALID_CORRECTION", "纠错内容无效。", 400); }
  }
  const foodDetailMatch = url.pathname.match(/^\/api\/v1\/foods\/([^/]+)$/);
  if (foodDetailMatch && request.method === "GET") {
    const user = await requireUser(request, env); if (user instanceof Response) return user;
    const food = await foodReference(env, decodeURIComponent(foodDetailMatch[1]));
    return food ? json({ food }) : errorJson("FOOD_NOT_FOUND", "没有找到该食品。", 404);
  }
  if (url.pathname === "/api/v1/recipes" && request.method === "GET") {
    const user = await requireUser(request, env); return user instanceof Response ? user : json({ recipes: await recipesForUser(env, user.id) });
  }
  if (url.pathname === "/api/v1/recipes" && request.method === "POST") {
    const user = await requireUser(request, env); if (user instanceof Response) return user;
    const body = await request.json().catch(() => null) as Parameters<typeof createRecipe>[2] | null;
    try { return json({ recipe: await createRecipe(env, user, body as Parameters<typeof createRecipe>[2]) }, 201); }
    catch { return errorJson("INVALID_RECIPE", "菜谱信息不完整或营养来源无效。", 400); }
  }
  const recipeCalculateMatch = url.pathname.match(/^\/api\/v1\/recipes\/([^/]+)\/calculate$/);
  if (recipeCalculateMatch && request.method === "POST") {
    const user = await requireUser(request, env); if (user instanceof Response) return user;
    const body = await request.json().catch(() => null) as Parameters<typeof recalculateRecipe>[3] | null;
    try { return json({ recipe: await recalculateRecipe(env, user.id, decodeURIComponent(recipeCalculateMatch[1]), body || undefined) }); }
    catch (error) { return errorJson(error instanceof Error ? error.message : "INVALID_RECIPE", "菜谱不存在或营养来源无效。", 400); }
  }
  if (url.pathname === "/api/v1/meal-templates" && request.method === "GET") {
    const user = await requireUser(request, env); return user instanceof Response ? user : json({ templates: await mealTemplatesForUser(env, user.id) });
  }
  if (url.pathname === "/api/v1/meal-templates" && request.method === "POST") {
    const user = await requireUser(request, env); if (user instanceof Response) return user;
    const body = await request.json().catch(() => null) as Parameters<typeof createMealTemplate>[2] | null;
    try { return json({ template: await createMealTemplate(env, user.id, body as Parameters<typeof createMealTemplate>[2]) }, 201); }
    catch { return errorJson("INVALID_TEMPLATE", "餐食模板内容无效。", 400); }
  }
  const mealImageMatch = url.pathname.match(/^\/api\/v1\/meal-images\/([^/]+)$/);
  if (mealImageMatch && request.method === "DELETE") {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    try { await deleteMealImage(env, user.id, decodeURIComponent(mealImageMatch[1])); return json({ ok: true }); }
    catch { return errorJson("MEAL_IMAGE_NOT_FOUND", "没有找到该图片。", 404); }
  }

  if (request.method === "POST" && (url.pathname === "/api/plans" || url.pathname === "/api/v1/plans")) {
    const limited = await enforceRateLimit(env, request, "plan_generate", RATE_RULES.planGenerate);
    return limited || planRequest(request, env);
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
    const limited = await enforceRateLimit(env, request, "consent_write", RATE_RULES.consentWrite);
    if (limited) return limited;
    const body = await request.json().catch(() => ({})) as { locale?: string; timezone?: string; productVersion?: string };
    const user = await getSessionUser(request, env);
    if (!env.DB) return errorJson("DATABASE_NOT_CONFIGURED", "数据库尚未连接。", 503);
    await recordConsent(request, env, user?.id || null, body.locale === "en" ? "en" : "zh", {
      timezone: typeof body.timezone === "string" ? body.timezone : null,
      productVersion: typeof body.productVersion === "string" ? body.productVersion : null,
    });
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
    // Irreversible: a stray script or CSRF-adjacent request must not be able to
    // wipe an account. The client has to echo an explicit confirmation phrase.
    const body = await request.json().catch(() => null) as { confirm?: unknown } | null;
    if (body?.confirm !== "DELETE") return errorJson("DELETE_CONFIRMATION_REQUIRED", "删除账户需要在请求中确认（confirm: \"DELETE\"）。", 428);
    console.log("account_deleted", user.id);
    await deleteUserData(env, user.id);
    return json({ ok: true }, 200, { "set-cookie": cookie("cmine_fit_session", "", request, 0) });
  }
  if (url.pathname === "/api/v1/export" && request.method === "GET") {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    // Full-PII payload: tightly throttled and logged.
    const limited = await enforceRateLimit(env, request, "export", RATE_RULES.exportData, user.id);
    if (limited) return limited;
    console.log("data_export", user.id);
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
  const planActivateMatch = url.pathname.match(/^\/api\/v1\/plans\/([^/]+)\/(activate|confirm|rollback)$/);
  if (planActivateMatch && request.method === "POST") {
    const user = await requireUser(request, env); if (user instanceof Response) return user;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const startDate = typeof body.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.startDate) ? body.startDate : undefined;
    const timezone = typeof body.timezone === "string" && body.timezone.length <= 80 ? body.timezone : user.timezone;
    try { return json(await activatePlan(env, user.id, decodeURIComponent(planActivateMatch[1]), planActivateMatch[2] === "rollback" ? "user_rollback" : "user_confirmed", { startDate, timezone })); }
    catch { return errorJson("PLAN_VERSION_NOT_FOUND", "没有找到可启用的计划草案。", 404); }
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
      const planId = decodeURIComponent(workoutMatch[1]);
      const sessionInput = {
        dayIndex,
        status: workoutMatch[2] === "complete" ? "completed" : "in_progress",
        durationMinutes,
        rpe,
        pain: Math.max(0, Math.min(10, Number(body?.pain || 0))),
        notes: typeof body?.notes === "string" ? body.notes.trim().slice(0, 500) : "",
      } as const;
      if (typeof body?.occurrenceId === "string") await saveWorkoutOccurrenceSession(env, user.id, planId, body.occurrenceId, sessionInput);
      else await saveWorkoutSession(env, user.id, planId, sessionInput);
      return json({ ok: true }, 201);
    } catch {
      return errorJson("PLAN_NOT_FOUND", "没有找到对应计划。", 404);
    }
  }

  const workoutSetsMatch = url.pathname.match(/^\/api\/v1\/workouts\/([^/]+)\/sets$/);
  if (workoutSetsMatch && request.method === "GET") {
    const user = await requireUser(request, env); if (user instanceof Response) return user;
    const dayIndex = Number(url.searchParams.get("dayIndex"));
    if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) return errorJson("INVALID_WORKOUT_DAY", "训练日期无效。", 400);
    try { return json(await workoutSetsForDay(env, user.id, decodeURIComponent(workoutSetsMatch[1]), dayIndex, url.searchParams.get("occurrenceId"))); }
    catch { return errorJson("PLAN_NOT_FOUND", "没有找到对应计划。", 404); }
  }
  if (workoutSetsMatch && request.method === "POST") {
    const user = await requireUser(request, env); if (user instanceof Response) return user;
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const numberOrNull = (value: unknown) => value === null || value === undefined || value === "" ? null : Number(value);
    const input: WorkoutSetInput = {
      occurrenceId: typeof body?.occurrenceId === "string" ? body.occurrenceId : null,
      dayIndex: Number(body?.dayIndex), exerciseId: typeof body?.exerciseId === "string" ? body.exerciseId : "",
      setIndex: Number(body?.setIndex), setType: (["warmup", "working", "dropset", "failure"].includes(String(body?.setType)) ? body?.setType : "working") as WorkoutSetInput["setType"],
      targetReps: typeof body?.targetReps === "string" ? body.targetReps.slice(0, 30) : null,
      weightKg: numberOrNull(body?.weightKg), reps: numberOrNull(body?.reps), rir: numberOrNull(body?.rir), rpe: numberOrNull(body?.rpe),
      completed: body?.completed === true, clientMutationId: typeof body?.clientMutationId === "string" ? body.clientMutationId.slice(0, 100) : null,
    };
    const valid = Number.isInteger(input.dayIndex) && input.dayIndex >= 0 && input.dayIndex <= 6 && input.exerciseId.length > 0 && input.exerciseId.length <= 100 &&
      Number.isInteger(input.setIndex) && input.setIndex >= 0 && input.setIndex < 20 &&
      (input.weightKg === null || Number.isFinite(input.weightKg) && input.weightKg >= 0 && input.weightKg <= 1000) &&
      (input.reps === null || Number.isInteger(input.reps) && input.reps >= 0 && input.reps <= 500) &&
      (input.rir === null || Number.isFinite(input.rir) && input.rir >= 0 && input.rir <= 10) &&
      (input.rpe === null || Number.isFinite(input.rpe) && input.rpe >= 1 && input.rpe <= 10);
    if (!valid) return errorJson("INVALID_WORKOUT_SET", "组次记录超出有效范围。", 400);
    try { return json({ set: await upsertWorkoutSet(env, user.id, decodeURIComponent(workoutSetsMatch[1]), input) }, 201); }
    catch { return errorJson("PLAN_EXERCISE_NOT_FOUND", "该动作不属于当前计划。", 404); }
  }

  const occurrenceRescheduleMatch = url.pathname.match(/^\/api\/v1\/workouts\/occurrences\/([^/]+)\/reschedule$/);
  if (occurrenceRescheduleMatch && request.method === "POST") {
    const user = await requireUser(request, env); if (user instanceof Response) return user;
    const body = await request.json().catch(() => null) as { scheduledDate?: unknown } | null;
    if (typeof body?.scheduledDate !== "string") return errorJson("INVALID_DATE", "请选择新的训练日期。", 400);
    try { return json({ occurrence: await rescheduleOccurrence(env, user.id, decodeURIComponent(occurrenceRescheduleMatch[1]), body.scheduledDate) }); }
    catch (error) {
      const code = error instanceof Error ? error.message : "RESCHEDULE_FAILED";
      return errorJson(code, code === "DATE_CONFLICT" ? "该日期已经有训练安排，请选择其他日期。" : "暂时无法修改训练日期。", code === "DATE_CONFLICT" ? 409 : 400);
    }
  }

  return errorJson("NOT_FOUND", "没有找到该接口。", 404);
}
