// Progress series for the charts on /progress. Seeing progress is the single
// strongest retention driver in training products, and every number here is
// computed from logged sets — nothing is modeled or smoothed into existence.
import type { WorkerEnv } from "../platform";
import { estimateE1rm } from "../../services/adaptive-engine/src";
import { EXERCISES } from "../../packages/coach-core/src";
import { isoWeekStart } from "../../services/habit-engine/src";

export type ProgressSeries = {
  weeks: Array<{ weekStart: string; tonnageKg: number; sets: number; sessions: number }>;
  exercises: Array<{ exerciseId: string; name: { zh: string; en: string }; points: Array<{ date: string; e1rm: number }>; changePct: number | null }>;
  weight: Array<{ date: string; weightKg: number }>;
  planVersions: Array<{ date: string; versionNumber: number }>;
};

export async function progressSeries(env: WorkerEnv, userId: string, days = 120): Promise<ProgressSeries> {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const [sets, sessions, measurements, versions] = await Promise.all([
    env.DB.prepare(`SELECT s.exercise_id, s.weight_kg, s.reps, o.scheduled_date AS date
      FROM workout_occurrence_sets s JOIN workout_occurrences o ON o.id=s.occurrence_id
      WHERE s.user_id=? AND s.completed=1 AND o.scheduled_date>=? ORDER BY o.scheduled_date`)
      .bind(userId, since).all<{ exercise_id: string; weight_kg: number | null; reps: number | null; date: string }>(),
    env.DB.prepare(`SELECT o.scheduled_date AS date FROM workout_occurrence_sessions s
      JOIN workout_occurrences o ON o.id=s.occurrence_id
      WHERE s.user_id=? AND s.status='completed' AND o.scheduled_date>=?`)
      .bind(userId, since).all<{ date: string }>(),
    env.DB.prepare("SELECT weight_kg, measured_at FROM measurements WHERE user_id=? AND measured_at>=? AND weight_kg IS NOT NULL ORDER BY measured_at")
      .bind(userId, since).all<{ weight_kg: number; measured_at: string }>(),
    env.DB.prepare(`SELECT version_number, created_at FROM plan_versions WHERE user_id=? AND created_at>=? ORDER BY created_at`)
      .bind(userId, `${since}T00:00:00.000Z`).all<{ version_number: number; created_at: string }>(),
  ]);

  // Weekly tonnage: completed load volume, the clearest "I did more work" signal.
  const weekBuckets = new Map<string, { tonnageKg: number; sets: number }>();
  for (const row of sets.results || []) {
    const week = isoWeekStart(row.date);
    const bucket = weekBuckets.get(week) || { tonnageKg: 0, sets: 0 };
    bucket.tonnageKg += Number(row.weight_kg || 0) * Number(row.reps || 0);
    bucket.sets += 1;
    weekBuckets.set(week, bucket);
  }
  const sessionWeeks = new Map<string, number>();
  for (const row of sessions.results || []) {
    const week = isoWeekStart(row.date);
    sessionWeeks.set(week, (sessionWeeks.get(week) || 0) + 1);
  }
  const weeks = [...new Set([...weekBuckets.keys(), ...sessionWeeks.keys()])].sort().map((weekStart) => ({
    weekStart,
    tonnageKg: Math.round(weekBuckets.get(weekStart)?.tonnageKg || 0),
    sets: weekBuckets.get(weekStart)?.sets || 0,
    sessions: sessionWeeks.get(weekStart) || 0,
  }));

  // Per-exercise estimated 1RM: best set of each training day.
  const byExercise = new Map<string, Map<string, number>>();
  for (const row of sets.results || []) {
    if (!row.weight_kg || !row.reps) continue;
    const estimate = estimateE1rm(row.weight_kg, row.reps);
    if (estimate <= 0) continue;
    if (!byExercise.has(row.exercise_id)) byExercise.set(row.exercise_id, new Map());
    const days = byExercise.get(row.exercise_id)!;
    days.set(row.date, Math.max(days.get(row.date) || 0, estimate));
  }
  const exercises = [...byExercise.entries()]
    .map(([exerciseId, days]) => {
      const points = [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, e1rm]) => ({ date, e1rm }));
      const first = points[0]?.e1rm || 0;
      const last = points[points.length - 1]?.e1rm || 0;
      return {
        exerciseId,
        name: EXERCISES[exerciseId]?.name || { zh: exerciseId, en: exerciseId },
        points,
        changePct: points.length >= 2 && first > 0 ? Number((((last - first) / first) * 100).toFixed(1)) : null,
      };
    })
    // Most-trained movements first; two points minimum or there is no trend to show.
    .filter((entry) => entry.points.length >= 2)
    .sort((a, b) => b.points.length - a.points.length)
    .slice(0, 6);

  return {
    weeks,
    exercises,
    weight: (measurements.results || []).map((row) => ({ date: row.measured_at.slice(0, 10), weightKg: row.weight_kg })),
    planVersions: (versions.results || []).map((row) => ({ date: row.created_at.slice(0, 10), versionNumber: row.version_number })),
  };
}
