// Cmine Fit adaptive coaching engine v1 (proprietary — not part of the
// open-source packages).
//
// Pure decision functions: data in, structured adjustments out. No imports, no
// clock, no I/O — the caller supplies `today`, history windows and substitute
// candidates, which keeps every rule deterministic and unit-testable, and lets
// the LLM layer stay what it should be: a translator of decisions, never the
// decision maker.
//
// v1 rule set:
//  1. Double progression with RIR autoregulation (per exercise).
//  2. Fatigue index: acute 7-day load vs chronic 28-day weekly average
//     (ACWR-style) plus pain signals → deload recommendation.
//  3. e1RM trend stagnation detection (Epley estimate over rolling windows).
//  4. Pain-driven same-pattern exercise substitution (candidates supplied by
//     the caller from coach-core's alternativesFor).

export type EngineSet = {
  exerciseId: string;
  date: string; // YYYY-MM-DD local date the set was performed
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  completed: boolean;
};

export type EngineSession = {
  date: string;
  rpe: number | null;
  pain: number; // 0-10 session-level pain report
};

export type ExerciseMeta = {
  exerciseId: string;
  targetReps: string; // e.g. "8-12", "10", "8/side"
  compound: boolean; // compounds progress in larger steps than isolation work
  alternatives: string[]; // same-pattern, equipment-legal substitute ids
};

export type EngineInput = {
  today: string;
  experience: "beginner" | "intermediate" | "advanced";
  sessions: EngineSession[]; // completed sessions in the last 28 days
  sets: EngineSet[]; // completed sets in the last 28 days
  exercises: ExerciseMeta[]; // exercises in the active plan
  painfulExerciseIds?: string[];
};

export type EngineAdjustment = {
  kind: "increase_load" | "add_reps" | "reduce_load" | "swap_exercise" | "hold";
  exerciseId: string;
  magnitudePct?: number;
  replacementCandidates?: string[];
  reason: { zh: string; en: string };
  confidence: "high" | "medium" | "low";
};

export type StagnationEntry = { exerciseId: string; e1rmChangePct: number; sessionsAnalyzed: number };

export type EngineReport = {
  fatigueRatio: number | null;
  deloadRecommended: boolean;
  deloadReason?: { zh: string; en: string };
  adjustments: EngineAdjustment[];
  stagnation: StagnationEntry[];
};

// Epley estimate, clamped to the rep range where the formula is meaningful.
export function estimateE1rm(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  const clampedReps = Math.min(12, reps);
  return Number((weightKg * (1 + clampedReps / 30)).toFixed(2));
}

export function parseRepRange(targetReps: string): { min: number; max: number } {
  const numbers = String(targetReps).match(/\d+/g)?.map(Number) || [];
  if (numbers.length >= 2) return { min: numbers[0], max: numbers[1] };
  if (numbers.length === 1) return { min: Math.max(1, numbers[0] - 2), max: numbers[0] };
  return { min: 8, max: 12 };
}

const dayMs = 86_400_000;
const daysBetween = (from: string, to: string) => Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / dayMs);

// Per-set load: tonnage for loaded work; bodyweight sets still contribute
// their reps so a bodyweight-only week does not read as "no training".
const setLoad = (set: EngineSet) => (set.completed && set.reps ? ((set.weightKg ?? 0) * set.reps + set.reps) : 0);

export function fatigueRatio(sets: EngineSet[], today: string): number | null {
  let acute = 0;
  let chronic = 0;
  for (const set of sets) {
    const age = daysBetween(set.date, today);
    if (age < 0 || age >= 28) continue;
    const load = setLoad(set);
    chronic += load;
    if (age < 7) acute += load;
  }
  if (chronic <= 0) return null;
  const chronicWeekly = chronic / 4;
  if (chronicWeekly <= 0) return null;
  return Number((acute / chronicWeekly).toFixed(2));
}

type ExerciseDay = { date: string; sets: EngineSet[]; topWeight: number | null; minReps: number; maxReps: number; minRir: number | null; bestE1rm: number };

function exerciseDays(sets: EngineSet[], exerciseId: string): ExerciseDay[] {
  const byDate = new Map<string, EngineSet[]>();
  for (const set of sets) {
    if (set.exerciseId !== exerciseId || !set.completed || !set.reps) continue;
    if (!byDate.has(set.date)) byDate.set(set.date, []);
    byDate.get(set.date)!.push(set);
  }
  return Array.from(byDate.entries()).map(([date, daySets]) => {
    const weights = daySets.map((set) => set.weightKg).filter((value): value is number => typeof value === "number" && value > 0);
    const reps = daySets.map((set) => set.reps!) ;
    const rirs = daySets.map((set) => set.rir).filter((value): value is number => typeof value === "number");
    const bestE1rm = Math.max(0, ...daySets.map((set) => set.weightKg && set.reps ? estimateE1rm(set.weightKg, set.reps) : 0));
    return {
      date, sets: daySets,
      topWeight: weights.length ? Math.max(...weights) : null,
      minReps: Math.min(...reps), maxReps: Math.max(...reps),
      minRir: rirs.length ? Math.min(...rirs) : null,
      bestE1rm,
    };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

export function detectStagnation(sets: EngineSet[], exerciseId: string, today: string): StagnationEntry | null {
  const days = exerciseDays(sets, exerciseId).filter((day) => day.bestE1rm > 0);
  if (days.length < 4) return null;
  const span = daysBetween(days[0].date, days[days.length - 1].date);
  if (span < 21) return null;
  const recent = days.filter((day) => daysBetween(day.date, today) < 14).map((day) => day.bestE1rm);
  const prior = days.filter((day) => { const age = daysBetween(day.date, today); return age >= 14 && age < 28; }).map((day) => day.bestE1rm);
  if (!recent.length || !prior.length) return null;
  const recentBest = Math.max(...recent);
  const priorBest = Math.max(...prior);
  if (priorBest <= 0) return null;
  const changePct = Number((((recentBest - priorBest) / priorBest) * 100).toFixed(1));
  return changePct < 1 ? { exerciseId, e1rmChangePct: changePct, sessionsAnalyzed: days.length } : null;
}

function analyzeExercise(meta: ExerciseMeta, sets: EngineSet[], painful: boolean, experience: EngineInput["experience"]): EngineAdjustment {
  if (painful) {
    return {
      kind: "swap_exercise", exerciseId: meta.exerciseId,
      replacementCandidates: meta.alternatives.slice(0, 3),
      reason: {
        zh: "该动作近期引发疼痛（≥4/10）。建议换成同一动作模式的低刺激替代，而不是硬顶着继续。",
        en: "This movement recently caused pain (≥4/10). Swap to a lower-irritation substitute in the same movement pattern instead of pushing through.",
      },
      confidence: "high",
    };
  }
  const days = exerciseDays(sets, meta.exerciseId);
  const range = parseRepRange(meta.targetReps);
  if (days.length < 2) {
    return {
      kind: "hold", exerciseId: meta.exerciseId,
      reason: { zh: "该动作的记录还不足两次，保持当前安排继续积累数据。", en: "Fewer than two logged sessions for this movement — keep the current prescription and gather data." },
      confidence: "low",
    };
  }
  const [previous, latest] = days.slice(-2);
  const rirKnown = latest.minRir !== null && previous.minRir !== null;
  // Overreaching guard first: repeated RIR 0 means loads got ahead of recovery.
  if (rirKnown && latest.minRir! <= 0 && previous.minRir! <= 0) {
    return {
      kind: "reduce_load", exerciseId: meta.exerciseId, magnitudePct: -5,
      reason: {
        zh: `最近两次都练到力竭（RIR 0）。下次负重先降约 5%，回到可控的储备次数再进阶。`,
        en: `The last two sessions hit failure (RIR 0). Drop the load ~5% next time and rebuild a controllable rep reserve before progressing.`,
      },
      confidence: "high",
    };
  }
  const hitTop = (day: ExerciseDay) => day.minReps >= range.max;
  const reserveOk = (day: ExerciseDay) => day.minRir === null ? experience === "beginner" : day.minRir >= 2;
  // Double progression: both recent sessions at the top of the range with
  // reps in reserve → earn a load increase.
  if (hitTop(latest) && hitTop(previous) && reserveOk(latest) && reserveOk(previous)) {
    const magnitude = meta.compound ? 5 : 2.5;
    return {
      kind: "increase_load", exerciseId: meta.exerciseId, magnitudePct: magnitude,
      reason: {
        zh: `连续两次全部组数达到 ${range.max} 次上限且仍有储备（RIR≥2）。下次负重增加约 ${magnitude}%。`,
        en: `Two consecutive sessions hit the top of the ${range.min}–${range.max} range with reps in reserve (RIR≥2). Add roughly ${magnitude}% load next time.`,
      },
      confidence: "high",
    };
  }
  if (latest.minReps < range.min) {
    return {
      kind: "hold", exerciseId: meta.exerciseId,
      reason: {
        zh: `最近一次有组数低于 ${range.min} 次下限。保持当前负重，把每组次数先做回区间内。`,
        en: `The latest session dropped below the ${range.min}-rep floor. Keep the load and bring every set back into range first.`,
      },
      confidence: "medium",
    };
  }
  return {
    kind: "add_reps", exerciseId: meta.exerciseId,
    reason: {
      zh: `保持当前负重，在 ${range.min}–${range.max} 区间内每次多做 1 次，攒够上限再加重量。`,
      en: `Keep the current load and add one rep per session inside the ${range.min}–${range.max} range; earn the top of the range before adding weight.`,
    },
    confidence: "medium",
  };
}

export function runEngine(input: EngineInput): EngineReport {
  const painful = new Set(input.painfulExerciseIds || []);
  const ratio = fatigueRatio(input.sets, input.today);
  const recentPainSessions = input.sessions.filter((session) => daysBetween(session.date, input.today) < 7 && session.pain >= 4).length;
  let deloadRecommended = false;
  let deloadReason: EngineReport["deloadReason"];
  if (ratio !== null && ratio > 1.35) {
    deloadRecommended = true;
    deloadReason = {
      zh: `近 7 天训练负荷是近 4 周平均的 ${ratio} 倍，超出 1.35 的安全比例。本周安排一次减量（组数与负重各降约 30–40%）。`,
      en: `The last 7 days carried ${ratio}× your 4-week average load, above the 1.35 safety ratio. Schedule a deload this week (roughly 30–40% less volume and load).`,
    };
  } else if (recentPainSessions >= 2) {
    deloadRecommended = true;
    deloadReason = {
      zh: `近 7 天有 ${recentPainSessions} 次训练疼痛达到 4/10 及以上。先减量并避开引发疼痛的动作；疼痛持续请咨询专业人员。`,
      en: `${recentPainSessions} sessions in the last 7 days reported pain at 4/10 or higher. Deload and avoid the aggravating movements; see a professional if pain persists.`,
    };
  }
  const adjustments: EngineAdjustment[] = [];
  const stagnation: StagnationEntry[] = [];
  for (const meta of input.exercises) {
    const adjustment = analyzeExercise(meta, input.sets, painful.has(meta.exerciseId), input.experience);
    const stall = detectStagnation(input.sets, meta.exerciseId, input.today);
    if (stall) {
      stagnation.push(stall);
      // A stalled lift that is not already being fixed gets a variation nudge.
      if (adjustment.kind === "add_reps" || adjustment.kind === "hold") {
        adjustments.push({
          kind: "swap_exercise", exerciseId: meta.exerciseId,
          replacementCandidates: meta.alternatives.slice(0, 3),
          reason: {
            zh: `该动作的估算 1RM 已连续约 4 周没有增长（变化 ${stall.e1rmChangePct}%）。可以换一个同模式变式重新制造进步刺激。`,
            en: `Estimated 1RM on this movement has been flat for ~4 weeks (${stall.e1rmChangePct}% change). Rotate to a same-pattern variation to restart progress.`,
          },
          confidence: "medium",
        });
        continue;
      }
    }
    adjustments.push(adjustment);
  }
  // During a recommended deload, load increases are withheld — recovery first.
  const finalAdjustments = deloadRecommended
    ? adjustments.map((adjustment) => adjustment.kind === "increase_load"
      ? { ...adjustment, kind: "hold" as const, magnitudePct: undefined, confidence: "medium" as const,
          reason: {
            zh: "本周建议减量，暂缓加重；恢复后按原进阶规则继续。",
            en: "A deload is recommended this week, so the load increase is paused; resume normal progression after recovery.",
          } }
      : adjustment)
    : adjustments;
  return { fatigueRatio: ratio, deloadRecommended, deloadReason, adjustments: finalAdjustments, stagnation };
}
