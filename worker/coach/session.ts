import { EXERCISES, alternativesFor, type Profile, type WorkoutDay } from '../../packages/coach-core/src/index.ts';
import type { CoachScene, SessionChangeInput } from '../../packages/api-contracts/src/coach-runtime.ts';
import type { WorkerEnv } from '../platform.ts';
import { ensureActiveOccurrences, localDateInTimezone } from '../db.ts';

export type TodaySession = {
  occurrenceId: string; planId: string; versionId: string; revision: number;
  date: string; profile: Profile; workout: WorkoutDay;
};

export async function loadTodaySession(env: WorkerEnv, userId: string, scene: CoachScene = {}): Promise<TodaySession | null> {
  const cycle = await ensureActiveOccurrences(env, userId);
  if (!cycle?.plan || !cycle.profile || !env.DB) return null;
  const date = localDateInTimezone(cycle.timezone);
  const row = await env.DB.prepare(`SELECT id,day_index,revision,workout_override_json FROM workout_occurrences
    WHERE user_id=? AND version_id=? AND scheduled_date=? AND status IN ('scheduled','rescheduled')
    ${scene.occurrenceId ? 'AND id=?' : ''} ORDER BY id LIMIT 1`)
    .bind(userId, cycle.versionId, date, ...(scene.occurrenceId ? [scene.occurrenceId] : []))
    .first<{ id: string; day_index: number; revision: number; workout_override_json: string | null }>();
  if (!row) {
    if (scene.occurrenceId) throw new Error('COACH_CONTEXT_STALE');
    return null;
  }
  if ((scene.planId && scene.planId !== cycle.planId) || (scene.baseVersionId && scene.baseVersionId !== cycle.versionId)
    || (scene.dayIndex !== undefined && scene.dayIndex !== row.day_index)) throw new Error('COACH_CONTEXT_STALE');
  const workout: WorkoutDay = row.workout_override_json ? JSON.parse(row.workout_override_json) : cycle.plan.schedule[row.day_index];
  if (!workout) throw new Error('COACH_CONTEXT_STALE');
  const session = { occurrenceId: row.id, planId: cycle.planId, versionId: cycle.versionId, revision: row.revision,
    date, profile: cycle.profile, workout };
  if (scene.exerciseInstanceId && !workout.exercises.some((_, index) => instanceId(session, index) === scene.exerciseInstanceId)) throw new Error('COACH_CONTEXT_STALE');
  if (scene.exerciseId && !workout.exercises.some(exercise => exercise.id === scene.exerciseId)) throw new Error('COACH_CONTEXT_STALE');
  return session;
}

export function instanceId(session: Pick<TodaySession, 'occurrenceId'>, index: number) {
  return `${session.occurrenceId}:${index}`;
}

/** Conservative scheduling estimate, not a claim about measured workout time. */
export function estimateMinutes(day: WorkoutDay): number {
  const seconds = day.exercises.reduce((sum, exercise) => sum + exercise.sets * 45
    + Math.max(0, exercise.sets - 1) * (exercise.restSeconds ?? 90) + 60, 5 * 60);
  return Math.ceil(seconds / 60);
}

export function previewChange(session: TodaySession, change: SessionChangeInput, locale: string, highRisk: boolean) {
  if (session.workout.restDay || !session.workout.exercises.length) throw new Error('REST_DAY_NO_CHANGE');
  const before = structuredClone(session.workout); const after = structuredClone(before);
  // Once a concrete session is adjusted, variants must not reapply old exercise IDs.
  delete after.variants;
  if (change.type === 'shorten_session') {
    if (!Number.isInteger(change.availableMinutes) || change.availableMinutes < 10 || change.availableMinutes > 90) throw new Error('INVALID_SESSION_DURATION');
    // Preserve movement order, trim accessory work, then reduce sets. Never shorten rest to invent a fit.
    while (estimateMinutes(after) > change.availableMinutes && after.exercises.length > 2) after.exercises.pop();
    while (estimateMinutes(after) > change.availableMinutes && after.exercises.some(exercise => exercise.sets > 1)) {
      const exercise = [...after.exercises].reverse().find(item => item.sets > 1)!; exercise.sets -= 1;
    }
    if (estimateMinutes(after) > change.availableMinutes) throw new Error('SESSION_DURATION_UNACHIEVABLE');
  } else {
    const index = before.exercises.findIndex((_, index) => instanceId(session, index) === change.exerciseInstanceId);
    if (index < 0) throw new Error('EXERCISE_NOT_IN_SESSION');
    const exercise = after.exercises[index];
    if (change.type === 'replace_exercise') {
      const allowed = alternativesFor(exercise.id, session.profile.equipment).map(item => item.id);
      if (!allowed.includes(change.replacementExerciseId) || change.replacementExerciseId === exercise.id) throw new Error('INVALID_EXERCISE_REPLACEMENT');
      const replacement = EXERCISES[change.replacementExerciseId];
      after.exercises[index] = { ...exercise, ...replacement };
    } else {
      if (!Number.isFinite(change.loadMultiplier) || change.loadMultiplier < .8 || change.loadMultiplier > (highRisk ? 1 : 1.05)) throw new Error('INVALID_LOAD_ADJUSTMENT');
      const cumulative = (exercise.suggestedLoadMultiplier ?? 1) * change.loadMultiplier;
      if (cumulative < .8 || cumulative > (highRisk ? 1 : 1.05)) throw new Error('INVALID_LOAD_ADJUSTMENT');
      exercise.suggestedLoadMultiplier = cumulative;
    }
  }
  after.duration = estimateMinutes(after);
  if (JSON.stringify(before.exercises) === JSON.stringify(after.exercises)) throw new Error('SESSION_CHANGE_NO_EFFECT');
  const zh = locale === 'zh';
  const describe = (day: WorkoutDay) => `${day.exercises.map(exercise => `${exercise.name[zh ? 'zh' : 'en']} ${exercise.sets} × ${exercise.reps}${exercise.suggestedLoadMultiplier ? ` · ${Math.round(exercise.suggestedLoadMultiplier * 100)}%` : ''}`).join(' / ')} · ${estimateMinutes(day)} ${zh ? '分钟（估算）' : 'min (estimated)'}`;
  return {
    scope: 'occurrence' as const, occurrenceId: session.occurrenceId, planId: session.planId,
    versionId: session.versionId, baseRevision: session.revision, scheduledDate: session.date, change,
    beforeWorkout: before, afterWorkout: after,
    title: zh ? '调整今天的训练' : "Adjust today's training",
    description: zh ? '只修改今天这一次训练，确认后生效。' : 'Changes this dated session only, after confirmation.',
    before: describe(before), after: describe(after),
    reason: zh ? '根据当前训练、可用时间或选中动作生成；时长为估算。' : 'Computed from the current session and your requested constraints; duration is estimated.',
    impact: [zh ? '不修改周计划和其他训练日。' : 'The weekly plan and other dates stay unchanged.'], reversible: false,
  };
}

export type SessionPreview = ReturnType<typeof previewChange>;
