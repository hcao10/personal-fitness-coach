// Copy for app/onboarding. Chinese is the schema: a key added here must be
// added to onboarding.en.ts or the build fails.
export const onboardingZh = {
  // Step rail down the left of the intake.
  stepStart: "开始",
  stepGoal: "目标",
  stepBody: "身体资料",
  stepTraining: "训练条件",
  stepSafety: "安全与限制",
  stepDiet: "饮食偏好",
  stepConfirm: "确认",

  // Page chrome.
  eyebrow: "WELCOME / 建立训练档案",
  title: "先了解你，再规划训练",
  skip: "稍后再说",
  loading: "正在恢复你的训练资料…",

  // Status and validation messages under the card.
  saveFailed: "暂时无法保存，请重试。",
  consentRequired: "请先确认健康免责声明和数据处理说明。",
  completeFailed: "资料确认失败，请重试。",
  planFailed: "资料已经保存。AI 暂时无法生成计划，你可以稍后从“今日”重试。",

  // Step 0 — welcome.
  welcomeTitle: "让计划适合你的生活，而不是让生活迁就计划。",
  welcomeBody: "你可以逐步填写，也可以稍后继续。只有在最后确认后，我们才会生成完整计划。",
  welcomeCta: "开始建立计划",

  // Step 1 — track and goal.
  goalTitle: "选择最适合你的起点",
  goalNote: "两条路径共用记录和 Coach，你可以之后随时切换。",
  trackBeginnerBadge: "核心路径",
  trackBeginnerName: "新手日常减脂",
  trackBeginnerBlurb: "从今天做什么、吃多少开始，先建立可以长期坚持的节奏。",
  trackAdvancedBadge: "专业路径",
  trackAdvancedName: "中级系统增肌",
  trackAdvancedBlurb: "按组记录、渐进负荷、肌群训练量与周期复盘。",
  currentTrack: "当前选择：{track}",
  trackShortBeginner: "新手减脂",
  trackShortAdvanced: "中级增肌",
  goalFatLoss: "减脂",
  goalMuscle: "增肌",
  goalRecomp: "塑形",
  goalArms: "手臂线条",
  goalStrength: "力量",

  // Step 2 — body basics.
  bodyTitle: "身体基础资料",
  bodyNote: "用于计算基础代谢、训练强度和安全范围。",
  sexFemale: "女性",
  sexMale: "男性",
  ageLabel: "年龄",
  heightLabel: "身高 cm",
  weightLabel: "体重 kg",
  targetWeightLabel: "目标体重 kg",

  // Step 3 — training conditions.
  conditionsTitle: "你的训练条件",
  conditionsNote: "真实可执行，比理想化计划更重要。",
  experienceLabel: "训练经验",
  experienceBeginner: "新手",
  experienceIntermediate: "进阶",
  experienceAdvanced: "高级",
  equipmentLabel: "可用器械",
  equipmentBodyweight: "徒手 / 居家",
  equipmentDumbbell: "哑铃",
  equipmentGym: "完整健身房",
  activityLabel: "日常活动",
  activitySedentary: "久坐",
  activityLight: "轻度活动",
  activityModerate: "中等活动",
  activityActive: "高活动量",
  sessionMinutesLabel: "单次时长",
  daysPerWeekLabel: "每周训练天数",
  barrierLabel: "你最需要解决的问题",
  barrierConfidence: "不知道怎么开始",
  barrierTime: "没有完整时间",
  barrierConsistency: "难以坚持",
  barrierFood: "饮食容易失控",
  barrierFeedback: "缺少反馈",
  preferredDurationLabel: "优先训练时长",
  durationMinutes: "{minutes} 分钟",
  trainingAgeLabel: "系统训练时间（月）",
  currentSplitLabel: "当前训练分化",
  currentSplitPlaceholder: "例如：上/下肢，推拉腿",
  weakPointsLabel: "希望优先提升的部位",
  weakPointsPlaceholder: "例如：背阔肌、三角肌中束",
  acceptsWeightGain: "接受增肌期缓慢增加体重",

  // Step 4 — safety and movement limits.
  safetyTitle: "安全与动作限制",
  safetyNote: "这不是诊断信息；它帮助系统避开不适合的动作。",
  limitationsLabel: "伤病、疼痛或需要避开的动作",
  limitationsPlaceholder: "例如：右膝旧伤，避免跳跃。没有可留空。",
  safetyWarning: "若出现胸痛、晕厥、呼吸困难、无法承重或持续加重的疼痛，请暂停训练并及时寻求专业医疗帮助。",

  // Step 5 — food preferences.
  dietTitle: "饮食偏好",
  dietNote: "可选信息，用于让建议更贴近日常生活。",
  dietBalanced: "均衡饮食",
  dietVegetarian: "素食",
  dietHighProtein: "高蛋白",
  dietNone: "暂不设置",
  exclusionsLabel: "忌口或不吃的食物",
  exclusionsPlaceholder: "可留空",

  // Step 6 — confirm and generate.
  confirmTitle: "确认后生成专属计划",
  confirmNote: "这些指标由确定性规则计算，完整训练安排由 AI 编排并再次通过安全校验。",
  summaryCalories: "每日热量",
  summaryProtein: "蛋白质",
  summaryWeeklyTraining: "每周训练",
  summaryCycle: "建议周期",
  unitDays: "天",
  unitWeeks: "周",
  startDateTitle: "计划从哪天开始？",
  startDateNote: "下午较晚完成建档时默认从明天开始。启用后系统会按真实日期逐日追踪，不再把周一固定当作第一天。",
  startToday: "今天",
  startTomorrow: "明天",
  startDateLabel: "计划开始日期",
  consentText: "我理解 Cmine Fit 提供一般训练与营养信息，不替代医疗诊断；出现异常疼痛时会停止相关训练。",

  // Footer navigation shared by every step.
  back: "← 返回",
  saving: "正在保存…",
  confirmAndGenerate: "确认并生成完整计划",
  saveAndContinue: "保存并继续",
} as const;
