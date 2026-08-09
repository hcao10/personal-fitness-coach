// Copy for app/account. Chinese is the schema: a key added here must be
// added to account.en.ts or the build fails.
//
// Mostly flat: related keys share a prefix rather than nest. `translator()` and
// `MessageKey` resolve a dotted path at any depth, so grouping is kept for the
// case where several values are one message — the plural forms of a counted
// noun, which English distinguishes and Chinese does not.
export const accountZh = {
  // Page metadata (browser tab, search results).
  metaTitle: "我的训练 · Cmine Fit",
  metaDescription: "查看你的计划、训练进度和身体记录。",

  // Loading and signed-out states.
  loading: "正在整理你的训练记录…",
  // The eyebrow above the signed-out headline. Unlike the 01/02 rail numbers it
  // is a tagline carrying meaning, not a typographic ornament, so it is copy.
  signinEyebrow: "你的训练，前后连贯",
  signinTitleA: "让每一次训练",
  signinTitleB: "都接得上下一次。",
  signinText: "使用 Cmine ID 登录后，你的计划、完成记录、身体变化和下一次调整会安全保存在同一个地方。",
  signinButton: "使用 Cmine ID 登录",
  signinBackHome: "先返回首页",

  // Section names. Each one labels both a rail link and the panel heading it
  // jumps to, so they are one key rather than two.
  todayTraining: "今日训练",
  nutritionLog: "饮食记录",
  bodyProgress: "身体进度",
  planHistory: "计划历史",
  trainingProfile: "训练档案",
  membership: "专业计划",
  accountAndData: "账号与数据",

  // Rail and top bar.
  userFallbackName: "Cmine Fit 用户",
  title: "我的训练",
  newPlan: "生成新计划",
  signOut: "安全退出",

  // Hero. A reader whose account carries no name gets their own greeting: a
  // stand-in *name* has to describe the reader in the third person, which is
  // not what "欢迎回来，…" or "Welcome back, …" is addressing.
  welcomeBack: "欢迎回来，{name}",
  welcomeBackNoName: "欢迎回来，今天也在进步的你",
  heroRestTitle: "今天，把恢复也认真完成。",
  heroNoPlanTitle: "从第一份专属计划开始。",
  heroNoPlanFocus: "更新训练档案后，让 AI 根据你的目标和现实条件安排完整一周。",
  // For a plan that exists but carries no focus text in any language. The
  // no-plan line above would be untrue for someone who does have a plan.
  heroFocusFallback: "这份计划没有写今天的重点，按训练内容完成即可。",
  heroViewToday: "查看今日训练",
  createFirstPlan: "生成第一份计划",
  restDay: "恢复日",
  restDayFocus: "轻松活动 · 睡眠优先",
  // A counted noun is a group of plural forms rather than one string, because
  // English needs "1 exercise" against "2 exercises" and `plural()` picks the
  // form. Chinese has a single plural category, so both forms carry the same
  // text; the repetition is what keeps one key set across every locale.
  exerciseCount: { one: "{count} 个动作", other: "{count} 个动作" },

  // Metric tiles.
  metricWorkouts: "完成训练",
  metricWorkoutsHint: "已保存的训练日",
  metricExercises: "完成动作",
  metricExercisesHint: "逐项同步记录",
  metricMeasurements: "身体记录",
  metricMeasurementsHint: "用于观察长期趋势",
  metricIntake: "今日摄入",
  metricProtein: "{grams}g 蛋白质",

  // Training feedback.
  feedbackTitle: "训练反馈",
  feedbackIntro: "记录强度、疼痛和完成情况，专业版会把这些变化用于下一周期。",
  feedbackDuration: "训练时长",
  feedbackRpe: "主观强度 RPE",
  feedbackPain: "训练中出现疼痛或不适",
  notes: "备注",
  feedbackNotesPlaceholder: "例如：睡眠不足、右肩紧张、动作状态很好",
  saving: "正在保存…",
  saveFeedback: "保存今天的反馈",

  // Plan history.
  planHistoryIntro: "每次生成都会保留当时的身体资料、模型版本和完整计划。",
  planFallbackTitle: "专属训练计划",
  planSummaryFallback: "{days} 个训练日 · {calories} kcal",
  planWeeks: { one: "{count} 周", other: "{count} 周" },
  planHistoryEmpty: "还没有保存的计划。",

  // Body progress.
  progressIntro: "看长期趋势，不被某一天的波动打乱节奏。",
  measurementFormTitle: "记录今天",
  measureWeight: "体重",
  measureBodyFat: "体脂",
  measureWaist: "腰围",
  measureArm: "臂围",
  measurementNotePlaceholder: "例如：晨起、空腹测量",
  saveMeasurement: "保存身体记录",
  weightTrend: "体重趋势",
  weightTrendPending: "记录两次后显示",
  measurementsEmpty: "第一次记录后，趋势会从这里开始。",

  // Training profile editor.
  profileIntro: "更新后会用于下一次 AI 规划，不会改写已有计划。",
  profileSex: "生理性别",
  sexFemale: "女性",
  sexMale: "男性",
  profileAge: "年龄",
  profileHeight: "身高 cm",
  profileWeight: "体重 kg",
  profileTargetWeight: "目标体重 kg",
  profileGoal: "训练目标",
  goalFatLoss: "减脂",
  goalMuscle: "增肌",
  goalRecomp: "塑形",
  goalArms: "手臂线条",
  goalStrength: "提升力量",
  profileActivity: "日常活动",
  activitySedentary: "久坐为主",
  activityLight: "轻度活动",
  activityModerate: "中等活动",
  activityActive: "高活动量",
  profileExperience: "训练经验",
  experienceBeginner: "新手",
  experienceIntermediate: "进阶",
  experienceAdvanced: "高级",
  profileEquipment: "可用器械",
  equipmentBodyweight: "徒手 / 居家",
  equipmentDumbbell: "哑铃",
  equipmentGym: "完整健身房",
  profileDays: "每周训练",
  daysOption: "{count} 天",
  profileSessionMinutes: "单次训练时长",
  profileLocation: "训练地点",
  locationHome: "居家",
  locationGym: "健身房",
  locationOutdoors: "户外",
  locationMixed: "多个地点",
  profileDiet: "饮食偏好",
  dietBalanced: "均衡饮食",
  dietVegetarian: "素食",
  dietHighProtein: "高蛋白",
  dietNone: "暂不设置",
  profileExclusions: "忌口、过敏或不吃的食物",
  profileLimitations: "伤病、疼痛或需要避开的动作",
  optionalPlaceholder: "没有可留空",
  saveProfile: "保存训练档案",

  // Membership and quota.
  membershipIntro: "当前状态、额度、续费和取消信息都来自真实权益与支付记录。",
  currentPlan: "当前方案",
  // Two independent counts cannot share one plural form, so each is its own
  // counted phrase and the render joins them; the Chinese reads exactly as the
  // single string this replaced.
  quotaRemaining: {
    plans: { one: "计划剩余 {count} 次", other: "计划剩余 {count} 次" },
    scans: { one: "饭菜识别剩余 {count} 次", other: "饭菜识别剩余 {count} 次" },
  },
  periodEnds: "{date} 到期",
  periodRenews: "{date} 续费",
  proTrialHeadline: "试用期内，全部专业能力已解锁。",
  proActiveHeadline: "你的长期 Coach 权益已经生效。",
  proBody: "训练计划、饭菜识别、长期趋势和 Coach 对话都按当前专业版额度提供。",
  proPlanQuota: "每月 {count} 次训练计划",
  proScanQuota: "每月 {count} 次饭菜识别",
  proCoachQuota: "每月 {count} 条 Coach 消息",
  proReviewFeature: "阶段复盘与自适应调整",
  subscriptionManage: "订阅管理",
  trialBillingNote: "试用结束后回到免费版；随时可在价格页订阅",
  stripeBillingNote: "付款方式、发票、续费与取消由 Stripe 安全管理",
  viewSubscription: "查看订阅",
  manageSubscription: "管理订阅",
  freeHeadline: "更细致地理解你的变化，再安排下一步。",
  freeBody: "专业版把训练、营养、恢复与现实日程放在同一个长期档案里持续调整。",
  freeFeatureAdopt: "一键采纳教练引擎的完整调整方案",
  freeFeatureAdapt: "依据完成率、RPE 与疼痛反馈调整",
  freeFeatureQuota: "更高的计划与饭菜识别额度",
  freeFeatureTrends: "阶段趋势、停滞识别与复盘",
  planPriceLabel: "计划价格",
  planPriceValue: "见价格页",
  planPriceNote: "价格与额度以价格页实时显示为准",
  choosePro: "选择专业版",
  pointsBalance: "积分余额",
  pointsHint: "完成训练获得积分；广告积分仅在服务端验证后发放",
  redeemMealScan: "50 积分 · 饭菜识别",
  redeemPlanRefresh: "100 积分 · 计划刷新",

  // Habit commitment.
  habitTitle: "训练习惯",
  habitIntro: "把训练固定到具体的时间和地点，坚持会容易得多。",
  habitCommitmentTitle: "我的训练承诺",
  habitTime: "时间",
  habitPlace: "地点",
  habitPlacePlaceholder: "如：小区健身房",
  habitSave: "保存承诺",
  habitSaved: "已保存。训练日提醒会在这个时间发送（尊重你的安静时段）。",
  habitSaveFailed: "保存失败，请检查时间格式。",
  habitStreakWeeks: "连续训练第 {weeks} 周",
  habitFirstWeek: "本周开始你的第一周",
  // One complete sentence per week state. These used to be three fragments
  // concatenated at render — a clause opening with " · " and a note opening
  // with "。" — which forced every language to punctuate the way Chinese does
  // and left the English reading ". A shortened…". {weeks} and {sessions}
  // arrive already counted, from the two groups below.
  habitStats: "{weeks} · {sessions}。完成 20 分钟缩短版同样算数。",
  habitStatsOnTrack: "{weeks} · {sessions} · 本周已达标。完成 20 分钟缩短版同样算数。",
  habitLongestWeeks: { one: "最长纪录 {count} 周", other: "最长纪录 {count} 周" },
  habitTotalSessions: { one: "累计 {count} 次训练", other: "累计 {count} 次训练" },
  // Milestones are dataset content. When one arrives with no text in any
  // language these say only what is actually known, instead of a blank line.
  milestoneFallbackTitle: "新的里程碑",
  milestoneFallbackMessage: "你达成了一个新的训练里程碑。",

  // Notification preferences.
  notificationsTitle: "通知偏好",
  notificationsIntro: "推送只在你允许的类型与时段发送；安静时段内的提醒会被抑制。",
  pushTypes: "推送类型",
  notifyTraining: "训练日提醒",
  notifyTrainingHint: "在你承诺的训练时间提醒当天的安排",
  notifyReviews: "每周教练信",
  notifyReviewsHint: "周日晚发送本周复盘与下周聚焦",
  notifyCoach: "Coach 主动跟进",
  notifyCoachHint: "教练发起的状态确认",
  notifyNutrition: "饮食记录提醒",
  notifyNutritionHint: "默认关闭",
  notifyBilling: "订阅与试用提醒",
  notifyBillingHint: "试用到期、扣款与退款通知",
  quietHours: "安静时段",
  quietFrom: "从",
  quietTo: "到",
  quietHoursNote: "这段时间内不会收到任何推送（跨夜时段也支持）。",
  quietHoursSave: "保存安静时段",
  notificationsSaved: "通知偏好已保存。",
  notificationsSaveFailed: "保存失败，请检查安静时段格式（HH:MM）。",

  // Account and data.
  accountDataIntro: "Cmine Fit 数据与你的 Cmine ID 身份分开管理。",
  exportTitle: "导出我的数据",
  exportBody: "下载计划、进度、训练记录和同意记录的 JSON 副本。",
  exportStart: "开始导出",
  deleteTitle: "删除 Cmine Fit 数据",
  deleteBody: "删除本站内的用户、计划和进度，不会删除 Cmine ID。",
  deleteAction: "删除数据",

  // Footer.
  footerTagline: "CMINE FIT · 懂训练，更懂你",
  footerDisclaimer: "健康与训练建议不替代医疗诊断、治疗或康复方案。",

  // Toasts and prompts. DELETE is the machine confirmation phrase the API
  // checks, so it stays in Latin in every language.
  profileSaveFailed: "训练档案保存失败。",
  profileSaved: "训练档案已保存，下一份计划会使用这些资料。",
  measurementSaveFailed: "身体记录保存失败。",
  measurementSaved: "新的身体记录已经保存。",
  deletePrompt: "此操作将永久删除 Cmine Fit 内的训练、计划和进度数据，无法撤销（不影响你的 Cmine ID）。\n\n请输入 DELETE 以确认：",
  deleteMismatch: "确认短语不匹配，未执行删除。",
  deleteFailed: "暂时无法删除账号数据，请稍后重试。",
  feedbackNoPlan: "还没有可以记录反馈的训练计划。",
  feedbackSaveFailed: "训练反馈保存失败。",
  feedbackSaved: "训练反馈已经保存，会用于下一周期的调整。",
  billingPortalFailed: "暂时无法打开订阅管理。",
  redeemFailed: "积分兑换失败。",
  redeemedMealScan: "已兑换 1 次饭菜识别。",
  redeemedPlanRefresh: "已兑换 1 次计划刷新。",
} as const;
