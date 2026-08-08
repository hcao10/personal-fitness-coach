// Cmine Fit habit & retention engine v1 (proprietary).
//
// Behavioral-science rules as pure, deterministic functions. Design choices
// and their grounding:
//  - Week-based streaks, not day-based: training frequency is weekly by
//    nature; daily streaks punish rest days and accelerate churn.
//  - Forgiving streaks: one missed week per rolling four weeks is auto-repaired.
//    Rigid streaks convert a single slip into "the streak is dead, why bother"
//    (abstinence-violation effect); forgiveness preserves the habit identity.
//  - Identity-framed milestones ("你已经是坚持 4 周的训练者") rather than
//    reward-framed ones — identity reinforcement outlasts external rewards.
//  - Implementation intentions: reminders anchor to the user's own committed
//    cue (time + place), which roughly doubles follow-through versus vague
//    intentions in the habit literature.
// No imports, no clock, no I/O — callers inject `today` and history.

export type WeekOutcome = { weekStart: string; sessions: number };

export type StreakState = {
  currentWeeks: number;
  longestWeeks: number;
  repairedWeeks: string[]; // week starts that were auto-repaired
  activeThisWeek: boolean;
  sessionsThisWeek: number;
};

export type Milestone = {
  kind: "first_week" | "streak_4_weeks" | "streak_12_weeks" | "sessions_25" | "sessions_100";
  title: { zh: string; en: string };
  message: { zh: string; en: string };
};

const dayMs = 86_400_000;

// Monday-start ISO week bucket for a YYYY-MM-DD date.
export function isoWeekStart(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  const offset = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - offset);
  return value.toISOString().slice(0, 10);
}

export function summarizeWeeks(sessionDates: string[], today: string, weeks = 26): WeekOutcome[] {
  const currentWeek = isoWeekStart(today);
  const counts = new Map<string, number>();
  for (const date of sessionDates) {
    const week = isoWeekStart(date);
    counts.set(week, (counts.get(week) || 0) + 1);
  }
  const outcomes: WeekOutcome[] = [];
  for (let index = 0; index < weeks; index += 1) {
    const weekStart = new Date(Date.parse(`${currentWeek}T00:00:00Z`) - index * 7 * dayMs).toISOString().slice(0, 10);
    outcomes.push({ weekStart, sessions: counts.get(weekStart) || 0 });
  }
  return outcomes; // newest first
}

export type StreakOptions = { minSessions?: number; repairPerRollingWeeks?: number; rollingWindow?: number };

// Walks backward from the current week. A week counts when it reaches
// minSessions (a completed short/recovery variant counts as a session — the
// caller's session list already includes them, deliberately: "completion beats
// perfection"). An inactive week is auto-repaired when no other repair was
// used in the previous `rollingWindow` counted weeks.
export function computeStreak(outcomes: WeekOutcome[], options: StreakOptions = {}): StreakState {
  const minSessions = Math.max(1, options.minSessions ?? 2);
  const rollingWindow = Math.max(2, options.rollingWindow ?? 4);
  const repairBudget = Math.max(0, options.repairPerRollingWeeks ?? 1);
  const active = (outcome: WeekOutcome) => outcome.sessions >= minSessions;
  const [current, ...history] = outcomes;
  const sessionsThisWeek = current?.sessions || 0;
  const activeThisWeek = current ? active(current) : false;

  let currentWeeks = activeThisWeek ? 1 : 0;
  const repairedWeeks: string[] = [];
  let counted = activeThisWeek ? 1 : 0;
  const repairsAt: number[] = []; // positions (in counted weeks) where repairs were spent
  // The in-progress week never breaks a streak — it simply has not happened yet.
  let walking = true;
  for (let index = 0; index < history.length; index += 1) {
    if (!walking) break;
    const outcome = history[index];
    if (active(outcome)) {
      currentWeeks += 1;
      counted += 1;
      continue;
    }
    // A repair only bridges a gap between active weeks — it never extends the
    // chain past the last week the user actually trained.
    const moreActiveBeyond = history.slice(index + 1).some(active);
    const recentRepairs = repairsAt.filter((position) => counted - position < rollingWindow).length;
    if (moreActiveBeyond && recentRepairs < repairBudget) {
      repairsAt.push(counted);
      repairedWeeks.push(outcome.weekStart);
      counted += 1;
      continue; // repaired week keeps the chain but adds no length
    }
    walking = false;
  }

  // Longest streak over the whole window, same forgiveness rule.
  let longestWeeks = 0;
  let run = 0;
  let runCounted = 0;
  let runRepairs: number[] = [];
  const chronological = [...outcomes].reverse();
  for (const outcome of chronological) {
    if (active(outcome)) { run += 1; runCounted += 1; }
    else {
      const recent = runRepairs.filter((position) => runCounted - position < rollingWindow).length;
      if (run > 0 && recent < repairBudget) { runRepairs.push(runCounted); runCounted += 1; }
      else { run = 0; runCounted = 0; runRepairs = []; }
    }
    longestWeeks = Math.max(longestWeeks, run);
  }

  return { currentWeeks, longestWeeks: Math.max(longestWeeks, currentWeeks), repairedWeeks, activeThisWeek, sessionsThisWeek };
}

export function detectMilestones(streak: StreakState, totalSessions: number): Milestone[] {
  const earned: Milestone[] = [];
  if (streak.currentWeeks >= 1 || totalSessions >= 1) earned.push({
    kind: "first_week",
    title: { zh: "第一周完成", en: "First week done" },
    message: { zh: "最难的一步已经迈出——你已经是一个开始训练的人了。", en: "The hardest step is behind you — you are now someone who trains." },
  });
  if (streak.currentWeeks >= 4 || streak.longestWeeks >= 4) earned.push({
    kind: "streak_4_weeks",
    title: { zh: "连续 4 周", en: "4-week streak" },
    message: { zh: "你已经是坚持 4 周的训练者。习惯正在替你做决定。", en: "You are now a 4-week consistent trainee. The habit is starting to decide for you." },
  });
  if (streak.currentWeeks >= 12 || streak.longestWeeks >= 12) earned.push({
    kind: "streak_12_weeks",
    title: { zh: "12 周：习惯成型", en: "12 weeks: habit formed" },
    message: { zh: "12 周的坚持意味着训练已经是你身份的一部分，而不是一项任务。", en: "Twelve weeks of consistency means training is part of who you are, not a task on a list." },
  });
  if (totalSessions >= 25) earned.push({
    kind: "sessions_25",
    title: { zh: "25 次训练", en: "25 sessions" },
    message: { zh: "25 次出现在训练里。每一次都投了「我是训练者」的一票。", en: "You have shown up 25 times. Every session was a vote for the person you are becoming." },
  });
  if (totalSessions >= 100) earned.push({
    kind: "sessions_100",
    title: { zh: "100 次训练", en: "100 sessions" },
    message: { zh: "100 次训练——这不再是尝试，这是生活方式。", en: "One hundred sessions — this is no longer an attempt, it is a lifestyle." },
  });
  return earned;
}

export type LetterInput = {
  streak: StreakState;
  plannedSessions: number;
  deloadRecommended: boolean;
  adjustments: Array<{ kind: string; reason: { zh: string; en: string } }>;
  newMilestones: Milestone[];
};

export type WeeklyLetter = { title: { zh: string; en: string }; lines: { zh: string[]; en: string[] } };

// The weekly coach letter: engine facts narrated with an identity frame.
// Compact by design — a push notification body, not an essay.
export function composeWeeklyLetter(input: LetterInput): WeeklyLetter {
  const zh: string[] = [];
  const en: string[] = [];
  const done = input.streak.sessionsThisWeek;
  zh.push(`本周完成 ${done}/${input.plannedSessions} 次训练${input.streak.activeThisWeek ? `，连续训练进入第 ${input.streak.currentWeeks} 周` : ""}。`);
  en.push(`You completed ${done}/${input.plannedSessions} sessions this week${input.streak.activeThisWeek ? `, extending your streak to week ${input.streak.currentWeeks}` : ""}.`);
  for (const milestone of input.newMilestones.slice(0, 1)) {
    zh.push(`里程碑解锁：${milestone.title.zh} — ${milestone.message.zh}`);
    en.push(`Milestone unlocked: ${milestone.title.en} — ${milestone.message.en}`);
  }
  if (input.deloadRecommended) {
    zh.push("下周聚焦：安排减量，恢复优先——这是计划的一部分，不是退步。");
    en.push("Next week: deload and recover — that is part of the plan, not a step back.");
  } else {
    const highlight = input.adjustments.find((adjustment) => adjustment.kind === "increase_load")
      || input.adjustments.find((adjustment) => adjustment.kind === "swap_exercise")
      || input.adjustments[0];
    if (highlight) { zh.push(`下周聚焦：${highlight.reason.zh}`); en.push(`Next week: ${highlight.reason.en}`); }
    else { zh.push("下周聚焦：保持节奏，把每次训练记录下来。"); en.push("Next week: keep the rhythm and log every session."); }
  }
  return {
    title: { zh: "本周教练信", en: "Your weekly coach letter" },
    lines: { zh, en },
  };
}

export type ReminderInput = { cuePlace?: string | null; streakWeeks: number; shortVariantMinutes?: number };

// Implementation-intention reminder. Low-friction by default: the short
// variant is offered up front so "no time" never becomes "no session".
export function trainingReminderMessage(input: ReminderInput): { title: { zh: string; en: string }; body: { zh: string; en: string } } {
  const place = input.cuePlace?.trim();
  const minutes = input.shortVariantMinutes || 20;
  return {
    title: {
      zh: place ? `到${place}的时间到了` : "今天的训练时间到了",
      en: place ? `Time for ${place}` : "It is training time",
    },
    body: {
      zh: `${input.streakWeeks >= 2 ? `连续第 ${input.streakWeeks} 周。` : ""}状态一般也没关系——完成 ${minutes} 分钟缩短版同样算数。`,
      en: `${input.streakWeeks >= 2 ? `Week ${input.streakWeeks} of your streak. ` : ""}Low energy is fine — the ${minutes}-minute short version counts all the same.`,
    },
  };
}

// Quiet-hours check with wrap-around support ("22:00"–"08:00").
export function inQuietHours(localTime: string, quietStart: string, quietEnd: string): boolean {
  const minutes = (value: string) => { const [hour, minute] = value.split(":").map(Number); return (hour % 24) * 60 + (minute % 60); };
  const time = minutes(localTime);
  const start = minutes(quietStart);
  const end = minutes(quietEnd);
  if (start === end) return false;
  return start < end ? time >= start && time < end : time >= start || time < end;
}
