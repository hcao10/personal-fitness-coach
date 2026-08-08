import { calculateWeeklyReview, recommendReview } from "../../packages/domain/src";
import { alternativesFor, exercisePattern, type CoachPlan, type Profile } from "../../packages/coach-core/src";
import { runEngine, type EngineSet, type ExerciseMeta } from "../../services/adaptive-engine/src";
import type { WorkerEnv } from "../platform";
import type { StoredUser } from "../db";
import { activatePlan, activeCycleForUser, activePlanForUser, addLocalDays, localDateInTimezone, savePlan } from "../db";
import { consumeCapability, refundCapability, tierInfoForUser } from "../product";
import { generateCoachChat } from "../llm";

function mondayOf(date = new Date()) {
  const value = new Date(date); const offset = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - offset); value.setUTCHours(0, 0, 0, 0);
  return value;
}
function parseJson<T>(value: string | null): T | null { try { return value ? JSON.parse(value) as T : null; } catch { return null; } }
function dateDifference(start: string, end: string) { return Math.floor((new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86_400_000); }

export async function ensureCurrentReview(env: WorkerEnv, userId: string) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const cycle = await activeCycleForUser(env, userId);
  const localToday = cycle ? localDateInTimezone(cycle.timezone) : new Date().toISOString().slice(0, 10);
  const elapsed = cycle ? Math.max(0, dateDifference(cycle.startDate, localToday)) : 0;
  const weekStart = cycle ? addLocalDays(cycle.startDate, Math.floor(elapsed / 7) * 7) : mondayOf().toISOString().slice(0, 10);
  const now = new Date().toISOString();
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
  // Free users get a real (not fabricated) preview: the engine runs on their
  // data, but adjustment details are locked and nothing is consumed. Pro and
  // trial users get the full review against their adaptive.review quota.
  const tierInfo = await tierInfoForUser(env, user.id);
  const fullAccess = tierInfo.tier === "pro";
  const quota = fullAccess ? await consumeCapability(env, user.id, "adaptive.review") : { ok: true, tier: "free" as const, limit: 0, used: 0, remaining: 0 };
  if (!quota.ok) throw new Error("REVIEW_LIMIT_REACHED");
  const start = new Date(`${review.week_start}T00:00:00.000Z`); const end = new Date(start.getTime() + 7 * 86400_000); const endDate = end.toISOString().slice(0, 10);
  const active = await activePlanForUser(env, user.id);
  if (!active?.profile || !active.plan) { if (fullAccess) await refundCapability(env, user.id, "adaptive.review"); throw new Error("ACTIVE_PLAN_REQUIRED"); }
  const historyStart = new Date(start.getTime() - 21 * 86400_000);
  const [occurrenceSessions, legacySessions, measurements, previous, sets, previousSets, nutrition, planned] = await Promise.all([
    env.DB.prepare(`SELECT s.rpe,s.pain,s.completed_at FROM workout_occurrence_sessions s JOIN workout_occurrences o ON o.id=s.occurrence_id
      WHERE s.user_id=? AND s.status='completed' AND o.scheduled_date>=? AND o.scheduled_date<?`).bind(user.id, review.week_start, endDate).all<{ rpe: number | null; pain: number; completed_at: string }>(),
    env.DB.prepare(`SELECT rpe,pain,completed_at FROM workout_sessions WHERE user_id=? AND status='completed'
      AND completed_at>=? AND completed_at<?`).bind(user.id, start.toISOString(), end.toISOString()).all<{ rpe: number | null; pain: number; completed_at: string }>(),
    env.DB.prepare(`SELECT weight_kg,measured_at FROM measurements WHERE user_id=? AND measured_at>=?
      ORDER BY measured_at`).bind(user.id, new Date(start.getTime() - 21 * 86400_000).toISOString()).all<{ weight_kg: number | null; measured_at: string }>(),
    env.DB.prepare(`SELECT metrics_json FROM weekly_reviews WHERE user_id=? AND week_start<? AND status IN ('generated','accepted','rejected')
      ORDER BY week_start DESC LIMIT 3`).bind(user.id, review.week_start).all<{ metrics_json: string }>(),
    env.DB.prepare(`SELECT s.weight_kg,s.reps,s.rir,s.completed,s.updated_at FROM workout_occurrence_sets s JOIN workout_occurrences o ON o.id=s.occurrence_id
      WHERE s.user_id=? AND o.scheduled_date>=? AND o.scheduled_date<?`).bind(user.id, review.week_start, endDate).all<{ weight_kg: number | null; reps: number | null; rir: number | null; completed: number; updated_at: string }>(),
    env.DB.prepare(`SELECT s.weight_kg,s.reps,s.completed,s.updated_at FROM workout_occurrence_sets s JOIN workout_occurrences o ON o.id=s.occurrence_id
      WHERE s.user_id=? AND o.scheduled_date>=? AND o.scheduled_date<?`).bind(user.id, historyStart.toISOString().slice(0, 10), review.week_start).all<{ weight_kg: number | null; reps: number | null; completed: number; updated_at: string }>(),
    env.DB.prepare(`SELECT substr(eaten_at,1,10) AS day,SUM(calories) AS calories,SUM(protein_g) AS protein_g FROM meal_logs
      WHERE user_id=? AND status='confirmed' AND eaten_at>=? AND eaten_at<? GROUP BY substr(eaten_at,1,10)`)
      .bind(user.id, start.toISOString(), end.toISOString()).all<{ day: string; calories: number; protein_g: number }>(),
    env.DB.prepare(`SELECT COUNT(*) AS value FROM workout_occurrences o JOIN plans p ON p.id=o.plan_id
      WHERE o.user_id=? AND o.scheduled_date>=? AND o.scheduled_date<? AND o.status<>'superseded'
      AND COALESCE(json_extract(p.plan_json,'$.schedule[' || o.day_index || '].restDay'),0)=0`)
      .bind(user.id, review.week_start, endDate).first<{ value: number }>(),
  ]);
  const sessions = Number(occurrenceSessions.results?.length || 0) ? occurrenceSessions : legacySessions;
  const consecutive = (previous.results || []).filter((row) => parseJson<{ eligible?: boolean }>(row.metrics_json)?.eligible).length + 1;
  const previousWeeklyVolumes = [0, 0, 0];
  for (const row of previousSets.results || []) {
    const bucket = Math.min(2, Math.max(0, Math.floor((new Date(row.updated_at).getTime() - historyStart.getTime()) / (7 * 86400_000))));
    if (row.completed) previousWeeklyVolumes[bucket] += Number(row.weight_kg || 0) * Number(row.reps || 0);
  }
  const metrics = calculateWeeklyReview({ plannedSessions: Math.max(1, Number(planned?.value || active.profile.days)),
    sessions: (sessions.results || []).map((row) => ({ rpe: row.rpe, pain: row.pain, completedAt: row.completed_at })),
    measurements: (measurements.results || []).map((row) => ({ weightKg: row.weight_kg, measuredAt: row.measured_at })), consecutiveEligibleWeeks: consecutive,
    sets: (sets.results || []).map((row) => ({ weightKg: row.weight_kg, reps: row.reps, rir: row.rir, completed: Boolean(row.completed) })),
    previousWeeklyVolumes, nutritionDays: (nutrition.results || []).map((row) => ({ calories: Number(row.calories || 0), proteinG: Number(row.protein_g || 0) })),
    calorieTarget: active.plan.calories, proteinTarget: active.plan.protein }, active.profile.goal);
  const recommendation = recommendReview(metrics);
  // Adaptive engine: per-exercise double progression, fatigue and stagnation
  // analysis over the last 28 days. Deterministic; the LLM below only narrates.
  const engineWindowStart = addLocalDays(localDateInTimezone(user.timezone || "UTC"), -28);
  const engineRows = await env.DB.prepare(`SELECT s.exercise_id,s.weight_kg,s.reps,s.rir,s.completed,o.scheduled_date
    FROM workout_occurrence_sets s JOIN workout_occurrences o ON o.id=s.occurrence_id
    WHERE s.user_id=? AND o.scheduled_date>=?`).bind(user.id, engineWindowStart)
    .all<{ exercise_id: string; weight_kg: number | null; reps: number | null; rir: number | null; completed: number; scheduled_date: string }>();
  const engineSets: EngineSet[] = (engineRows.results || []).map((row) => ({
    exerciseId: row.exercise_id, date: row.scheduled_date, weightKg: row.weight_kg, reps: row.reps, rir: row.rir, completed: Boolean(row.completed),
  }));
  const compoundPatterns = new Set(["push_h", "push_v", "pull_h", "pull_v", "squat", "hinge", "lunge"]);
  const metaById = new Map<string, ExerciseMeta>();
  for (const day of active.plan.schedule) {
    for (const exercise of day.exercises || []) {
      if (metaById.has(exercise.id)) continue;
      const pattern = exercisePattern(exercise.id);
      metaById.set(exercise.id, {
        exerciseId: exercise.id, targetReps: exercise.reps,
        compound: pattern ? compoundPatterns.has(pattern) : false,
        alternatives: alternativesFor(exercise.id, active.profile.equipment).map((alternative) => alternative.id),
      });
    }
  }
  const engine = runEngine({
    today: localDateInTimezone(user.timezone || "UTC"),
    experience: active.profile.experience,
    sessions: (sessions.results || []).map((row) => ({ date: String(row.completed_at || "").slice(0, 10), rpe: row.rpe, pain: row.pain })),
    sets: engineSets,
    exercises: Array.from(metaById.values()),
  });
  let stored: Record<string, unknown>;
  if (fullAccess) {
    let explanation = recommendation.explanation;
    try {
      const ai = await generateCoachChat(env, { message: "请用简洁自然的语言解释这份周度复盘，只解释依据和下一步，不新增事实。",
        locale: user.locale === "en" ? "en" : "zh", context: { metrics, recommendation, engine, checkin: parseJson(review.checkin_json), profile: active.profile }, history: [], safetyIdentifier: user.id }, tierInfo.tier);
      explanation = ai.reply;
    } catch { /* deterministic recommendation remains authoritative */ }
    stored = { ...recommendation, explanation, engine };
  } else {
    // Locked preview: real facts, no actionable details. Safety information is
    // never paywalled — a recommended deload is always shown in full.
    const teaser = engine.adjustments[0]?.reason || null;
    stored = {
      kind: recommendation.kind, title: recommendation.title, explanation: recommendation.explanation,
      changes: [], volumeMultiplier: 1, loadMultiplier: 1, locked: true,
      engine: {
        deloadRecommended: engine.deloadRecommended,
        deloadReason: engine.deloadReason || null,
        fatigueRatio: engine.fatigueRatio,
        adjustmentCount: engine.adjustments.length,
        stagnationCount: engine.stagnation.length,
        teaser: teaser ? { zh: `${teaser.zh.slice(0, 18)}……（升级解锁完整调整方案）`, en: `${teaser.en.slice(0, 40)}… (upgrade to unlock the full adjustments)` } : null,
      },
    };
  }
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
    const recommendation = parseJson<{ volumeMultiplier?: number; loadMultiplier?: number; locked?: boolean }>(row.recommendation_json);
    // Locked previews carry no adjustment details — accepting them is the Pro
    // value moment, and requires the full review to have been generated.
    if (recommendation?.locked || (await tierInfoForUser(env, userId)).tier !== "pro") throw new Error("REVIEW_UPGRADE_REQUIRED");
    const [active, cycle] = await Promise.all([activePlanForUser(env, userId), activeCycleForUser(env, userId)]);
    if (active?.plan && active.profile) {
      const effectiveDate = cycle ? addLocalDays(cycle.startDate, Math.max(7, (Math.floor(Math.max(0, dateDifference(cycle.startDate, localDateInTimezone(cycle.timezone))) / 7) + 1) * 7)) : undefined;
      planId = await savePlan(env, userId, active.profile as Profile, adjustedPlan(active.plan as CoachPlan, Number(recommendation?.volumeMultiplier || 1), Number(recommendation?.loadMultiplier || 1)), "adaptive_review", "rules+coach", { changeSummary: ["根据周度完成率与恢复状态调整训练量", "单周组数变化保持在 10% 安全边界内"] });
      await activatePlan(env, userId, planId, `weekly_review:${id}`, { startDate: effectiveDate, timezone: cycle?.timezone, preserveCycleStart: true });
    }
  }
  await env.DB.prepare("UPDATE weekly_reviews SET status=?,updated_at=? WHERE id=? AND user_id=?")
    .bind(decision, new Date().toISOString(), id, userId).run();
  return { id, status: decision, planId, duplicate: false };
}
