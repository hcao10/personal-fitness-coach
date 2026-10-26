import type { CoachPlan, Profile, WorkoutDay } from "../../packages/coach-core/src";
import type { CoachDailyBrief, CoachEvidence, CoachMemory } from "../../packages/api-contracts/src";
import type { StoredUser } from "../db";
import { ensureActiveOccurrences, localDateInTimezone, occurrenceForDate, profileForUser, setOccurrenceMode } from "../db";
import type { WorkerEnv } from "../platform";
import { entitlementSnapshot } from "../product";
import { tierForUser } from "../product";
import { generateConversationSummary } from "../llm";
import { recordGenerationRun } from "../telemetry";
import { toLocale, translator } from "../../packages/i18n/src";

function parseJson<T>(value: string | null | undefined): T | null { try { return value ? JSON.parse(value) as T : null; } catch { return null; } }
function clamp(value: unknown, min: number, max: number) { return Math.max(min, Math.min(max, Number(value))); }
function dateDifference(start: string, end: string) { return Math.floor((new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86_400_000); }

export async function coachHome(env: WorkerEnv, user: StoredUser) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const cycle = await ensureActiveOccurrences(env, user.id);
  const locale = toLocale(user.locale);
  const t = translator(locale);
  const timezone = user.timezone || cycle?.timezone || "UTC";
  const localDate = localDateInTimezone(timezone);
  const occurrence = cycle ? await occurrenceForDate(env, user.id, localDate) : null;
  const plan = cycle?.plan as CoachPlan | null;
  const profile = cycle?.profile as Profile | null;
  const relativeDay = cycle ? Math.max(0, dateDifference(cycle.startDate, localDate)) : 0;
  const dayIndex = occurrence?.day_index ?? relativeDay % 7;
  const day = (occurrence?.workout_override_json ? parseJson<WorkoutDay>(occurrence.workout_override_json) : null) || plan?.schedule?.[dayIndex] || null;
  const since = new Date(Date.now() - 28 * 86_400_000).toISOString();
  const [occurrenceSessions, legacySessions, measurement, nutrition, health, pending, review, memoryCount, preferences, product] = await Promise.all([
    env.DB.prepare(`SELECT rpe,pain,duration_minutes,status,completed_at FROM workout_occurrence_sessions
      WHERE user_id=? AND updated_at>=? ORDER BY updated_at DESC LIMIT 8`).bind(user.id, since).all<{
        rpe: number | null; pain: number; duration_minutes: number | null; status: string; completed_at: string | null;
      }>(),
    env.DB.prepare(`SELECT rpe,pain,duration_minutes,status,completed_at FROM workout_sessions
      WHERE user_id=? AND updated_at>=? ORDER BY updated_at DESC LIMIT 8`).bind(user.id, since).all<{
        rpe: number | null; pain: number; duration_minutes: number | null; status: string; completed_at: string | null;
      }>(),
    env.DB.prepare("SELECT weight_kg,measured_at FROM measurements WHERE user_id=? ORDER BY measured_at DESC LIMIT 1")
      .bind(user.id).first<{ weight_kg: number | null; measured_at: string }>(),
    env.DB.prepare(`SELECT SUM(calories) AS calories,SUM(protein_g) AS protein FROM meal_logs
      WHERE user_id=? AND status='confirmed' AND substr(eaten_at,1,10)=?`).bind(user.id, localDate)
      .first<{ calories: number | null; protein: number | null }>(),
    env.DB.prepare(`SELECT type,value,unit,observed_at,source_name FROM health_observations
      WHERE user_id=? AND observed_at>=? ORDER BY observed_at DESC LIMIT 8`).bind(user.id, new Date(Date.now() - 3 * 86_400_000).toISOString())
      .all<{ type: string; value: number; unit: string; observed_at: string; source_name: string | null }>(),
    env.DB.prepare(`SELECT id,action_type,payload_json,status,expires_at FROM coach_action_proposals
      WHERE user_id=? AND status='pending' AND (expires_at IS NULL OR expires_at>?) ORDER BY created_at DESC LIMIT 5`)
      .bind(user.id, new Date().toISOString()).all<{ id: string; action_type: string; payload_json: string; status: string; expires_at: string | null }>(),
    env.DB.prepare("SELECT id,status,week_start FROM weekly_reviews WHERE user_id=? ORDER BY week_start DESC LIMIT 1")
      .bind(user.id).first<{ id: string; status: string; week_start: string }>(),
    env.DB.prepare("SELECT COUNT(*) AS value FROM coach_memories WHERE user_id=? AND status='active'").bind(user.id).first<{ value: number }>(),
    env.DB.prepare("SELECT proactive_enabled FROM coach_preferences WHERE user_id=?").bind(user.id).first<{ proactive_enabled: number }>(),
    entitlementSnapshot(env, user.id),
  ]);
  const sessions = Number(occurrenceSessions.results?.length || 0) ? occurrenceSessions : legacySessions;
  const completed = (sessions.results || []).filter((item) => item.status === "completed");
  const recentRpe = completed.filter((item) => Number.isFinite(item.rpe)).slice(0, 2).map((item) => Number(item.rpe));
  const steps = (health.results || []).find((item) => item.type === "steps");
  const evidence: CoachEvidence[] = [];
  if (plan) evidence.push({ label: t("coach.briefEvidencePlan"), value: t("coach.briefWeekValue", { current: plan.phase?.currentWeek || Math.floor(relativeDay / 7) + 1, total: plan.phase?.lengthWeeks || cycle?.phaseWeeks || 4 }), observedAt: cycle?.startDate, source: "Cmine Fit" });
  if (recentRpe.length) evidence.push({ label: t("coach.briefEvidenceRpe"), value: recentRpe.join(locale === "zh" ? "、" : ", "), observedAt: completed[0]?.completed_at, source: t("coach.briefSourceTraining") });
  if (measurement?.weight_kg) evidence.push({ label: t("coach.briefEvidenceWeight"), value: `${measurement.weight_kg} kg`, observedAt: measurement.measured_at, source: t("coach.briefSourceBody") });
  if (steps) evidence.push({ label: t("coach.briefEvidenceSteps"), value: t("coach.briefStepsValue", { count: Math.round(steps.value) }), observedAt: steps.observed_at, source: steps.source_name || t("coach.briefSourceHealth") });
  const dataState: CoachDailyBrief["dataState"] = product.membership.tier === "pro" && completed.length >= 2 ? "personalized" : evidence.length > 1 ? "partial" : "plan_only";
  const rest = !day || Boolean(day.restDay);
  const proactiveEnabled = preferences ? Boolean(preferences.proactive_enabled) : true;
  const priorities = !proactiveEnabled ? [] : rest
    ? [t("coach.briefRestWalk"), t("coach.briefRestMobility"), t("coach.briefProteinTarget", { grams: plan?.protein || "—" })]
    : [t("coach.briefTrainingPriority", { title: day.title[locale] }), t("coach.briefReserveMinutes", { minutes: day.duration }), t("coach.briefUseAlternative")];
  const brief: CoachDailyBrief = {
    localDate,
    headline: rest ? t("coach.briefRestHeadline") : t("coach.briefTrainingHeadline", { title: day.title[locale] }),
    summary: dataState === "plan_only"
      ? t("coach.briefPlanOnlySummary")
      : recentRpe.some((value) => value >= 9) ? t("coach.briefHighRpeSummary") : t("coach.briefReadySummary"),
    priorities,
    primaryAction: { label: rest ? t("coach.briefRecoveryAction") : t("coach.briefTrainingAction"), href: "/today", kind: rest ? "recover" : "train" },
    basis: evidence,
    dataState,
  };
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO coach_daily_briefs (id,user_id,local_date,payload_json,data_freshness_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id,local_date) DO UPDATE SET payload_json=excluded.payload_json,data_freshness_json=excluded.data_freshness_json,updated_at=excluded.updated_at`)
    .bind(crypto.randomUUID(), user.id, localDate, JSON.stringify(brief), JSON.stringify(Object.fromEntries(evidence.map((item) => [item.label, item.observedAt || null]))), now, now).run();
  return {
    brief,
    phase: plan?.phase ? { ...plan.phase, currentWeek: Math.min(plan.phase.lengthWeeks, Math.floor(relativeDay / 7) + 1), progressPct: Math.min(100, Math.round((relativeDay + 1) / (plan.phase.lengthWeeks * 7) * 100)) } : null,
    today: day ? { occurrenceId: occurrence?.id || null, scheduledDate: localDate, dayIndex, status: occurrence?.status || "scheduled", mode: occurrence?.mode || "standard", revision: occurrence?.revision || 0, versionId: occurrence?.version_id || null, workout: day } : null,
    pendingActions: (pending.results || []).map((item) => ({ id: item.id, type: item.action_type, status: item.status, expiresAt: item.expires_at, payload: parseJson(item.payload_json) || {} })),
    latestReview: review || null,
    memoryCount: Number(memoryCount?.value || 0),
    proactiveEnabled,
    product,
    profile: profile ? { track: profile.trainingTrack, goal: profile.goal } : null,
    nutritionToday: { calories: Number(nutrition?.calories || 0), protein: Number(nutrition?.protein || 0), calorieTarget: plan?.calories || null, proteinTarget: plan?.protein || null },
  };
}

export async function saveCoachCheckin(env: WorkerEnv, user: StoredUser, input: Record<string, unknown>) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const energy = clamp(input.energy, 1, 5); const soreness = clamp(input.soreness, 0, 10); const pain = clamp(input.pain, 0, 10);
  const availableMinutes = clamp(input.availableMinutes, 10, 180);
  if (![energy, soreness, pain, availableMinutes].every(Number.isFinite)) throw new Error("INVALID_CHECKIN");
  const home = await coachHome(env, user); const plannedDuration = Number(home.today?.workout.duration || 30);
  const t = translator(toLocale(user.locale));
  let mode: "standard" | "short" | "recovery" | "reschedule" = "standard";
  let title = t("coach.checkinStandardTitle"); let explanation = t("coach.checkinStandardExplanation");
  if (pain >= 4) { mode = "recovery"; title = t("coach.checkinPainTitle"); explanation = t("coach.checkinPainExplanation"); }
  else if (energy <= 1 || soreness >= 8) { mode = "recovery"; title = t("coach.checkinRecoveryTitle"); explanation = t("coach.checkinRecoveryExplanation"); }
  else if (availableMinutes < Math.min(20, plannedDuration)) { mode = "reschedule"; title = t("coach.checkinRescheduleTitle"); explanation = t("coach.checkinRescheduleExplanation"); }
  else if (availableMinutes < plannedDuration || energy <= 2 || soreness >= 6) { mode = "short"; title = t("coach.checkinShortTitle"); explanation = t("coach.checkinShortExplanation"); }
  const recommendation = { mode, title, explanation, stopConditions: [t("coach.checkinStopPain"), t("coach.checkinStopEmergency")] };
  const id = crypto.randomUUID(); const now = new Date().toISOString(); const occurrenceId = typeof input.occurrenceId === "string" ? input.occurrenceId : null;
  await env.DB.prepare(`INSERT INTO coach_checkins
    (id,user_id,occurrence_id,energy,soreness,pain,available_minutes,note,recommendation_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, user.id, occurrenceId, energy, soreness, pain, availableMinutes, String(input.note || "").slice(0, 500) || null, JSON.stringify(recommendation), now).run();
  if (occurrenceId && mode !== "reschedule") await setOccurrenceMode(env, user.id, occurrenceId, mode);
  return { id, energy, soreness, pain, availableMinutes, recommendation, createdAt: now };
}

export async function coachMemorySnapshot(env: WorkerEnv, userId: string) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const [rows, preferences, profile] = await Promise.all([
    env.DB.prepare(`SELECT id,memory_type,memory_key,value,source,confidence,updated_at FROM coach_memories
      WHERE user_id=? AND status='active' ORDER BY memory_type,updated_at DESC`).bind(userId).all<{
        id: string; memory_type: CoachMemory["type"]; memory_key: string; value: string; source: CoachMemory["source"]; confidence: number; updated_at: string;
      }>(),
    env.DB.prepare("SELECT memory_enabled,coaching_mode,tone,proactive_enabled,updated_at FROM coach_preferences WHERE user_id=?")
      .bind(userId).first<Record<string, unknown>>(),
    profileForUser(env, userId),
  ]);
  const profileMemories: CoachMemory[] = profile ? [
    { id: "profile:goal", type: "profile", key: "goal", value: String(profile.goal), source: "profile", confidence: 1, updatedAt: new Date().toISOString() },
    { id: "profile:equipment", type: "profile", key: "equipment", value: String(profile.equipment), source: "profile", confidence: 1, updatedAt: new Date().toISOString() },
    ...(profile.limitations ? [{ id: "profile:limitations", type: "profile" as const, key: "limitations", value: profile.limitations, source: "profile" as const, confidence: 1, updatedAt: new Date().toISOString() }] : []),
  ] : [];
  return {
    memories: [...profileMemories, ...(rows.results || []).map((row) => ({ id: row.id, type: row.memory_type, key: row.memory_key, value: row.value, source: row.source, confidence: row.confidence, updatedAt: row.updated_at }))],
    preferences: { memoryEnabled: preferences ? Boolean(preferences.memory_enabled) : true, coachingMode: String(preferences?.coaching_mode || "personalized"), tone: String(preferences?.tone || "supportive"), proactiveEnabled: preferences ? Boolean(preferences.proactive_enabled) : true },
  };
}

export async function upsertCoachMemory(env: WorkerEnv, userId: string, input: Record<string, unknown>) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const key = String(input.key || "").trim().slice(0, 60); const value = String(input.value || "").trim().slice(0, 500);
  if (!key || !value) throw new Error("INVALID_MEMORY");
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO coach_memories (id,user_id,memory_type,memory_key,value,source,confidence,status,created_at,updated_at)
    VALUES (?,?, 'declared',?,?, 'user',1,'active',?,?) ON CONFLICT(user_id,memory_key) DO UPDATE SET value=excluded.value,status='active',updated_at=excluded.updated_at`)
    .bind(id, userId, key, value, now, now).run();
  return coachMemorySnapshot(env, userId);
}

export async function updateCoachPreferences(env: WorkerEnv, userId: string, input: Record<string, unknown>) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const memoryEnabled = input.memoryEnabled !== false; const proactiveEnabled = input.proactiveEnabled !== false;
  const coachingMode = input.coachingMode === "education" ? "education" : "personalized";
  const tone = ["supportive", "direct", "concise"].includes(String(input.tone)) ? String(input.tone) : "supportive";
  await env.DB.prepare(`INSERT INTO coach_preferences (user_id,memory_enabled,coaching_mode,tone,proactive_enabled,updated_at)
    VALUES (?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET memory_enabled=excluded.memory_enabled,coaching_mode=excluded.coaching_mode,tone=excluded.tone,proactive_enabled=excluded.proactive_enabled,updated_at=excluded.updated_at`)
    .bind(userId, memoryEnabled ? 1 : 0, coachingMode, tone, proactiveEnabled ? 1 : 0, new Date().toISOString()).run();
  return coachMemorySnapshot(env, userId);
}

export async function deleteCoachMemory(env: WorkerEnv, userId: string, memoryId?: string | null) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  if (memoryId) await env.DB.prepare("UPDATE coach_memories SET status='deleted',updated_at=? WHERE id=? AND user_id=?").bind(new Date().toISOString(), memoryId, userId).run();
  else await env.DB.prepare("UPDATE coach_memories SET status='deleted',updated_at=? WHERE user_id=?").bind(new Date().toISOString(), userId).run();
  return coachMemorySnapshot(env, userId);
}

export async function saveCoachFeedback(env: WorkerEnv, userId: string, messageId: string, input: Record<string, unknown>) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const rating = Number(input.rating) === 1 ? 1 : -1; const now = new Date().toISOString();
  const owned = await env.DB.prepare("SELECT id FROM coach_messages WHERE id=? AND user_id=? AND role='assistant'").bind(messageId, userId).first();
  if (!owned) throw new Error("MESSAGE_NOT_FOUND");
  await env.DB.prepare(`INSERT INTO coach_feedback (id,user_id,message_id,rating,reason,created_at,updated_at) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(user_id,message_id) DO UPDATE SET rating=excluded.rating,reason=excluded.reason,updated_at=excluded.updated_at`)
    .bind(crypto.randomUUID(), userId, messageId, rating, String(input.reason || "").slice(0, 300) || null, now, now).run();
  return { messageId, rating, saved: true };
}

export async function updateConversationSummary(env: WorkerEnv, userId: string, conversationId: string) {
  // Summary requires a separately registered Hub task; never send it via an unrelated task/provider.
  if (env.MODEL_HUB_API_KEY) return;
  if (!env.DB) return;
  const count = await env.DB.prepare("SELECT COUNT(*) AS value FROM coach_messages WHERE conversation_id=? AND user_id=?")
    .bind(conversationId, userId).first<{ value: number }>();
  if (Number(count?.value || 0) < 12 || Number(count?.value || 0) % 6 !== 0) return;
  const [rows, conversation, user] = await Promise.all([
    env.DB.prepare(`SELECT id,role,content FROM coach_messages WHERE conversation_id=? AND user_id=?
      ORDER BY created_at DESC LIMIT 18`).bind(conversationId, userId).all<{ id: string; role: "user" | "assistant"; content: string }>(),
    env.DB.prepare("SELECT summary FROM coach_conversations WHERE id=? AND user_id=?").bind(conversationId, userId).first<{ summary: string | null }>(),
    env.DB.prepare("SELECT locale FROM users WHERE id=?").bind(userId).first<{ locale: string }>(),
  ]);
  const ordered = [...(rows.results || [])].reverse();
  let summary = ordered.map((item) => `${item.role === "user" ? "User" : "Coach"}: ${item.content.slice(0, 180)}`).join("\n").slice(0, 1600);
  let method = "deterministic_fallback"; let provider: string | null = null; let model: string | null = null;
  const started = Date.now();
  try {
    const generated = await generateConversationSummary(env, { locale: toLocale(user?.locale), previousSummary: conversation?.summary,
      messages: ordered, safetyIdentifier: userId }, await tierForUser(env, userId));
    summary = generated.summary; method = "ai_semantic"; provider = generated.provider; model = generated.model;
    await recordGenerationRun(env, { userId, status: "succeeded", model: generated.model, provider: generated.provider,
      latencyMs: Date.now() - started, requestId: generated.requestId, inputTokens: generated.usage.inputTokens,
      outputTokens: generated.usage.outputTokens, estimatedCostUsd: generated.estimatedCostUsd, task: "conversation_summary", locale: toLocale(user?.locale) });
  } catch { /* Conversation continuity must survive a provider outage. */ }
  const now = new Date().toISOString(); const through = ordered[ordered.length - 1]?.id || null;
  await env.DB.batch([
    env.DB.prepare("UPDATE coach_conversations SET summary=? WHERE id=? AND user_id=?").bind(summary, conversationId, userId),
    env.DB.prepare(`INSERT INTO coach_conversation_summaries
      (id,conversation_id,user_id,summary,through_message_id,method,provider,model,message_count,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), conversationId, userId, summary, through, method, provider, model, Number(count?.value || 0), now),
  ]);
}

export function workoutFromHome(home: Awaited<ReturnType<typeof coachHome>>): WorkoutDay | null { return home.today?.workout || null; }
