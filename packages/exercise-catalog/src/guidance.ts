/**
 * Deterministic movement guidance.
 *
 * "No LLM configured" must not mean "no coach". Everything here is reviewed
 * bilingual copy keyed by movement pattern, so a signed-out user on a
 * deployment with no model still gets how to perform the movement, what people
 * get wrong, how to breathe, and when to stop — the four things that make a
 * demo GIF safe to follow.
 *
 * It is written per pattern rather than per exercise because the pool holds 167
 * movements across twelve patterns: pattern-level copy can be reviewed by a
 * human and stay reviewed, while 167 hand-written entries would silently rot.
 * Exercise-specific steps come from the dataset instructions when the catalog
 * has them; `stepsSource` says which of the two the reader is looking at.
 */

import { PAIN_THRESHOLD } from "../../domain/src/safety.ts";
import type { MovementPattern } from "../../coach-core/src/index.ts";
import { pick, type Locale, type Localized } from "../../i18n/src/locales.ts";
import type { ExerciseView } from "./view.ts";

type PatternCopy = { breathing: Localized; mistakes: Localized<string[]>; watchFor: Localized<string[]> };

const PATTERN_GUIDANCE: Record<MovementPattern, PatternCopy> = {
  push_h: {
    breathing: { zh: "下放时吸气，推起时呼气；不要在最重的一段憋到面红。", en: "Breathe in as you lower, out as you press; do not hold your breath through the hardest part." },
    mistakes: {
      zh: ["肩胛松开、肩膀向前顶", "手肘完全外展成 90 度", "下放到底时腰部离开支撑"],
      en: ["Shoulder blades loose and shoulders rolling forward", "Elbows flared straight out to 90 degrees", "Lower back lifting off the support at the bottom"],
    },
    watchFor: { zh: ["肩前侧刺痛", "手腕被压得后仰"], en: ["Sharp pain at the front of the shoulder", "Wrists bent back under the load"] },
  },
  push_v: {
    breathing: { zh: "推起前吸气收紧躯干，推到顶再呼气。", en: "Breathe in and brace before pressing, exhale at the top." },
    mistakes: {
      zh: ["用腰部后仰代替肩部上推", "肋骨外翻、骨盆前倾", "推到顶时耸肩夹住脖子"],
      en: ["Leaning back through the lower spine instead of pressing overhead", "Ribs flaring and pelvis tipping forward", "Shrugging into the neck at lockout"],
    },
    watchFor: { zh: ["举过头顶时肩部卡住或弹响伴疼痛", "腰部出现挤压感"], en: ["Shoulder catching or painful clicking overhead", "A pinching feeling in the lower back"] },
  },
  pull_h: {
    breathing: { zh: "拉向身体时呼气，还原时吸气。", en: "Breathe out as you pull toward you, in as you return." },
    mistakes: {
      zh: ["靠腰部前后摆动带起重量", "先用手臂发力而不是背部", "顶点没有停顿就直接放回"],
      en: ["Swinging the torso to start the weight", "Leading with the arms instead of the back", "Dropping straight back with no pause at the top"],
    },
    watchFor: { zh: ["下背在还原时圆背", "肘部内侧牵扯痛"], en: ["Lower back rounding on the way down", "A pulling pain on the inside of the elbow"] },
  },
  pull_v: {
    breathing: { zh: "向下或向上拉时呼气，还原时吸气。", en: "Breathe out on the pull, in on the way back." },
    mistakes: {
      zh: ["把杆拉到颈后", "全程只靠手臂，肩胛不下沉", "还原时突然放松砸回起点"],
      en: ["Pulling the bar behind the neck", "Arms only, with no shoulder blade movement", "Letting go and dropping back to the start"],
    },
    watchFor: { zh: ["肩关节前侧被拉扯", "颈部代偿发力"], en: ["A dragging feeling at the front of the shoulder", "The neck taking over the effort"] },
  },
  squat: {
    breathing: { zh: "下蹲前吸气收紧腹部，起身经过最难点后再呼气。", en: "Breathe in and brace before descending; exhale after the hardest point on the way up." },
    mistakes: {
      zh: ["膝盖向内塌", "脚跟离地", "到底部时骨盆后倾、腰部圆背"],
      en: ["Knees caving inward", "Heels lifting off the floor", "Pelvis tucking and the lower back rounding at the bottom"],
    },
    watchFor: { zh: ["膝盖前侧尖锐痛", "起身时腰部单侧疼痛"], en: ["Sharp pain at the front of the knee", "One-sided lower back pain on the way up"] },
  },
  hinge: {
    breathing: { zh: "屈髋前吸气，站直后再呼气；不要边下放边呼气。", en: "Breathe in before hinging and exhale once standing; do not exhale on the way down." },
    mistakes: {
      zh: ["用弯腰代替屈髋", "重量离身体太远", "顶点过度后仰挤压腰椎"],
      en: ["Bending the back instead of hinging at the hip", "Letting the weight drift away from the body", "Over-extending and squeezing the lower back at the top"],
    },
    watchFor: { zh: ["腰部由酸变为刺痛", "臀部或大腿后侧放射到小腿的麻感"], en: ["Lower back pain turning from an ache into a sharp stab", "Numbness spreading from the glute or hamstring into the calf"] },
  },
  lunge: {
    breathing: { zh: "下降时吸气，蹬起时呼气。", en: "Breathe in as you lower, out as you drive up." },
    mistakes: {
      zh: ["前膝内扣", "步幅太短导致膝盖超过脚尖过多", "躯干左右晃动"],
      en: ["Front knee collapsing inward", "Too short a stride, forcing the knee far past the toes", "Torso swaying side to side"],
    },
    watchFor: { zh: ["膝盖内侧疼痛", "落地时无法控制"], en: ["Pain on the inside of the knee", "Losing control of the descent"] },
  },
  core: {
    breathing: { zh: "保持缓慢呼吸，不要憋气；用力段呼气。", en: "Keep breathing slowly rather than holding; exhale through the effort." },
    mistakes: {
      zh: ["用脖子发力把头拉起来", "腰部离开地面形成拱形", "只求次数不控制速度"],
      en: ["Pulling the head up with the neck", "Lower back arching off the floor", "Chasing reps instead of controlling the speed"],
    },
    watchFor: { zh: ["腰部代替腹部发力", "颈部酸痛超过腹部"], en: ["The lower back taking over from the abdominals", "The neck aching more than the abs"] },
  },
  iso_biceps: {
    breathing: { zh: "弯举时呼气，放下时吸气。", en: "Breathe out as you curl, in as you lower." },
    mistakes: {
      zh: ["用身体摆动带起重量", "手肘离开体侧向前跑", "放下时直接松力"],
      en: ["Swinging the body to start the weight", "Elbows drifting forward away from the ribs", "Letting the weight drop instead of lowering it"],
    },
    watchFor: { zh: ["手肘内侧或手腕疼痛"], en: ["Pain on the inside of the elbow or in the wrist"] },
  },
  iso_triceps: {
    breathing: { zh: "伸直时呼气，回收时吸气。", en: "Breathe out as you extend, in as you return." },
    mistakes: {
      zh: ["肩膀跟着一起前后动", "锁死肘关节猛然伸直", "重量过大导致手腕后折"],
      en: ["Shoulders moving back and forth with the arms", "Snapping the elbow into lockout", "Too much load bending the wrists back"],
    },
    watchFor: { zh: ["肘关节后侧刺痛"], en: ["Sharp pain behind the elbow"] },
  },
  iso_shoulder: {
    breathing: { zh: "抬起时呼气，放下时吸气。", en: "Breathe out as you raise, in as you lower." },
    mistakes: {
      zh: ["抬得比肩高很多", "靠耸肩把重量甩上去", "下放太快失去控制"],
      en: ["Raising far above shoulder height", "Shrugging the weight up", "Dropping too fast and losing control"],
    },
    watchFor: { zh: ["肩峰位置卡顿或疼痛"], en: ["Catching or pain at the top of the shoulder"] },
  },
  iso_legs: {
    breathing: { zh: "用力段呼气，还原时吸气，全程保持呼吸。", en: "Exhale through the effort, inhale on the return, and keep breathing throughout." },
    mistakes: {
      zh: ["靠惯性弹动完成次数", "活动范围只做一半", "膝关节猛然锁死"],
      en: ["Bouncing through reps on momentum", "Using only half the range", "Snapping the knee into lockout"],
    },
    watchFor: { zh: ["膝关节内出现响声伴疼痛", "小腿抽筋"], en: ["Painful clicking inside the knee joint", "Calf cramping"] },
  },
};

/** Applies to every movement, in every language, regardless of pattern. */
const UNIVERSAL_STOP: Localized<string[]> = {
  zh: [
    `疼痛达到 ${PAIN_THRESHOLD}/10，或次日明显加重：停止这个动作，改做同模式的替代动作。`,
    "出现关节尖锐痛、放射到手脚的麻木，或无法承重：立即停止。",
    "出现胸痛、晕厥、呼吸困难：立即停止并寻求医疗帮助。这不是医疗诊断。",
  ],
  en: [
    `Pain reaching ${PAIN_THRESHOLD}/10, or clearly worse the next day: stop this movement and use a same-pattern substitute.`,
    "Sharp joint pain, numbness spreading into a hand or foot, or being unable to bear weight: stop immediately.",
    "Chest pain, fainting or difficulty breathing: stop and seek medical help. This is not a medical diagnosis.",
  ],
};

const GENERIC: PatternCopy = {
  breathing: { zh: "用力段呼气，还原段吸气；不要憋气完成一整组。", en: "Exhale through the effort and inhale on the return; do not hold your breath for a whole set." },
  mistakes: {
    zh: ["速度过快，失去对动作的控制", "活动范围不完整", "为了加重量牺牲姿势"],
    en: ["Moving too fast to stay in control", "Cutting the range of motion short", "Trading form for load"],
  },
  watchFor: { zh: ["任何关节出现尖锐疼痛"], en: ["Sharp pain in any joint"] },
};

export type ExerciseGuidance = {
  /** Ordered steps in the reader's language. Never empty. */
  steps: string[];
  /** Where the steps came from, so the UI does not imply dataset detail it lacks. */
  stepsSource: "dataset" | "cue";
  breathing: string;
  mistakes: string[];
  stopConditions: string[];
};

export function exerciseGuidance(view: ExerciseView, locale: Locale): ExerciseGuidance {
  const copy = view.pattern ? PATTERN_GUIDANCE[view.pattern] : GENERIC;
  const datasetSteps = pick(view.steps, locale) || [];
  const cue = pick(view.cue, locale) || "";
  const steps = datasetSteps.length ? datasetSteps : cue ? [cue] : [];
  return {
    steps,
    stepsSource: datasetSteps.length ? "dataset" : "cue",
    breathing: pick(copy.breathing, locale) || pick(GENERIC.breathing, locale) || "",
    mistakes: pick(copy.mistakes, locale) || [],
    stopConditions: [...(pick(copy.watchFor, locale) || []), ...(pick(UNIVERSAL_STOP, locale) || [])],
  };
}

/** Every pattern that has reviewed copy — the coverage test reads this. */
export const GUIDED_PATTERNS = Object.keys(PATTERN_GUIDANCE) as MovementPattern[];
