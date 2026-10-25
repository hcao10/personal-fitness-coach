import { profileForUser, activeCycleForUser, type StoredUser } from "../db.ts";
import type { WorkerEnv } from "../platform.ts";
import { toLocale } from "../../packages/i18n/src/index.ts";
import { coachMemorySnapshot } from "../modules/coach-orchestrator.ts";
function parseJson<T>(value: string | null): T | null { try { return value ? JSON.parse(value) as T : null; } catch { return null; } }
export async function buildContext(env: WorkerEnv, user: StoredUser, conversationId: string, tier: "free" | "pro") {
  const now = new Date(); const since = new Date(now.getTime() - 28 * 86400_000).toISOString();
  const nutritionSince = new Date(now.getTime() - 14 * 86400_000).toISOString();
  const [profile, cycle, occurrenceWorkouts, legacyWorkouts, measurements, workoutSets, nutrition, reviews, health, memory, conversationSummary] = await Promise.all([
    profileForUser(env, user.id),
    activeCycleForUser(env, user.id),
    env.DB!.prepare(`SELECT o.day_index,s.status,s.duration_minutes,s.rpe,s.pain,s.notes,s.completed_at FROM workout_occurrence_sessions s
      JOIN workout_occurrences o ON o.id=s.occurrence_id WHERE s.user_id=? AND s.updated_at>=? ORDER BY s.updated_at DESC LIMIT 40`).bind(user.id, since).all(),
    env.DB!.prepare(`SELECT day_index,status,duration_minutes,rpe,pain,notes,completed_at FROM workout_sessions
      WHERE user_id=? AND updated_at>=? ORDER BY updated_at DESC LIMIT 40`).bind(user.id, since).all(),
    env.DB!.prepare(`SELECT weight_kg,body_fat_pct,waist_cm,arm_cm,measured_at FROM measurements
      WHERE user_id=? ORDER BY measured_at DESC LIMIT 12`).bind(user.id).all(),
    env.DB!.prepare(`SELECT exercise_id,set_index,set_type,weight_kg,reps,rir,rpe,completed,updated_at FROM workout_occurrence_sets
      WHERE user_id=? AND updated_at>=? ORDER BY updated_at DESC LIMIT 160`).bind(user.id, since).all(),
    env.DB!.prepare(`SELECT substr(eaten_at,1,10) AS day,SUM(calories) AS calories,SUM(protein_g) AS protein_g,SUM(carbs_g) AS carbs_g,SUM(fat_g) AS fat_g
      FROM meal_logs WHERE user_id=? AND status='confirmed' AND eaten_at>=? GROUP BY substr(eaten_at,1,10) ORDER BY day DESC`).bind(user.id, nutritionSince).all(),
    env.DB!.prepare(`SELECT week_start,status,metrics_json,recommendation_json FROM weekly_reviews WHERE user_id=? ORDER BY week_start DESC LIMIT 4`).bind(user.id).all(),
    env.DB!.prepare(`SELECT type,value,unit,observed_at,source_name FROM health_observations WHERE user_id=? AND observed_at>=?
      ORDER BY observed_at DESC LIMIT 20`).bind(user.id, since).all(),
    coachMemorySnapshot(env, user.id),
    env.DB!.prepare("SELECT summary FROM coach_conversations WHERE id=? AND user_id=?").bind(conversationId, user.id).first<{ summary: string | null }>(),
  ]);
  if (memory.preferences.coachingMode === "education") return { locale: toLocale(user.locale), timezone: user.timezone, coachingMode: "education", tone: memory.preferences.tone,
    profile: null, activePlan: null, recentWorkouts: [], recentWorkoutSets: [], recentMeasurements: [], nutrition14Days: [], recentReviews: [], healthSummaries: [], coachMemory: [], conversationSummary: null };
  const workouts = Number(occurrenceWorkouts.results?.length || 0) ? occurrenceWorkouts : legacyWorkouts;
  return { locale: toLocale(user.locale), timezone: user.timezone, profile, activePlan: cycle ?{ id: cycle.planId, versionId: cycle.versionId, startDate: cycle.startDate, phaseWeeks: cycle.phaseWeeks, plan: cycle.plan } : null,
    recentWorkouts: workouts.results || [], recentWorkoutSets: workoutSets.results || [], recentMeasurements: measurements.results || [],
    nutrition14Days: nutrition.results || [], recentReviews: (reviews.results || []).map((row) => ({ ...row,
      metrics_json: parseJson(String((row as Record<string, unknown>).metrics_json || "")), recommendation_json: parseJson(String((row as Record<string, unknown>).recommendation_json || "")) })),
    healthSummaries: health.results || [], coachMemory: tier === "pro" && memory.preferences.memoryEnabled ? memory.memories.slice(0, 20) : [], coachingMode: memory.preferences.coachingMode, tone: memory.preferences.tone,
    conversationSummary: conversationSummary?.summary || null };
}

