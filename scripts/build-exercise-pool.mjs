// Generates packages/coach-core/src/exercise-pool.ts from data/exercises.json.
//
// This encodes the exercise-library review policy in one auditable place:
// which equipment families are plannable, which movements are excluded as
// high-risk for unsupervised users, how movements are classified into
// patterns, and how large each pattern bucket may grow. Media for selected
// exercises is copied into public/exercises (© Gym visual, see NOTICE.md).
//
// Run: node scripts/build-exercise-pool.mjs
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataset = JSON.parse(readFileSync(join(root, "data", "exercises.json"), "utf8"));

// ---------------------------------------------------------------------------
// Review policy
// ---------------------------------------------------------------------------

// Dataset equipment → coach-core equipment. Anything unlisted is not plannable.
const EQUIPMENT_MAP = {
  "body weight": "bodyweight",
  "dumbbell": "dumbbell",
  "barbell": "barbell",
  "cable": "cable",
  "leverage machine": "gym",
};

// Movements excluded from unsupervised AI plans. Reasons are part of the
// review record — keep them current when editing.
const RISK_EXCLUSIONS = [
  [/behind (the )?neck/i, "bar path behind the cervical spine"],
  [/good morning/i, "high spinal-load hinge, unforgiving technique"],
  [/guillotine/i, "bar over the throat"],
  [/jefferson|zercher/i, "niche high-skill barbell variations"],
  [/\bjump\b|jumping|plyo|hop\b/i, "impact loading needs coached progression"],
  [/pistol/i, "high-skill single-leg squat"],
  [/planche|handstand|muscle.?up|front lever|back lever|human flag|dragon flag/i, "advanced gymnastics skills"],
  [/snatch|clean|jerk\b/i, "olympic lifts need coaching"],
  [/overhead squat/i, "requires assessed mobility"],
  [/upright row/i, "common impingement complaint"],
  [/sissy squat/i, "high knee shear"],
  [/nordic/i, "very high eccentric hamstring demand"],
  [/deficit/i, "increased range beyond baseline mobility"],
  [/\bstretch\b|stretching/i, "mobility drills are not planned strength work"],
  [/superman push|archer|typewriter|one arm push[- ]?up/i, "advanced push-up skills"],
  [/suspend|ring\b/i, "requires suspension hardware"],
];

// name/target → movement pattern. First match wins; order matters.
const PATTERN_RULES = [
  ["pull_v", /pull[- ]?up|chin[- ]?up|pulldown|pull[- ]?down/i],
  ["pull_h", /\brow\b|rowing/i],
  ["push_v", /shoulder press|overhead press|military press|arnold press|press behind/i],
  ["push_h", /bench press|chest press|push[- ]?up|\bfly\b|\bflye\b|pec deck|chest dip|\bdip\b|pullover/i],
  ["hinge", /deadlift|hip thrust|glute bridge|pull[- ]?through|hyperextension|back extension|reverse hyper/i],
  ["lunge", /lunge|split squat|step[- ]?up/i],
  ["squat", /squat|leg press|hack/i],
  ["iso_biceps", /curl/i, (e) => ["biceps", "forearms"].includes(e.target)],
  ["iso_legs", /leg curl|leg extension|calf raise|calf press|abduction|adduction/i],
  ["iso_triceps", /extension|push[- ]?down|kick[- ]?back|skull/i, (e) => e.target === "triceps"],
  ["iso_shoulder", /lateral raise|front raise|rear delt|reverse fly|face pull|shrug/i],
  ["core", /crunch|sit[- ]?up|plank|twist|leg raise|knee raise|dead bug|bird dog|hollow|side bend|woodchop|rollout|mountain climber/i],
];
// target-based fallback when the name matched nothing.
const TARGET_FALLBACK = { abs: "core", spine: "core", biceps: "iso_biceps", triceps: "iso_triceps", delts: "iso_shoulder", calves: "iso_legs" };

// How many exercises each pattern may contribute.
const PATTERN_QUOTA = {
  push_h: 20, push_v: 12, pull_h: 18, pull_v: 12,
  squat: 15, hinge: 15, lunge: 10, core: 18,
  iso_biceps: 10, iso_triceps: 10, iso_shoulder: 10, iso_legs: 12,
};

// Canonical movements ranked first inside their bucket.
const PRIORITY = [
  "barbell bench press", "dumbbell bench press", "push-up", "incline barbell bench press", "incline dumbbell bench press",
  "cable seated row", "barbell bent over row", "dumbbell row", "lever seated row",
  "cable pulldown", "lat pulldown", "pull up", "assisted pull-up",
  "barbell full squat", "barbell squat", "dumbbell goblet squat", "sled 45° leg press", "lever leg extension",
  "barbell deadlift", "barbell romanian deadlift", "dumbbell romanian deadlift", "barbell hip thrust", "glute bridge",
  "dumbbell lunge", "barbell lunge", "dumbbell single leg split squat", "dumbbell step-up",
  "dumbbell shoulder press", "barbell seated overhead press", "dumbbell lateral raise", "cable lateral raise",
  "dumbbell biceps curl", "barbell curl", "dumbbell hammer curl", "cable curl",
  "cable pushdown", "dumbbell standing triceps extension", "bench dip",
  "crunch", "plank", "hanging knee raise", "russian twist", "dead bug",
  "lever seated leg curl", "lever standing calf raise", "dumbbell standing calf raise",
];

// Media ids already covered by the hand-curated seventeen in coach-core.
const CURATED_DATASET_IDS = new Set(["0025", "0043", "0085", "0294", "0298", "0201", "0180", "2330", "0361", "0178", "0293", "1459", "0276", "0054", "0259", "0289", "0017"]);

// ---------------------------------------------------------------------------
// Chinese naming: ordered phrase dictionary (longest phrases first).
// ---------------------------------------------------------------------------
const PHRASES = [
  ["bulgarian split squat", "保加利亚分腿蹲"], ["romanian deadlift", "罗马尼亚硬拉"], ["stiff leg deadlift", "直腿硬拉"],
  ["straight leg deadlift", "直腿硬拉"], ["sumo deadlift", "相扑硬拉"], ["deadlift", "硬拉"],
  ["bench press", "卧推"], ["chest press", "推胸"], ["floor press", "地板卧推"],
  ["push-up", "俯卧撑"], ["push up", "俯卧撑"], ["pec deck fly", "蝴蝶机夹胸"], ["fly", "飞鸟"], ["flye", "飞鸟"],
  ["pullover", "仰卧上拉"], ["chest dip", "双杠臂屈伸"], ["bench dip", "凳上臂屈伸"], ["triceps dip", "双杠臂屈伸"], ["dip", "臂屈伸"],
  ["bent over row", "俯身划船"], ["seated row", "坐姿划船"], ["upright row", "直立划船"], ["high row", "高位划船"], ["low row", "低位划船"], ["t-bar row", "T杠划船"], ["row", "划船"],
  ["lat pulldown", "高位下拉"], ["pulldown", "下拉"], ["pull-up", "引体向上"], ["pull up", "引体向上"], ["chin-up", "反手引体向上"], ["chin up", "反手引体向上"],
  ["shoulder press", "肩上推举"], ["overhead press", "站姿推举"], ["military press", "站姿推举"], ["arnold press", "阿诺德推举"],
  ["lateral raise", "侧平举"], ["front raise", "前平举"], ["rear delt fly", "反向飞鸟"], ["reverse fly", "反向飞鸟"], ["rear delt row", "后束划船"], ["face pull", "面拉"], ["shrug", "耸肩"],
  ["preacher curl", "牧师凳弯举"], ["concentration curl", "集中弯举"], ["hammer curl", "锤式弯举"], ["reverse curl", "反握弯举"], ["wrist curl", "腕弯举"], ["drag curl", "拖拽弯举"], ["curl", "弯举"],
  ["triceps extension", "三头肌屈伸"], ["skullcrusher", "仰卧臂屈伸"], ["pushdown", "下压"], ["push down", "下压"], ["kickback", "俯身臂屈伸"],
  ["goblet squat", "高脚杯深蹲"], ["front squat", "前蹲"], ["hack squat", "哈克深蹲"], ["full squat", "深蹲"], ["split squat", "分腿蹲"], ["squat", "深蹲"],
  ["leg press", "腿举"], ["leg extension", "腿屈伸"], ["leg curl", "腿弯举"], ["calf raise", "提踵"], ["calf press", "提踵"],
  ["hip thrust", "臀推"], ["glute bridge", "臀桥"], ["pull through", "跪姿拉髋"], ["hyperextension", "山羊挺身"], ["back extension", "背屈伸"],
  ["hip abduction", "髋外展"], ["hip adduction", "髋内收"], ["abduction", "外展"], ["adduction", "内收"],
  ["lunge", "弓步"], ["step-up", "登台阶"], ["step up", "登台阶"],
  ["sit-up", "仰卧起坐"], ["sit up", "仰卧起坐"], ["crunch", "卷腹"], ["plank", "平板支撑"], ["russian twist", "俄罗斯转体"], ["twist", "转体"],
  ["leg raise", "举腿"], ["knee raise", "举膝"], ["dead bug", "死虫式"], ["bird dog", "鸟狗式"], ["side bend", "侧屈"], ["mountain climber", "登山者"], ["rollout", "健腹轮前滚"],
  ["raise", "平举"],
];
const MODIFIERS = [
  ["alternating", "交替"], ["alternate", "交替"], ["single arm", "单臂"], ["one arm", "单臂"], ["single-arm", "单臂"], ["one-arm", "单臂"],
  ["single leg", "单腿"], ["one leg", "单腿"], ["single-leg", "单腿"], ["two arm", "双臂"],
  ["close grip", "窄距"], ["close-grip", "窄距"], ["wide grip", "宽距"], ["wide-grip", "宽距"], ["reverse grip", "反握"], ["neutral grip", "对握"], ["underhand", "反握"], ["overhand", "正握"],
  ["incline", "上斜"], ["decline", "下斜"], ["seated", "坐姿"], ["standing", "站姿"], ["lying", "仰卧"], ["prone", "俯卧"], ["kneeling", "跪姿"], ["bent over", "俯身"], ["bent-over", "俯身"],
  ["cross body", "交叉"], ["cross-body", "交叉"], ["walking", "行走"], ["side", "侧向"], ["front", "正面"], ["rear", "后侧"], ["assisted", "辅助"], ["weighted", "负重"],
  ["barbell", "杠铃"], ["dumbbell", "哑铃"], ["cable", "绳索"], ["lever", "器械"], ["leverage machine", "器械"], ["machine", "器械"], ["smith", "史密斯"],
  ["rope", "绳索把"], ["v-bar", "V杠"], ["straight bar", "直杠"], ["45°", "45度"], ["90°", "90度"],
];

function translateName(name) {
  let value = ` ${name.toLowerCase()} `;
  const out = { prefix: "", core: "" };
  for (const [en, zh] of PHRASES) {
    const token = ` ${en} `;
    if (value.includes(token) || value.endsWith(` ${en} `.trimEnd() + " ")) {
      if (value.includes(token)) { value = value.replace(token, " "); out.core = zh; break; }
    }
  }
  if (!out.core) {
    for (const [en, zh] of PHRASES) {
      if (value.trimEnd().endsWith(` ${en}`)) { value = value.replace(new RegExp(` ${en}(?= |$)`), " "); out.core = zh; break; }
    }
  }
  if (!out.core) return null;
  for (const [en, zh] of MODIFIERS) {
    const token = ` ${en} `;
    while (value.includes(token)) { value = value.replace(token, " "); out.prefix += zh; }
  }
  const leftover = value.replace(/[()\/.\-]/g, " ").trim();
  if (leftover) return null; // untranslated tokens → not selectable
  return `${out.prefix}${out.core}`;
}

// ---------------------------------------------------------------------------
// Classification helpers
// ---------------------------------------------------------------------------
const TARGET_ZH = {
  pectorals: "胸肌", biceps: "肱二头肌", triceps: "肱三头肌", delts: "三角肌", lats: "背阔肌",
  "upper back": "上背", traps: "斜方肌", abs: "腹部核心", spine: "下背核心", glutes: "臀肌",
  quads: "股四头肌", hamstrings: "腘绳肌", calves: "小腿", forearms: "前臂", adductors: "大腿内侧", abductors: "臀中肌", "serratus anterior": "前锯肌",
};
const TARGET_EN = {
  pectorals: "Chest", biceps: "Biceps", triceps: "Triceps", delts: "Delts", lats: "Lats",
  "upper back": "Upper back", traps: "Traps", abs: "Core", spine: "Lower back · Core", glutes: "Glutes",
  quads: "Quads", hamstrings: "Hamstrings", calves: "Calves", forearms: "Forearms", adductors: "Adductors", abductors: "Glute med", "serratus anterior": "Serratus",
};

function classify(entry) {
  for (const [pattern, regex, extra] of PATTERN_RULES) {
    if (regex.test(entry.name) && (!extra || extra(entry))) return pattern;
  }
  return TARGET_FALLBACK[entry.target] || null;
}

function difficulty(entry, pattern) {
  if (/pull[- ]?up|chin[- ]?up/i.test(entry.name) && !/assisted/i.test(entry.name)) return "advanced";
  if (entry.equipment === "barbell") return ["squat", "hinge"].includes(pattern) ? "intermediate" : "intermediate";
  if (/single|one arm|one leg|alternat/i.test(entry.name)) return "intermediate";
  return "beginner";
}

function firstSentence(text, max) {
  const sentence = String(text || "").split(/(?<=[。．.!?])/)[0]?.trim() || "";
  return sentence.length > max ? `${sentence.slice(0, max - 1)}…` : sentence;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
const excluded = [];
const candidates = [];
for (const entry of dataset) {
  const equipment = EQUIPMENT_MAP[entry.equipment];
  if (!equipment || entry.body_part === "neck" || entry.target === "cardiovascular system" || entry.category === "cardio") continue;
  if (CURATED_DATASET_IDS.has(entry.id)) continue;
  const risk = RISK_EXCLUSIONS.find(([regex]) => regex.test(entry.name));
  if (risk) { excluded.push(`${entry.name} — ${risk[1]}`); continue; }
  const pattern = classify(entry);
  if (!pattern) continue;
  const zhName = translateName(entry.name);
  if (!zhName) continue;
  const zhCue = firstSentence(entry.instructions?.zh, 60);
  const enCue = firstSentence(entry.instructions?.en, 110);
  if (!zhCue || !enCue) continue;
  if (!entry.image || !entry.gif_url) continue;
  if (!existsSync(join(root, entry.image)) || !existsSync(join(root, entry.gif_url))) continue;
  candidates.push({ entry, pattern, equipment, zhName, zhCue, enCue });
}

const priorityIndex = (name) => { const index = PRIORITY.indexOf(name.toLowerCase()); return index === -1 ? PRIORITY.length : index; };
const selected = [];
for (const [pattern, quota] of Object.entries(PATTERN_QUOTA)) {
  const bucket = candidates.filter((candidate) => candidate.pattern === pattern)
    .sort((a, b) => priorityIndex(a.entry.name) - priorityIndex(b.entry.name)
      || a.entry.name.split(" ").length - b.entry.name.split(" ").length
      || a.entry.id.localeCompare(b.entry.id));
  // Round-robin across equipment families so no bucket is all-machine or all-barbell.
  const byEquipment = new Map();
  for (const candidate of bucket) {
    if (!byEquipment.has(candidate.equipment)) byEquipment.set(candidate.equipment, []);
    byEquipment.get(candidate.equipment).push(candidate);
  }
  const queues = Array.from(byEquipment.values());
  const picked = [];
  let queueIndex = 0;
  while (picked.length < quota && queues.some((queue) => queue.length)) {
    const queue = queues[queueIndex % queues.length];
    queueIndex += 1;
    if (queue.length) picked.push(queue.shift());
  }
  selected.push(...picked);
}

selected.sort((a, b) => a.entry.id.localeCompare(b.entry.id));

for (const { entry } of selected) {
  const asset = `${entry.id}-${entry.media_id}`;
  copyFileSync(join(root, entry.image), join(root, "public", "exercises", `${asset}.jpg`));
  copyFileSync(join(root, entry.gif_url), join(root, "public", "exercises", `${asset}.gif`));
}

const rows = selected.map(({ entry, pattern, equipment, zhName, zhCue, enCue }) => {
  const record = {
    id: `ex${entry.id}`,
    name: { zh: zhName, en: entry.name },
    target: { zh: TARGET_ZH[entry.target] || entry.target, en: TARGET_EN[entry.target] || entry.target },
    cue: { zh: zhCue, en: enCue },
    asset: `${entry.id}-${entry.media_id}`,
    equipment,
    difficulty: difficulty(entry, pattern),
    muscles: [entry.target, ...(entry.secondary_muscles || []).slice(0, 3)],
    pattern,
  };
  return `  ${JSON.stringify(record)},`;
});

const output = `// AUTO-GENERATED by scripts/build-exercise-pool.mjs — do not edit by hand.
// Source: data/exercises.json (media © Gym visual, see NOTICE.md).
// ${selected.length} reviewed exercises; ${excluded.length} candidates excluded by risk policy.
import type { Exercise } from "./index";

export type MovementPattern = "push_h" | "push_v" | "pull_h" | "pull_v" | "squat" | "hinge" | "lunge" | "core" | "iso_biceps" | "iso_triceps" | "iso_shoulder" | "iso_legs";

export type PoolExercise = Exercise & { pattern: MovementPattern };

export const EXERCISE_POOL: PoolExercise[] = [
${rows.join("\n")}
];
`;
writeFileSync(join(root, "packages", "coach-core", "src", "exercise-pool.ts"), output);

console.log(`selected ${selected.length} exercises`);
const byPattern = {};
for (const { pattern } of selected) byPattern[pattern] = (byPattern[pattern] || 0) + 1;
console.log(JSON.stringify(byPattern, null, 1));
console.log(`excluded by risk policy: ${excluded.length}`);
