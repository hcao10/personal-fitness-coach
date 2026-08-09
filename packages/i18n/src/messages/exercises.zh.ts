// Copy for app/exercises. Chinese is the schema: a key added here must be
// added to exercises.en.ts or the build fails.
//
// Exercise names, body parts, equipment labels and instruction steps are
// dataset content — they arrive from the API already carrying their own
// languages and deliberately do not live here.
export const exercisesZh = {
  metaTitle: "动作目录 · Cmine Fit",
  metaDescription: "按部位、器械和名称查找动作与安全要点。",

  eyebrow: "EXERCISE CATALOG / 动作目录",
  title: "看懂动作，再开始训练",
  backToToday: "返回今日训练",

  searchPlaceholder: "搜索动作、肌群或部位",
  searchAction: "搜索",
  equipmentAll: "全部器械",
  equipmentBodyweight: "徒手",
  equipmentDumbbell: "哑铃",
  equipmentBarbell: "杠铃",
  equipmentCable: "绳索",
  equipmentBand: "弹力带",
  equipmentMachine: "固定器械",
  catalogNote: "目录收录 {count} 个动作可供浏览；AI 训练计划当前使用其中经过安全审核的动作子集。目录中的动作不会未经确认直接替换你的计划。",
  loading: "正在加载动作目录…",

  demoAlt: "{name} 动作示范",
  primaryTarget: "主要目标：{target}",
  supportingMuscles: "协同肌群：{muscles}",
  // Separator between muscle names; Chinese uses the enumeration comma.
  muscleSeparator: "、",
  notSpecified: "未标注",
  askCoachToSwap: "请 Coach 判断能否替换 →",
  // Prefilled into the Coach composer, so the reader sees it as their own words.
  swapPrompt: "我想把当前动作替换为 {name}，请根据我的计划、器械和动作限制判断是否适合。",
} as const;
