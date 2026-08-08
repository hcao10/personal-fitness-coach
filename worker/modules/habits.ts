import type { WorkerEnv } from "../platform";
import { localDateInTimezone } from "../db";
import { computeStreak, detectMilestones, summarizeWeeks, type Milestone, type StreakState } from "../../services/habit-engine/src";

export type HabitSummary = {
  streak: StreakState;
  totalSessions: number;
  commitment: { cueTime: string; cuePlace: string | null } | null;
  milestones: Array<Milestone & { achievedAt: string; isNew: boolean }>;
};

async function completedSessionDates(env: WorkerEnv, userId: string): Promise<string[]> {
  const [occurrence, legacy] = await Promise.all([
    env.DB!.prepare(`SELECT o.scheduled_date AS date FROM workout_occurrence_sessions s
      JOIN workout_occurrences o ON o.id=s.occurrence_id WHERE s.user_id=? AND s.status='completed'`).bind(userId)
      .all<{ date: string }>(),
    env.DB!.prepare("SELECT substr(completed_at,1,10) AS date FROM workout_sessions WHERE user_id=? AND status='completed'").bind(userId)
      .all<{ date: string }>(),
  ]);
  // Occurrence records are canonical; legacy rows only fill gaps on dates the
  // occurrence table does not cover, so migrated users are not double-counted.
  const dates = new Set((occurrence.results || []).map((row) => row.date));
  const merged = [...dates];
  for (const row of legacy.results || []) if (row.date && !dates.has(row.date)) merged.push(row.date);
  return merged;
}

export async function habitSummary(env: WorkerEnv, userId: string, timezone: string | null): Promise<HabitSummary> {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const today = localDateInTimezone(timezone || "UTC");
  const dates = await completedSessionDates(env, userId);
  const streak = computeStreak(summarizeWeeks(dates, today));
  const totalSessions = dates.length;
  const earned = detectMilestones(streak, totalSessions);
  const existing = await env.DB.prepare("SELECT kind,achieved_at FROM milestones WHERE user_id=?").bind(userId)
    .all<{ kind: string; achieved_at: string }>();
  const known = new Map((existing.results || []).map((row) => [row.kind, row.achieved_at]));
  const now = new Date().toISOString();
  const milestones: HabitSummary["milestones"] = [];
  for (const milestone of earned) {
    const achievedAt = known.get(milestone.kind);
    if (!achievedAt) {
      await env.DB.prepare("INSERT OR IGNORE INTO milestones (id,user_id,kind,achieved_at) VALUES (?,?,?,?)")
        .bind(crypto.randomUUID(), userId, milestone.kind, now).run();
    }
    milestones.push({ ...milestone, achievedAt: achievedAt || now, isNew: !achievedAt });
  }
  const commitment = await env.DB.prepare("SELECT cue_time,cue_place FROM habit_commitments WHERE user_id=?").bind(userId)
    .first<{ cue_time: string; cue_place: string | null }>();
  return {
    streak, totalSessions,
    commitment: commitment ? { cueTime: commitment.cue_time, cuePlace: commitment.cue_place } : null,
    milestones,
  };
}

export async function upsertHabitCommitment(env: WorkerEnv, userId: string, input: Record<string, unknown>) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const cueTime = String(input.cueTime || "");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(cueTime)) throw new Error("INVALID_HABIT_COMMITMENT");
  const cuePlace = String(input.cuePlace || "").trim().slice(0, 60) || null;
  await env.DB.prepare(`INSERT INTO habit_commitments (user_id,cue_time,cue_place,updated_at) VALUES (?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET cue_time=excluded.cue_time,cue_place=excluded.cue_place,updated_at=excluded.updated_at`)
    .bind(userId, cueTime, cuePlace, new Date().toISOString()).run();
  return { cueTime, cuePlace };
}
