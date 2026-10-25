/**
 * The coach that works with no model configured.
 *
 * "No LLM" must not mean "no coach". Everything below is derived from data the
 * product already owns — the exercise pool, the movement-pattern guidance, the
 * plan the deterministic planner produced and the safety rules the server
 * enforces — so a signed-out user on a deployment with no credentials can still
 * ask how to do a movement, what usually goes wrong, when to stop, what to swap
 * it for, why it is in their plan, and what to cut when they are short on time.
 *
 * The one thing it will not do is pretend. Every answer is stamped `rules`, and
 * anything outside the intents below returns `unavailable` with the list of what
 * *can* be answered rather than a plausible-sounding guess.
 *
 * Copy lives here in both languages rather than in the message catalog for the
 * same reason `packages/domain/src/safety.ts` does: it is the text of a rule,
 * and separating the two lets one change without the other.
 */

import { PATTERN_LABEL, type Equipment } from "../../coach-core/src/index.ts";
import { exerciseGuidance, fromPlannedExercise, substitutesFor, type ExerciseView } from "../../exercise-catalog/src/index.ts";
import { pick, type Locale, type Localized } from "../../i18n/src/locales.ts";
import type { CoachIntent } from "./coach.ts";
import { planReasons, type PlanRecord, type PlanReason } from "./plan.ts";
import { durationForMode, exercisesForMode } from "./workout.ts";

export type CoachRulesAnswer = {
  source: "rules";
  intent: CoachIntent;
  title: string;
  paragraphs: string[];
  bullets: string[];
  substitutes: ExerciseView[];
  /** What this answer cannot cover. Shown, not swallowed. */
  limitations: string[];
};

export type CoachUnavailableAnswer = {
  source: "unavailable";
  intent: CoachIntent;
  title: string;
  paragraphs: string[];
  /** Intents the deterministic layer *can* answer, so the dead end has an exit. */
  answerable: CoachIntent[];
};

export type CoachRulesResult = CoachRulesAnswer | CoachUnavailableAnswer;

const T = (locale: Locale, value: Localized): string => pick(value, locale) || value.zh;

export const RULES_ANSWERABLE: CoachIntent[] = [
  "how_to_perform", "common_mistakes", "stop_conditions", "substitute_exercise",
  "why_this_exercise", "why_this_plan", "not_enough_time",
];

const LIMITATION_NO_MODEL: Localized = {
  zh: "这条回答来自动作库、计划规则和安全规则，不是 AI 生成，也没有读取你的历史训练记录。",
  en: "This answer comes from the exercise library, the plan rules and the safety rules — not from a model, and without reading your training history.",
};

const NOT_MEDICAL: Localized = {
  zh: "这不是医疗诊断。持续疼痛请咨询专业人员。",
  en: "This is not a medical diagnosis. See a professional about pain that persists.",
};

export type CoachRulesInput = {
  intent: CoachIntent;
  locale: Locale;
  plan: PlanRecord | null;
  dayIndex?: number;
  exerciseId?: string;
  availableMinutes?: number;
};

function findExercise(plan: PlanRecord | null, dayIndex: number | undefined, exerciseId: string | undefined): ExerciseView | null {
  if (!plan || !exerciseId) return null;
  const days = dayIndex === undefined ? plan.plan.schedule : [plan.plan.schedule[dayIndex]].filter(Boolean);
  for (const day of days) {
    const match = day.exercises.find((exercise) => exercise.id === exerciseId);
    if (match) return fromPlannedExercise(match);
  }
  return null;
}

/**
 * One checkable sentence per planner reason.
 *
 * Exported because the plan overview and the coach must say the same thing: a
 * second copy of this wording would let the page and the answer disagree about
 * why the plan looks the way it does.
 */
export function planReasonLine(reason: PlanReason, locale: Locale): string {
  const zh = locale === "zh";
  switch (reason.kind) {
    case "training_days":
      return zh
        ? `每周 ${reason.days} 个训练日 —— 你填的是 ${reason.requested} 天，安全规则按经验水平和恢复能力做了收敛。`
        : `${reason.days} training days a week — you asked for ${reason.requested}; the safety rules narrow that by experience and recovery.`;
    case "session_length":
      return zh
        ? `单次约 ${reason.minutes} 分钟、${reason.exercises} 个动作 —— 由你选的时长换算，不是固定模板。`
        : `About ${reason.minutes} minutes and ${reason.exercises} movements per session — derived from the duration you chose, not a fixed template.`;
    case "weekly_sets":
      return zh
        ? `每个主要肌群每周 ${reason.min}–${reason.max} 组 —— 对应「${reason.experience}」经验水平的剂量区间。`
        : `${reason.min}–${reason.max} weekly sets per major muscle — the dose range for "${reason.experience}" experience.`;
    case "calorie_delta":
      return zh
        ? `每日热量偏移 ${reason.delta > 0 ? "+" : ""}${reason.delta} kcal，且不低于 ${reason.floor} kcal 的下限。`
        : `A daily calorie offset of ${reason.delta > 0 ? "+" : ""}${reason.delta} kcal, never below the ${reason.floor} kcal floor.`;
    case "equipment":
      return zh
        ? `动作只从「${reason.equipment}」可用范围里选，训练地点按「${reason.location}」安排。`
        : `Movements are drawn only from what "${reason.equipment}" allows, scheduled for "${reason.location}".`;
    case "limitations":
      return zh
        ? `你填写的限制「${reason.text}」已计入：相关模式改用同类替代动作，且不提高强度。`
        : `Your note "${reason.text}" is accounted for: affected patterns use same-pattern substitutes and intensity is not raised.`;
  }
}

export function coachRulesAnswer(input: CoachRulesInput): CoachRulesResult {
  const { locale, intent } = input;
  const zh = locale === "zh";
  const exercise = findExercise(input.plan, input.dayIndex, input.exerciseId);
  const equipment: Equipment = input.plan?.profile.equipment ?? "bodyweight";
  const base = { source: "rules" as const, intent, substitutes: [] as ExerciseView[], limitations: [T(locale, LIMITATION_NO_MODEL)] };

  if (intent === "how_to_perform" || intent === "common_mistakes" || intent === "stop_conditions" || intent === "substitute_exercise" || intent === "why_this_exercise") {
    if (!exercise) {
      return {
        source: "unavailable", intent,
        title: zh ? "需要先选中一个动作" : "Pick a movement first",
        paragraphs: [zh
          ? "这个问题针对某个具体动作。请在计划或今日训练里点开一个动作，再从那里提问。"
          : "This question is about a specific movement. Open one from your plan or today's session and ask from there."],
        answerable: RULES_ANSWERABLE,
      };
    }
    const guidance = exerciseGuidance(exercise, locale);
    const name = pick(exercise.name, locale) || exercise.id;
    if (intent === "how_to_perform") {
      return {
        ...base,
        title: zh ? `${name}：怎么做` : `${name}: how to perform it`,
        paragraphs: [guidance.breathing, guidance.stepsSource === "cue"
          ? (zh ? "动作库对这个动作只收录了一条要领，下面是它本身，而不是补出来的步骤。" : "The library holds a single cue for this movement; that cue is shown below rather than invented steps.")
          : ""].filter(Boolean),
        bullets: guidance.steps,
      };
    }
    if (intent === "common_mistakes") {
      return { ...base, title: zh ? `${name}：常见错误` : `${name}: common mistakes`, paragraphs: [], bullets: guidance.mistakes };
    }
    if (intent === "stop_conditions") {
      return {
        ...base,
        title: zh ? `${name}：什么时候停` : `${name}: when to stop`,
        paragraphs: [T(locale, NOT_MEDICAL)],
        bullets: guidance.stopConditions,
        limitations: [T(locale, LIMITATION_NO_MODEL)],
      };
    }
    if (intent === "substitute_exercise") {
      const substitutes = substitutesFor(exercise, equipment);
      return {
        ...base,
        title: zh ? `${name}：可以换成` : `${name}: what to swap it for`,
        paragraphs: [substitutes.length
          ? (zh ? "下面都是同一个动作模式、你现有器械能完成的动作。换动作不改变这一天的组数与次数。"
                : "These share the movement pattern and work with the equipment you have. Swapping does not change the sets or reps for the day.")
          : (zh ? "在你现有器械下，动作库里没有同模式的替代动作。可以跳过这个动作并保留其余部分，或改用自重版本。"
                : "With your current equipment the library has no same-pattern substitute. Skip this movement and keep the rest, or use a bodyweight version.")],
        bullets: [],
        substitutes,
      };
    }
    const patternLabel = exercise.pattern ? pick(PATTERN_LABEL[exercise.pattern], locale) : null;
    return {
      ...base,
      title: zh ? `${name}：为什么在你的计划里` : `${name}: why it is in your plan`,
      paragraphs: [
        patternLabel
          ? (zh ? `它承担这一天的「${patternLabel}」模式。` : `It covers the "${patternLabel}" pattern for this session.`)
          : (zh ? "它承担这一天的主要训练模式。" : "It covers the main pattern for this session."),
        exercise.prescription
          ? (zh ? `处方是 ${exercise.prescription.sets} 组 × ${exercise.prescription.reps}，组间休息 ${exercise.prescription.rest}，由你的经验水平和目标决定。`
                : `The prescription is ${exercise.prescription.sets} × ${exercise.prescription.reps} with ${exercise.prescription.rest} rest, set by your experience level and goal.`)
          : "",
      ].filter(Boolean),
      bullets: [pick(exercise.cue, locale) || ""].filter(Boolean),
    };
  }

  if (intent === "why_this_plan") {
    if (!input.plan) {
      return {
        source: "unavailable", intent,
        title: zh ? "还没有计划可以解释" : "There is no plan to explain yet",
        paragraphs: [zh ? "先完成建档生成一份计划，这里就会逐条列出安排理由。" : "Finish the intake to generate a plan and this will list the reasons one by one."],
        answerable: RULES_ANSWERABLE,
      };
    }
    return {
      ...base,
      title: zh ? "这份计划为什么这样排" : "Why this plan looks like this",
      paragraphs: [input.plan.source === "ai"
        ? (zh ? "下面每一条都可以和页面上的数字对上；AI 只在这些边界内选动作。" : "Every line below matches a number on the page; the model only chose movements inside these bounds.")
        : (zh ? "下面每一条都可以和页面上的数字对上。" : "Every line below matches a number on the page.")],
      bullets: planReasons(input.plan).map((reason) => planReasonLine(reason, locale)),
    };
  }

  if (intent === "not_enough_time") {
    const day = input.plan && input.dayIndex !== undefined ? input.plan.plan.schedule[input.dayIndex] : null;
    if (!day || day.restDay) {
      return {
        source: "unavailable", intent,
        title: zh ? "需要先选中某一天" : "Pick a day first",
        paragraphs: [zh ? "从今日训练或计划里的某个训练日提问，才能给出该日的缩短版本。" : "Ask from a training day in Today or in your plan to get that day's shortened version."],
        answerable: RULES_ANSWERABLE,
      };
    }
    const short = exercisesForMode(day, "short");
    const minutes = durationForMode(day, "short");
    return {
      ...base,
      title: zh ? `只有 ${input.availableMinutes ?? minutes} 分钟时` : `When you only have ${input.availableMinutes ?? minutes} minutes`,
      paragraphs: [zh
        ? `保留这 ${short.length} 个动作，约 ${minutes} 分钟。完成比完美重要，缩短版本仍然计入本周执行。`
        : `Keep these ${short.length} movements, about ${minutes} minutes. Completion beats perfection, and the short version still counts toward the week.`],
      bullets: short.map((exercise) => `${pick(exercise.name, locale) || exercise.id} · ${exercise.sets} × ${exercise.reps}`),
    };
  }

  return {
    source: "unavailable", intent,
    title: zh ? "这个问题需要 AI 教练" : "This one needs the AI coach",
    paragraphs: [zh
      ? "当前部署没有配置语言模型，所以无法回答自由提问。以下问题不需要模型也能回答。"
      : "This deployment has no language model configured, so free-form questions cannot be answered. The questions below do not need one."],
    answerable: RULES_ANSWERABLE,
  };
}
