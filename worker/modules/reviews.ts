import { calculateWeeklyReview, recommendReview } from "../../packages/domain/src";
import type { CoachPlan, Profile } from "../../packages/coach-core/src";
import type { WorkerEnv } from "../platform";
import type { StoredUser } from "../db";
import { activatePlan, activePlanForUser, savePlan } from "../db";
import { consumeCapability, refundCapability } from "../product";
import { generateCoachChat } from "../llm";

function mondayOf(date = new Date()) {
  const value = new Date(date); const offset = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - offset); value.setUTCHours(0, 0, 0, 0);
  return value;
}
function parseJson<T>(value: string | null): T | null { try { return value ? JSON.parse(value) as T : null; } catch { return null; } }

export async function ensureCurrentReview(env: WorkerEnv, userId: string) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const weekStart = mondayOf().toISOString().slice(0, 10); const now = new Date().toISOString();
  await env.DB.prepare(`INSERT OR IGNORE INTO weekly_reviews (id,user_id,week_start,status,created_at,updated_at)
    VALUES (?,?,?,'due',?,?)`).bind(crypto.randomUUID(), userId, weekStart, now, now).run();
  return env.DB.prepare(`SELECT id,week_start,status,checkin_json,metrics_json,recommendation_json,plateau,created_at,updated_at
    FROM weekly_reviews WHERE user_id=? AND week_start=?`).bind(userId, weekStart).first();
}

export async function listReviews(env: WorkerEnv, userId: string) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  await ensureCurrentReview(env, userId);
  const rows = await env.DB.prepare(`SELECT id,week_start,status,checkin_json,metrics_json,recommendation_json,plateau,created_at,updated_at
    FROM weekly_reviews WHERE user_id=? ORDER BY week_start DESC LIMIT 24`).bind(userId).all<{
      id: string; week_start: string; status: string; checkin_json: string | null; metrics_json: string | null;
      recommendation_json: string | null; plateau: number; created_at: string; updated_at: string;
    }>();
  return (rows.results || []).map((row) => ({ id: row.id, weekStart: row.week_start, status: row.status,
    checkin: parseJson(row.checkin_json), metrics: parseJson(row.metrics_json), recommendation: parseJson(row.recommendation_json),
    plateau: Boolean(row.plateau), createdAt: row.created_at, updatedAt: row.updated_at }));
}

export async function reviewDetail(env: WorkerEnv, userId: string, id: string) {
  return (await listReviews(env, userId)).find((review) => review.id === id) || null;
}

export async function saveReviewCheckin(env: WorkerEnv, userId: string, id: string, checkin: Record<string, unknown>) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const recovery = Number(checkin.recovery); const sleep = Number(checkin.sleep); const pain = Number(checkin.pain || 0);
  if (![recovery, sleep, pain].every(Number.isFinite) || recovery < 1 || recovery > 5 || sleep < 1 || sleep > 5 || pain < 0 || pain > 10) throw new Error("INVALID_CHECKIN");
  const result = await env.DB.prepare(`UPDATE weekly_reviews SET checkin_json=?,status='ready',updated_at=? WHERE id=? AND user_id=?`)
    .bind(JSON.stringify({ recovery, sleep, pain, note: String(checkin.note || "").slice(0, 500) }), new Date().toISOString(), id, userId).run();
  if (!result.success) throw new Error("REVIEW_NOT_FOUND");
  return reviewDetail(env, userId, id);
}

export async function generateReview(env: WorkerEnv, user: StoredUser, id: string) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const review = await env.DB.prepare("SELECT id,week_start,checkin_json FROM weekly_reviews WHERE id=? AND user_id=?")
    .bind(id, user.id).first<{ id: string; week_start: string; checkin_json: string | null }>();
  if (!review) throw new Error("REVIEW_NOT_FOUND");
  const quota = await consumeCapability(env, user.id, "adaptive.review");
  if (!quota.ok) throw new Error("REVIEW_LIMIT_REACHED");
  const start = new Date(`${review.week_start}T00:00:00.000Z`); const end = new Date(start.getTime() + 7 * 86400_000);
  const active = await activePlanForUser(env, user.id);
  if (!active?.profile || !active.plan) { await refundCapability(env, user.id, "adaptive.review"); throw new Error("ACTIVE_PLAN_REQUIRED"); }
  const historyStart = new Date(start.getTime() - 21 * 86400_000);
  const [sessions, measurements, previous, sets, previousSets, nutrition] = await Promise.all([
    env.DB.prepare(`SELECT rpe,pain,completed_at FROM workout_sessions WHERE user_id=? AND status='completed'
      AND completed_at>=? AND completed_at<?`).bind(user.id, start.toISOString(), end.toISOString()).all<{ rpe: number | null; pain: number; completed_at: string }>(),
    env.DB.prepare(`SELECT weight_kg,measured_at FROM measurements WHERE user_id=? AND measured_at>=?
      ORDER BY measured_at`).bind(user.id, new Date(start.getTime() - 21 * 86400_000).toISOString()).all<{ weight_kg: number | null; measured_at: string }>(),
    env.DB.prepare(`SELECT metrics_json FROM weekly_reviews WHERE user_id=? AND week_start<? AND status IN ('generated','accepted','rejected')
      ORDER BY week_start DESC LIMIT 3`).bind(user.id, review.week_start).all<{ metrics_json: string }>(),
    env.DB.prepare(`SELECT weight_kg,reps,rir,completed,updated_at FROM workout_sets WHERE user_id=? AND updated_at>=? AND updated_at<?`)
      .bind(user.id, start.toISOString(), end.toISOString()).all<{ weight_kg: number | null; reps: number | null; rir: number | null; completed: number; updated_at: string }>(),
    env.DB.prepare(`SELECT weight_kg,reps,completed,updated_at FROM workout_sets WHERE user_id=? AND updated_at>=? AND updated_at<?`)
      .bind(user.id, historyStart.toISOString(), start.toISOString()).all<{ weight_kg: number | null; reps: number | null; completed: number; updated_at: string }>(),
    env.DB.prepare(`SELECT substr(eaten_at,1,10) AS day,SUM(calories) AS calories,SUM(protein_g) AS protein_g FROM meal_logs
      WHERE user_id=? AND status='confirmed' AND eaten_at>=? AND eaten_at<? GROUP BY substr(eaten_at,1,10)`)
      .bind(user.id, start.toISOString(), end.toISOString()).all<{ day: string; calories: number; protein_g: number }>(),
  ]);
  const consecutive = (previous.results || []).filter((row) => parseJson<{ eligible?: boolean }>(row.metrics_json)?.eligible).length + 1;
  const previousWeeklyVolumes = [0, 0, 0];
  for (const row of previousSets.results || []) {
    const bucket = Math.min(2, Math.max(0, Math.floor((new Date(row.updated_at).getTime() - historyStart.getTime()) / (7 * 86400_000))));
    if (row.completed) previousWeeklyVolumes[bucket] += Number(row.weight_kg || 0) * Number(row.reps || 0);
  }
  const metrics = calculateWeeklyReview({ plannedSessions: active.profile.days,
    sessions: (sessions.results || []).map((row) => ({ rpe: row.rpe, pain: row.pain, completedAt: row.completed_at })),
    measurements: (measurements.results || []).map((row) => ({ weightKg: row.weight_kg, measuredAt: row.measured_at })), consecutiveEligibleWeeks: consecutive,
    sets: (sets.results || []).map((row) => ({ weightKg: row.weight_kg, reps: row.reps, rir: row.rir, completed: Boolean(row.completed) })),
    previousWeeklyVolumes, nutritionDays: (nutrition.results || []).map((row) => ({ calories: Number(row.calories || 0), proteinG: Number(row.protein_g || 0) })),
    calorieTarget: active.plan.calories, proteinTarget: active.plan.protein }, active.profile.goal);
  const recommendation = recommendReview(metrics);
  let explanation = recommendation.explanation;
  try {
    const ai = await generateCoachChat(env, { message: "请用简洁自然的语言解释这份周度复盘，只解释依据和下一步，不新增事实。",
      locale: user.locale === "en" ? "en" : "zh", context: { metrics, recommendation, checkin: parseJson(review.checkin_json), profile: active.profile }, history: [], safetyIdentifier: user.id }, "pro");
    explanation = ai.reply;
  } catch { /* deterministic recommendation remains authoritative */ }
  const stored = { ...recommendation, explanation };
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE weekly_reviews SET metrics_json=?,recommendation_json=?,plateau=?,status='generated',updated_at=?
    WHERE id=? AND user_id=?`).bind(JSON.stringify(metrics), JSON.stringify(stored), metrics.plateau ? 1 : 0, now, id, user.id).run();
  return { id, metrics, recommendation: stored, status: "generated", quota };
}

function adjustedPlan(plan: CoachPlan, multiplier: number, loadMultiplier: number): CoachPlan {
  return { ...plan, schedule: plan.schedule.map((day) => ({ ...day, exercises: day.exercises.map((exercise) => ({
    ...exercise, sets: Math.max(2, Math.min(5, Math.round(exercise.sets * Math.max(.9, Math.min(1.1, multiplier))))),
    suggestedLoadMultiplier: Math.max(.95, Math.min(1.05, loadMultiplier)),
  })) })) };
}

export async function decideReview(env: WorkerEnv, userId: string, id: string, decision: "accepted" | "rejected") {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const row = await env.DB.prepare(`SELECT status,recommendation_json FROM weekly_reviews WHERE id=? AND user_id=?`)
    .bind(id, userId).first<{ status: string; recommendation_json: string | null }>();
  if (!row) throw new Error("REVIEW_NOT_FOUND");
  if (row.status === "accepted" || row.status === "rejected") return { id, status: row.status, duplicate: true };
  let planId: string | null = null;
  if (decision === "accepted") {
    const recommendation = parseJson<{ volumeMultiplier?: number; loadMultiplier?: number }>(row.recommendation_json);
    const active = await activePlanForUser(env, userId);
    if (active?.plan && active.profile) {
      planId = await savePlan(env, userId, active.profile as Profile, adjustedPlan(active.plan as CoachPlan, Number(recommendation?.volumeMultiplier || 1), Number(recommendation?.loadMultiplier || 1)), "adaptive_review", "rules+coach");
      await activatePlan(env, userId, planId, `weekly_review:${id}`);
    }
  }
  await env.DB.prepare("UPDATE weekly_reviews SET status=?,updated_at=? WHERE id=? AND user_id=?")
    .bind(decision, new Date().toISOString(), id, userId).run();
  return { id, status: decision, planId, duplicate: false };
}
