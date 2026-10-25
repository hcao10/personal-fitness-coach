// Copy for app/today. Chinese is the schema: a key added here must be
// added to today.en.ts or the build fails.
export const todayZh = {
  // Page chrome
  loading: "正在准备今天的训练…",
  eyebrow: "TODAY / 今日训练",
  greetingFallback: "你好",
  title: "{name}，今天按自己的节奏来",
  exerciseLibraryLink: "动作目录",
  askCoachLink: "询问 Coach ",

  // No active plan
  emptyTitle: "先建立一份真正适合你的计划",
  emptyBody: "完成 2–3 分钟建档后，系统会计算基础指标并由 AI 编排完整训练周期。",
  emptyCta: "开始建档 ",

  // Daily brief strip
  briefFromPlan: "根据当前计划",
  briefFromRecentLogs: "结合最近记录",
  currentPhase: "当前阶段",
  phaseWeek: "第 {current}/{total} 周",
  todayLabel: "今天",

  // Pre-training check-in
  checkinEyebrow: "TRAINING CHECK / 30 秒状态检查",
  checkinTitle: "先决定今天用哪个版本",
  checkinNote: "普通情况由安全规则即时处理，不消耗 Coach 消息额度。",
  energyLabel: "精力",
  sorenessLabel: "酸痛",
  painLabel: "明显疼痛",
  availableTimeLabel: "可用时间",
  availableTimeAria: "可用时间（分钟）",
  minutesValue: "{minutes} 分钟",
  checkinPending: "判断中…",
  checkinSubmit: "查看今天的建议 ",
  recommendationEyebrow: "今日建议",
  recheck: "重新检查",

  // Session variants
  versionsAria: "今日训练版本",
  modeStandard: "标准版",
  modeShort: "20 分钟缩短版",
  modeShortNote: "保留关键动作",
  modeRecovery: "恢复版",
  modeRecoveryNote: "降低总量与强度",
  rescheduleLabel: "改日完成",
  rescheduleConfirm: "确认改期",

  // Session header and rest day
  trackIntermediate: "中级增肌",
  trackBeginner: "新手减脂",
  restDayTitle: "恢复日",
  restDayBody: "轻松步行、活动度练习和充足睡眠，就是今天的计划。",

  // Fallbacks for plan content that is missing in the reader's language.
  // Shown instead of a blank line, and never instead of a safety instruction.
  sessionTitleFallback: "今日训练",
  sessionFocusFallback: "本次训练暂无重点说明。",
  exerciseNameFallback: "未命名动作",
  exerciseTargetFallback: "未标注目标部位",
  exerciseCueFallback: "该动作暂无要点说明。",
  exerciseProgressionFallback: "暂无进阶建议。",

  // Exercise card
  zoomExerciseAria: "放大查看 {name}",
  exerciseDemoAlt: "{name} 动作示范",
  zoom: "放大",
  exercisePrompt: "{name} 这个动作现在应该怎么做？",
  exerciseIssueLink: "动作不舒服或器械占用？",

  // Form cues and safety — reviewed copy, do not soften
  safetySummary: "动作要点与注意事项",
  cueLabel: "现在怎么做：",
  breathingLabel: "呼吸：",
  breathingBody: "动作困难阶段呼气，返回时吸气；全程保持躯干稳定，不憋气硬撑。",
  commonMistakesLabel: "常见错误：",
  commonMistakesBody: "不要借助惯性追求次数，也不要为了达到目标次数牺牲关节位置和动作范围。",
  stopConditionsLabel: "停止条件：",
  stopConditionsBody: "出现锐痛、麻木、眩晕、胸痛或无法稳定承重时立即停止。",

  // Set table
  colSet: "组",
  colType: "类型",
  colWeight: "重量 kg",
  colReps: "次数",
  colDone: "完成",
  setTypeAria: "第 {index} 组类型",
  setTypeWarmup: "热身",
  setTypeWorking: "正式",
  setTypeDropset: "递减",
  setTypeFailure: "力竭",
  setWeightAria: "第 {index} 组重量",
  setRepsAria: "第 {index} 组次数",
  setRirAria: "第 {index} 组剩余次数",
  weightPlaceholderLast: "上次",
  weightPlaceholderOptional: "可选",
  setComplete: "完成",
  setSummary: "{sets} 组 · {reps} 次 · 休息 {rest}",

  // Session feedback panel
  progressEyebrow: "训练进度",
  setsCompleted: "{completed}/{total} 组完成",
  restTimer: "休息计时",
  skip: "跳过",
  durationLabel: "训练时长",
  durationAria: "训练时长（分钟）",
  rpeLabel: "主观强度 RPE",
  painLevelLabel: "疼痛程度",
  painWarning: "请停止引发疼痛的动作。若疼痛持续或加重，请咨询专业人员。",
  updateLog: "更新训练记录 ",
  completeAndLog: "完成并记录训练 ",

  // Exercise media dialog
  closeModal: "关闭 ×",
  exerciseAnimatedAlt: "{name} 动作动态示范",
  mediaTip1: "先用可稳定控制的重量熟悉动作。",
  mediaTip2: "动作困难阶段呼气，返回时吸气。",
  mediaTip3: "出现锐痛、麻木或关节不稳定时立即停止。",
  mediaCoachPrompt: "请结合我的计划，讲解 {name} 的动作要点和替代动作。",
  mediaCoachLink: "让 Coach 结合我的情况讲解 ",

  // Notes written onto the saved session record
  noteShortVariant: "完成缩短版。",
  noteRecoveryVariant: "完成恢复版。",
  notePain: "疼痛 {pain}/10。",

  // Status messages
  setSaveFailed: "这组暂时没有保存成功，请再试一次。",
  checkinSaveFailed: "状态检查暂时没有保存，请重试。",
  logOneSetFirst: "请先至少记录一组训练，再完成今天的训练。",
  sessionLogged: "今天的训练已记录。Coach 会在周度复盘中使用组次和恢复反馈。",
  logFailed: "记录失败，请重试。",
  chooseNewDate: "请选择新的训练日期。",
  rescheduleFailed: "暂时无法修改训练日期。",
  rescheduled: "已改到 {date}。本周其他安排保持不变。",
} as const;
