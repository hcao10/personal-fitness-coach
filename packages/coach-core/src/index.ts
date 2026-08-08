// Stateless by design: this package has no account, database, or network dependencies.
import { EXERCISE_POOL, type MovementPattern } from "./exercise-pool";

export { EXERCISE_POOL, type MovementPattern, type PoolExercise } from "./exercise-pool";

export type Goal = "fat_loss" | "muscle" | "recomp" | "arms" | "strength";
export type Sex = "female" | "male";
export type Activity = "sedentary" | "light" | "moderate" | "active";
export type Experience = "beginner" | "intermediate" | "advanced";
export type Equipment = "bodyweight" | "dumbbell" | "gym";
export type TrainingLocation = "home" | "gym" | "outdoors" | "mixed";
export type DietaryPreference = "balanced" | "vegetarian" | "high_protein" | "none";
export type TrainingTrack = "beginner_fat_loss" | "intermediate_hypertrophy" | "general";
export type BeginnerBarrier = "time" | "confidence" | "consistency" | "food" | "feedback";

export type Profile = {
  sex: Sex;
  age: number;
  height: number;
  weight: number;
  targetWeight: number;
  activity: Activity;
  goal: Goal;
  experience: Experience;
  days: number;
  equipment: Equipment;
  limitations: string;
  sessionMinutes?: number;
  trainingLocation?: TrainingLocation;
  dietaryPreference?: DietaryPreference;
  exclusions?: string;
  trainingTrack?: TrainingTrack;
  beginnerBarrier?: BeginnerBarrier;
  trainingAgeMonths?: number;
  currentSplit?: string;
  weakPoints?: string;
  acceptsWeightGain?: boolean;
};

export type Exercise = {
  id: string;
  name: { zh: string; en: string };
  target: { zh: string; en: string };
  cue: { zh: string; en: string };
  asset: string;
  equipment: Equipment | "barbell" | "cable";
  difficulty?: "beginner" | "intermediate" | "advanced";
  muscles?: string[];
};

export type PlannedExercise = Exercise & {
  sets: number;
  reps: string;
  rest: string;
  restSeconds?: number;
  targetRir?: number | null;
  progression?: { zh: string; en: string };
  suggestedLoadMultiplier?: number;
};
export type WorkoutDay = {
  dayIndex: number;
  title: { zh: string; en: string };
  focus: { zh: string; en: string };
  duration: number;
  exercises: PlannedExercise[];
  restDay?: boolean;
  variants?: {
    short: { duration: number; exerciseIds: string[]; note: { zh: string; en: string } };
    recovery: { duration: number; exerciseIds: string[]; intensityScale: number; note: { zh: string; en: string } };
  };
};
export type PlanPhase = {
  kind: "habit_foundation" | "hypertrophy_build" | "general_build";
  lengthWeeks: number;
  currentWeek: number;
  weeklyFocus: Array<{ zh: string; en: string }>;
};
export type CoachPlan = {
  bmr: number; tdee: number; calories: number; calorieDelta: number; bmi: number;
  weeks: number; protein: number; carbs: number; fat: number;
  track?: TrainingTrack;
  phase?: PlanPhase;
  schedule: WorkoutDay[]; confidence: "high" | "medium";
  insights?: {
    summary: { zh: string; en: string };
    planRationale: { zh: string[]; en: string[] };
    coachNotes: { zh: string[]; en: string[] };
    dietGuidance: { zh: string[]; en: string[] };
    stopConditions?: { zh: string[]; en: string[] };
  };
};

export function resolveTrainingTrack(profile: Profile): TrainingTrack {
  if (profile.trainingTrack) return profile.trainingTrack;
  if (profile.goal === "fat_loss" && profile.experience === "beginner") return "beginner_fat_loss";
  if (profile.goal === "muscle" && profile.experience !== "beginner") return "intermediate_hypertrophy";
  return "general";
}

// Seventeen hand-curated core movements. They anchor the deterministic session
// templates below; the wider reviewed pool (exercise-pool.ts) extends the
// LLM-plannable library and powers pattern-based substitutions.
const CORE_EXERCISES: Record<string, Exercise> = {
  bench: { id: "bench", name: { zh: "杠铃卧推", en: "Barbell bench press" }, target: { zh: "胸肌 · 肱三头肌", en: "Chest · Triceps" }, cue: { zh: "肩胛骨向后下方收紧，杠铃落在胸骨下缘。", en: "Set the shoulder blades, then lower the bar toward the lower sternum." }, asset: "0025-EIeI8Vf", equipment: "barbell" },
  squat: { id: "squat", name: { zh: "杠铃深蹲", en: "Barbell full squat" }, target: { zh: "臀腿 · 核心", en: "Glutes · Legs · Core" }, cue: { zh: "膝盖跟随脚尖方向，躯干保持稳定。", en: "Track knees over toes and keep the torso braced." }, asset: "0043-qXTaZnJ", equipment: "barbell" },
  deadlift: { id: "deadlift", name: { zh: "罗马尼亚硬拉", en: "Romanian deadlift" }, target: { zh: "臀肌 · 腘绳肌", en: "Glutes · Hamstrings" }, cue: { zh: "髋部后移，背部保持中立，感受腿后侧拉伸。", en: "Push the hips back with a neutral spine and load the hamstrings." }, asset: "0085-wQ2c4XD", equipment: "barbell" },
  curl: { id: "curl", name: { zh: "哑铃弯举", en: "Dumbbell biceps curl" }, target: { zh: "肱二头肌", en: "Biceps" }, cue: { zh: "肘部固定在身体两侧，顶端主动收缩。", en: "Pin the elbows by your sides and squeeze at the top." }, asset: "0294-NbVPDMW", equipment: "dumbbell" },
  hammer: { id: "hammer", name: { zh: "交替锤式弯举", en: "Cross-body hammer curl" }, target: { zh: "肱肌 · 前臂", en: "Brachialis · Forearms" }, cue: { zh: "保持中立握法，不要借助身体摆动。", en: "Keep a neutral grip and avoid swinging the torso." }, asset: "0298-Qyk5J3p", equipment: "dumbbell" },
  pushdown: { id: "pushdown", name: { zh: "绳索下压", en: "Cable pushdown" }, target: { zh: "肱三头肌", en: "Triceps" }, cue: { zh: "肩部放松，肘部固定，底端完全伸直。", en: "Relax the shoulders, pin the elbows, and finish the extension." }, asset: "0201-3ZflifB", equipment: "cable" },
  row: { id: "row", name: { zh: "坐姿绳索划船", en: "Cable low seated row" }, target: { zh: "上背 · 背阔肌", en: "Upper back · Lats" }, cue: { zh: "先收肩胛骨，再把手柄拉向腹部。", en: "Lead with the shoulder blades before pulling toward the abdomen." }, asset: "0180-hvV79Si", equipment: "cable" },
  pulldown: { id: "pulldown", name: { zh: "高位下拉", en: "Full-range lat pulldown" }, target: { zh: "背阔肌 · 肱二头肌", en: "Lats · Biceps" }, cue: { zh: "胸口微抬，肘部向下向后移动。", en: "Keep the chest tall and drive the elbows down and back." }, asset: "2330-LEprlgG", equipment: "cable" },
  shoulder: { id: "shoulder", name: { zh: "单臂哑铃推举", en: "One-arm dumbbell press" }, target: { zh: "三角肌 · 核心", en: "Delts · Core" }, cue: { zh: "收紧核心，不要通过腰部后仰完成动作。", en: "Brace the core and avoid leaning back through the press." }, asset: "0361-84RyJf8", equipment: "dumbbell" },
  lateral: { id: "lateral", name: { zh: "绳索侧平举", en: "Cable lateral raise" }, target: { zh: "三角肌中束", en: "Side delts" }, cue: { zh: "用肘部带动，抬至肩高即可。", en: "Lead with the elbow and stop around shoulder height." }, asset: "0178-goJ6ezq", equipment: "cable" },
  dumbbellRow: { id: "dumbbellRow", name: { zh: "哑铃俯身划船", en: "Dumbbell bent-over row" }, target: { zh: "上背 · 背阔肌", en: "Upper back · Lats" }, cue: { zh: "保持背部中立，把哑铃拉向髋部。", en: "Keep a neutral back and row the dumbbells toward the hips." }, asset: "0293-BJ0Hz5L", equipment: "dumbbell" },
  dumbbellDeadlift: { id: "dumbbellDeadlift", name: { zh: "哑铃罗马尼亚硬拉", en: "Dumbbell Romanian deadlift" }, target: { zh: "臀肌 · 腘绳肌", en: "Glutes · Hamstrings" }, cue: { zh: "膝盖微屈，髋部后移，哑铃贴近腿部。", en: "Soften the knees, hinge back, and keep dumbbells close to the legs." }, asset: "1459-rR0LJzx", equipment: "dumbbell" },
  deadBug: { id: "deadBug", name: { zh: "死虫式", en: "Dead bug" }, target: { zh: "深层核心", en: "Deep core" }, cue: { zh: "腰背贴住地面，缓慢伸展对侧手脚。", en: "Keep the low back down while slowly extending opposite limbs." }, asset: "0276-iny3m5y", equipment: "bodyweight" },
  lunge: { id: "lunge", name: { zh: "杠铃弓步", en: "Barbell lunge" }, target: { zh: "臀腿 · 稳定性", en: "Glutes · Legs · Stability" }, cue: { zh: "前脚全脚掌着地，后膝垂直下降。", en: "Keep the front foot planted and lower the back knee vertically." }, asset: "0054-t8iSghb", equipment: "barbell" },
  closePushup: { id: "closePushup", name: { zh: "窄距俯卧撑", en: "Close-grip push-up" }, target: { zh: "肱三头肌 · 胸肌", en: "Triceps · Chest" }, cue: { zh: "身体保持直线，肘部向后贴近身体。", en: "Keep a straight body line and sweep the elbows back." }, asset: "0259-x6KpKpq", equipment: "bodyweight" },
  dumbbellBench: { id: "dumbbellBench", name: { zh: "哑铃卧推", en: "Dumbbell bench press" }, target: { zh: "胸肌 · 肱三头肌", en: "Chest · Triceps" }, cue: { zh: "手腕保持稳定，哑铃在胸部两侧下落。", en: "Keep wrists stacked and lower the dumbbells beside the chest." }, asset: "0289-SpYC0Kp", equipment: "dumbbell" },
  pullup: { id: "pullup", name: { zh: "辅助引体向上", en: "Assisted pull-up" }, target: { zh: "背阔肌 · 肱二头肌", en: "Lats · Biceps" }, cue: { zh: "先下沉肩胛骨，再把胸口拉向横杆。", en: "Depress the shoulder blades before pulling the chest to the bar." }, asset: "0017-kiJ4Z2K", equipment: "gym" },
};

const CORE_PATTERNS: Record<string, MovementPattern> = {
  bench: "push_h", squat: "squat", deadlift: "hinge", curl: "iso_biceps", hammer: "iso_biceps",
  pushdown: "iso_triceps", row: "pull_h", pulldown: "pull_v", shoulder: "push_v", lateral: "iso_shoulder",
  dumbbellRow: "pull_h", dumbbellDeadlift: "hinge", deadBug: "core", lunge: "lunge",
  closePushup: "push_h", dumbbellBench: "push_h", pullup: "pull_v",
};

// Full plannable library: reviewed pool entries plus the curated core. Curated
// entries win on id collisions so their hand-written cues are preserved.
export const EXERCISES: Record<string, Exercise> = {
  ...Object.fromEntries(EXERCISE_POOL.map((exercise) => [exercise.id, exercise])),
  ...CORE_EXERCISES,
};

export function exercisePattern(exerciseId: string): MovementPattern | null {
  return CORE_PATTERNS[exerciseId] || EXERCISE_POOL.find((exercise) => exercise.id === exerciseId)?.pattern || null;
}

// Same-pattern substitutes the user can actually perform — the basis for
// "equipment busy / movement hurts" swaps in plans and coach actions.
export function alternativesFor(exerciseId: string, equipment: Equipment, limit = 5): Exercise[] {
  const pattern = exercisePattern(exerciseId);
  if (!pattern) return [];
  const source = EXERCISES[exerciseId];
  return EXERCISE_POOL
    .filter((exercise) => exercise.pattern === pattern && exercise.id !== exerciseId && exercise.asset !== source?.asset && isExerciseAllowed(exercise, equipment))
    .slice(0, Math.max(1, limit));
}

const activityFactors: Record<Activity, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 };
const repByExperience: Record<Experience, { sets: number; reps: string; rest: string }> = {
  beginner: { sets: 3, reps: "10–12", rest: "75s" },
  intermediate: { sets: 4, reps: "8–12", rest: "75s" },
  advanced: { sets: 4, reps: "6–10", rest: "90s" },
};

type SessionSeed = { title: { zh: string; en: string }; focus: { zh: string; en: string }; exerciseIds: string[] };
const sessionLibraries: Record<Goal, SessionSeed[]> = {
  arms: [
    { title: { zh: "手臂线条 A", en: "Arm definition A" }, focus: { zh: "二头 · 三头 · 肩", en: "Biceps · Triceps · Delts" }, exerciseIds: ["curl", "pushdown", "hammer", "lateral", "deadBug"] },
    { title: { zh: "下肢与核心", en: "Lower body & core" }, focus: { zh: "维持全身代谢", en: "Total-body capacity" }, exerciseIds: ["squat", "deadlift", "lunge", "deadBug"] },
    { title: { zh: "推力与三头", en: "Push & triceps" }, focus: { zh: "胸 · 三头 · 前束", en: "Chest · Triceps · Front delts" }, exerciseIds: ["bench", "shoulder", "closePushup", "pushdown"] },
    { title: { zh: "拉力与二头", en: "Pull & biceps" }, focus: { zh: "背 · 二头 · 侧肩", en: "Back · Biceps · Side delts" }, exerciseIds: ["pulldown", "row", "curl", "hammer", "lateral"] },
    { title: { zh: "手臂泵感", en: "Arm pump" }, focus: { zh: "轻重量 · 高质量", en: "Light load · High quality" }, exerciseIds: ["dumbbellBench", "dumbbellRow", "curl", "closePushup"] },
    { title: { zh: "全身巩固", en: "Full-body practice" }, focus: { zh: "动作技术 · 体能", en: "Technique · Conditioning" }, exerciseIds: ["dumbbellDeadlift", "dumbbellBench", "dumbbellRow", "deadBug"] },
  ],
  fat_loss: [
    { title: { zh: "全身力量 A", en: "Full body A" }, focus: { zh: "大肌群 · 代谢", en: "Large muscles · Metabolism" }, exerciseIds: ["squat", "bench", "row", "deadBug"] },
    { title: { zh: "低冲击燃脂", en: "Low-impact conditioning" }, focus: { zh: "臀腿 · 核心", en: "Lower body · Core" }, exerciseIds: ["dumbbellDeadlift", "lunge", "shoulder", "deadBug"] },
    { title: { zh: "全身力量 B", en: "Full body B" }, focus: { zh: "拉力 · 后链", en: "Pull · Posterior chain" }, exerciseIds: ["deadlift", "pulldown", "dumbbellBench", "curl"] },
    { title: { zh: "密度训练", en: "Density session" }, focus: { zh: "短休息 · 全身", en: "Short rest · Total body" }, exerciseIds: ["closePushup", "dumbbellRow", "dumbbellDeadlift", "lateral"] },
    { title: { zh: "上肢与步行", en: "Upper body & walk" }, focus: { zh: "上肢 · Zone 2", en: "Upper body · Zone 2" }, exerciseIds: ["dumbbellBench", "dumbbellRow", "curl", "pushdown"] },
    { title: { zh: "核心恢复", en: "Core recovery" }, focus: { zh: "稳定性 · 活动度", en: "Stability · Mobility" }, exerciseIds: ["deadBug", "closePushup", "lunge"] },
  ],
  muscle: [
    { title: { zh: "上肢力量", en: "Upper strength" }, focus: { zh: "胸 · 背 · 肩", en: "Chest · Back · Delts" }, exerciseIds: ["bench", "row", "shoulder", "curl"] },
    { title: { zh: "下肢力量", en: "Lower strength" }, focus: { zh: "股四头 · 臀 · 后链", en: "Quads · Glutes · Posterior chain" }, exerciseIds: ["squat", "deadlift", "lunge", "deadBug"] },
    { title: { zh: "推力增肌", en: "Push hypertrophy" }, focus: { zh: "胸 · 肩 · 三头", en: "Chest · Delts · Triceps" }, exerciseIds: ["dumbbellBench", "shoulder", "lateral", "pushdown"] },
    { title: { zh: "拉力增肌", en: "Pull hypertrophy" }, focus: { zh: "背 · 二头", en: "Back · Biceps" }, exerciseIds: ["pullup", "pulldown", "dumbbellRow", "hammer"] },
    { title: { zh: "臀腿容量", en: "Leg volume" }, focus: { zh: "臀肌 · 腘绳肌", en: "Glutes · Hamstrings" }, exerciseIds: ["squat", "dumbbellDeadlift", "lunge", "deadBug"] },
    { title: { zh: "弱项强化", en: "Weak-point session" }, focus: { zh: "肩 · 手臂 · 核心", en: "Delts · Arms · Core" }, exerciseIds: ["lateral", "curl", "pushdown", "deadBug"] },
  ],
  strength: [
    { title: { zh: "深蹲日", en: "Squat day" }, focus: { zh: "下肢力量", en: "Lower-body strength" }, exerciseIds: ["squat", "lunge", "deadBug"] },
    { title: { zh: "卧推日", en: "Bench day" }, focus: { zh: "上肢推力", en: "Upper-body push" }, exerciseIds: ["bench", "shoulder", "pushdown"] },
    { title: { zh: "硬拉日", en: "Hinge day" }, focus: { zh: "后链力量", en: "Posterior-chain strength" }, exerciseIds: ["deadlift", "row", "curl"] },
    { title: { zh: "上肢综合", en: "Upper accessory" }, focus: { zh: "背 · 肩 · 手臂", en: "Back · Delts · Arms" }, exerciseIds: ["pullup", "dumbbellBench", "lateral", "hammer"] },
    { title: { zh: "技术练习", en: "Technique practice" }, focus: { zh: "轻重量 · 高控制", en: "Light load · Control" }, exerciseIds: ["squat", "bench", "deadBug"] },
    { title: { zh: "身体准备", en: "General preparation" }, focus: { zh: "稳定性 · 体能", en: "Stability · Capacity" }, exerciseIds: ["dumbbellDeadlift", "dumbbellRow", "closePushup"] },
  ],
  recomp: [
    { title: { zh: "上肢塑形", en: "Upper sculpt" }, focus: { zh: "胸 · 背 · 手臂", en: "Chest · Back · Arms" }, exerciseIds: ["dumbbellBench", "dumbbellRow", "curl", "pushdown"] },
    { title: { zh: "下肢塑形", en: "Lower sculpt" }, focus: { zh: "臀腿 · 核心", en: "Glutes · Legs · Core" }, exerciseIds: ["squat", "dumbbellDeadlift", "lunge", "deadBug"] },
    { title: { zh: "推拉力量", en: "Push-pull strength" }, focus: { zh: "上肢复合动作", en: "Compound upper body" }, exerciseIds: ["bench", "pulldown", "shoulder", "row"] },
    { title: { zh: "全身密度", en: "Full-body density" }, focus: { zh: "肌肉 · 心肺", en: "Muscle · Cardio" }, exerciseIds: ["closePushup", "dumbbellRow", "dumbbellDeadlift", "lateral"] },
    { title: { zh: "臀腿与手臂", en: "Legs & arms" }, focus: { zh: "均衡线条", en: "Balanced definition" }, exerciseIds: ["lunge", "curl", "pushdown", "deadBug"] },
    { title: { zh: "恢复训练", en: "Recovery session" }, focus: { zh: "活动度 · 核心", en: "Mobility · Core" }, exerciseIds: ["deadBug", "closePushup", "dumbbellDeadlift"] },
  ],
};

export function isExerciseAllowed(exercise: Exercise, equipment: Equipment): boolean {
  if (equipment === "gym") return true;
  if (equipment === "dumbbell") return exercise.equipment === "dumbbell" || exercise.equipment === "bodyweight";
  return exercise.equipment === "bodyweight";
}

function adaptExercise(exercise: Exercise, equipment: Equipment): Exercise {
  if (isExerciseAllowed(exercise, equipment)) return exercise;
  if (equipment === "bodyweight") return EXERCISES.closePushup;
  if (["squat", "deadlift", "lunge"].includes(exercise.id)) return EXERCISES.dumbbellDeadlift;
  if (["row", "pulldown", "pullup"].includes(exercise.id)) return EXERCISES.dumbbellRow;
  if (exercise.id === "bench") return EXERCISES.dumbbellBench;
  if (exercise.id === "pushdown") return EXERCISES.closePushup;
  if (exercise.id === "lateral") return EXERCISES.shoulder;
  return EXERCISES.deadBug;
}

function trainingSlots(days: number): number[] {
  const slots: Record<number, number[]> = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 5], 5: [0, 1, 3, 4, 5], 6: [0, 1, 2, 3, 4, 5] };
  return slots[Math.min(6, Math.max(2, days))] ?? slots[4];
}

function variantsForDay(day: WorkoutDay): WorkoutDay["variants"] {
  const exerciseIds = day.exercises.map((exercise) => exercise.id);
  return {
    short: {
      duration: Math.min(20, day.duration),
      exerciseIds: exerciseIds.slice(0, Math.max(1, Math.min(2, exerciseIds.length))),
      note: { zh: "保留最重要的动作，完成比完美更重要。", en: "Keep the highest-value movements; completion matters more than perfection." },
    },
    recovery: {
      duration: Math.min(20, day.duration),
      exerciseIds: exerciseIds.slice(0, 1),
      intensityScale: 0.7,
      note: { zh: "降低强度并优先动作质量；疼痛达到 4/10 时停止相关动作。", en: "Reduce intensity and prioritize control; stop the movement if pain reaches 4/10." },
    },
  };
}

export function decoratePlanSchedule(profile: Profile, schedule: WorkoutDay[]): Pick<CoachPlan, "phase" | "schedule"> {
  const track = resolveTrainingTrack(profile);
  const phase: PlanPhase = track === "beginner_fat_loss"
    ? { kind: "habit_foundation", lengthWeeks: 4, currentWeek: 1, weeklyFocus: [
        { zh: "熟悉动作与建立记录习惯", en: "Learn movements and build a logging habit" },
        { zh: "稳定训练频率与日常活动", en: "Stabilize training frequency and daily activity" },
        { zh: "恢复允许时小幅进阶", en: "Progress gently when recovery allows" },
        { zh: "复盘执行并规划下一阶段", en: "Review adherence and plan the next phase" },
      ] }
    : track === "intermediate_hypertrophy"
      ? { kind: "hypertrophy_build", lengthWeeks: 6, currentWeek: 1, weeklyFocus: [
          { zh: "建立训练量与动作基线", en: "Establish volume and movement baselines" },
          { zh: "在目标 RIR 内增加有效次数", en: "Add productive reps within target RIR" },
          { zh: "稳定主要动作的负荷", en: "Stabilize loads on primary lifts" },
          { zh: "根据恢复调整薄弱部位训练量", en: "Adjust weak-point volume around recovery" },
          { zh: "验证渐进负荷与完成率", en: "Validate progressive overload and adherence" },
          { zh: "阶段复盘或减量", en: "Review the phase or deload" },
        ] }
      : { kind: "general_build", lengthWeeks: 4, currentWeek: 1, weeklyFocus: [
          { zh: "建立训练基线", en: "Establish a training baseline" },
          { zh: "稳定执行", en: "Build consistency" },
          { zh: "小幅进阶", en: "Progress gradually" },
          { zh: "阶段复盘", en: "Review the phase" },
        ] };
  return { phase, schedule: schedule.map((day) => ({ ...day, variants: variantsForDay(day) })) };
}

function buildSchedule(profile: Profile): WorkoutDay[] {
  const track = resolveTrainingTrack(profile);
  const allowedDays = track === "beginner_fat_loss" ? Math.min(4, profile.days) : profile.days;
  const slots = trainingSlots(allowedDays);
  const library = sessionLibraries[profile.goal];
  const prescription = repByExperience[profile.experience];
  let sessionCursor = 0;
  return Array.from({ length: 7 }, (_, dayIndex) => {
    if (!slots.includes(dayIndex)) {
      return { dayIndex, title: { zh: "恢复日", en: "Recovery day" }, focus: { zh: "步行 30 分钟 · 拉伸 8 分钟", en: "30-min walk · 8-min mobility" }, duration: 30, exercises: [], restDay: true };
    }
    const seed = library[sessionCursor++ % library.length];
    const unique = new Map<string, Exercise>();
    seed.exerciseIds.forEach((id) => {
      const adapted = adaptExercise(EXERCISES[id], profile.equipment);
      unique.set(adapted.id, adapted);
    });
    const exercises = Array.from(unique.values()).map((exercise, index) => ({
      ...exercise,
      sets: track === "beginner_fat_loss" ? (index < 2 ? 3 : 2) : index === 0 && profile.experience === "beginner" ? 3 : prescription.sets,
      reps: exercise.id === "deadBug" ? "8/side" : prescription.reps,
      rest: track === "beginner_fat_loss" ? "60–75s" : prescription.rest,
      restSeconds: track === "beginner_fat_loss" ? 60 : profile.experience === "advanced" ? 90 : 75,
      targetRir: track === "beginner_fat_loss" ? null : profile.experience === "advanced" ? 1 : 2,
      progression: track === "beginner_fat_loss"
        ? { zh: "动作稳定后再增加次数或难度。", en: "Add reps or difficulty only after the movement feels stable." }
        : { zh: "达到次数上限且保留目标 RIR 时，下次负重最多增加 5%。", en: "At the top of the rep range and target RIR, add no more than 5% next time." },
    }));
    const requestedDuration = Math.max(20, Math.min(120, Number(profile.sessionMinutes || 50)));
    return { dayIndex, title: seed.title, focus: seed.focus, duration: Math.min(requestedDuration, 38 + exercises.length * 3), exercises };
  });
}

export function generatePlan(profile: Profile): CoachPlan {
  const track = resolveTrainingTrack(profile);
  const weight = Math.max(35, profile.weight);
  const height = Math.max(130, profile.height);
  const age = Math.max(16, profile.age);
  const sexOffset = profile.sex === "male" ? 5 : -161;
  const bmr = 10 * weight + 6.25 * height - 5 * age + sexOffset;
  const tdee = bmr * activityFactors[profile.activity];
  let calorieDelta = 0;
  if (profile.goal === "fat_loss") calorieDelta = -Math.min(700, Math.max(300, weight * 5.5));
  if (profile.goal === "arms") calorieDelta = profile.targetWeight < weight ? -250 : 0;
  if (profile.goal === "muscle") calorieDelta = profile.experience === "beginner" ? 250 : 180;
  if (profile.goal === "strength") calorieDelta = 120;
  const minimum = profile.sex === "female" ? 1200 : 1500;
  const calories = Math.max(minimum, Math.round((tdee + calorieDelta) / 10) * 10);
  calorieDelta = calories - Math.round(tdee);
  let weeks = 12;
  const difference = Math.abs(profile.targetWeight - weight);
  if (profile.goal === "fat_loss" && difference > 0) weeks = Math.max(6, Math.ceil((difference * 7700) / (Math.max(1, Math.abs(calorieDelta)) * 7)));
  else if (profile.goal === "muscle" && difference > 0) weeks = Math.max(10, Math.ceil(difference / Math.max(0.12, weight * 0.0025)));
  else if (profile.goal === "strength") weeks = 8;
  else if (profile.goal === "arms") weeks = 10;
  weeks = Math.min(52, weeks);
  const proteinMultiplier = profile.goal === "muscle" ? 2 : profile.goal === "fat_loss" ? 1.9 : 1.7;
  const protein = Math.round(weight * proteinMultiplier);
  const fat = Math.round(weight * 0.8);
  const carbs = Math.max(70, Math.round((calories - protein * 4 - fat * 9) / 4));
  const staged = decoratePlanSchedule(profile, buildSchedule(profile));
  return {
    bmr: Math.round(bmr), tdee: Math.round(tdee), calories, calorieDelta,
    bmi: Number((weight / ((height / 100) ** 2)).toFixed(1)), weeks, protein, carbs, fat,
    schedule: staged.schedule, phase: staged.phase, confidence: profile.limitations.trim() ? "medium" : "high", track,
  };
}

export const defaultProfile: Profile = {
  sex: "female", age: 28, height: 165, weight: 60, targetWeight: 56,
  activity: "light", goal: "fat_loss", experience: "beginner", days: 3,
  equipment: "bodyweight", limitations: "", sessionMinutes: 30, trainingLocation: "home",
  dietaryPreference: "balanced", exclusions: "", trainingTrack: "beginner_fat_loss",
  beginnerBarrier: "confidence", trainingAgeMonths: 0, currentSplit: "", weakPoints: "", acceptsWeightGain: false,
};
