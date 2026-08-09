// Copy for app/pricing. Chinese is the schema: a key added here must be
// added to pricing.en.ts or the build fails.
//
// No price, currency symbol or quota number lives here. Prices come from the
// Stripe Price objects the catalog API returns and quotas from runtime
// settings; a number written into this file would drift from what checkout
// actually charges and what the server actually enforces. Where copy has to
// wrap a runtime value it takes a placeholder instead.
export const pricingZh = {
  metaTitle: "专业计划 — Cmine Fit",
  metaDescription: "了解 Cmine Fit 免费版与专业版：从一周 AI 计划，到持续适应你变化的长期训练与营养指导。",

  navNutrition: "饮食记录",
  navMyTraining: "我的训练",

  // The small all-caps labels above the headline and above the free plan are
  // copy, not decoration — the same way home.startHere / home.progressive are
  // catalogued. Left in the markup they served an English reader Chinese page
  // text under an English eyebrow.
  heroEyebrow: "专业计划",

  // The headline is split across a <br /> in the markup, so each line is its
  // own message — a locale that breaks the sentence elsewhere changes only the
  // text, not the JSX.
  heroTitleLine1: "今天有计划，",
  heroTitleLine2: "长期也有方向。",
  heroIntro: "免费版让你真正开始；专业版会理解训练反馈、身体变化、饮食和生活节奏，持续给出更细致、更适合当下的指导。",
  heroTrialNote: "新账号前 {days} 天可完整体验全部专业能力。",
  statusLiveTitle: "专业版现已开放",
  statusLiveDetail: "由 Stripe 安全处理付款、续费与取消",
  statusPendingTitle: "专业版正在接入支付",
  statusPendingDetail: "支付未配置前不会收款或预授权",

  plansRegionLabel: "Cmine Fit 订阅方案",

  freeEyebrow: "起步",
  freeBadge: "当前可用",
  freeTitle: "免费版",
  freePrice: "免费",
  freePriceNote: "无需绑定支付方式",
  freeSummary: "完成个人建档，生成专属计划，并保存每一次训练、身体变化和餐食记录。",
  freeCta: "开始制定计划 →",
  freeFeatureProfile: "个人训练档案与确定性 BMR / TDEE 计算",
  freeFeatureAiPlan: "结合目标、器械与伤病限制的 AI 周计划",
  freeFeatureHistory: "计划历史、训练完成记录与身体趋势",
  freeFeatureReviewSummary: "每周复盘摘要（引擎分析结果免费可见）",
  freeFeatureQuota: "每月 {plans} 次 AI 计划、{scans} 次饭菜识别与 {messages} 条 Coach 消息",

  proBadgeAvailable: "可订阅",
  proBadgePending: "等待支付配置",
  proTitle: "专业版",
  perMonth: "/ 月",
  orYearly: "或 {price} / 年",
  proPriceFallback: "价格以 Checkout 为准",
  proPriceFallbackNote: "点击订阅查看当前价格",
  proSummary: "不只是多生成几份计划，而是在更长时间里理解你、复盘你，再调整下一步。",
  proFeatureAdopt: "一键采纳教练引擎的完整调整方案（渐进负荷 / 疲劳减量 / 停滞换动作）",
  proFeatureAdaptive: "依据完成率、RPE、疼痛与恢复反馈持续调整",
  proFeatureNutrition: "饭菜拍照、包装扫码与每日营养目标（更高额度）",
  proFeatureTrends: "长期进度趋势、停滞识别与阶段复盘",
  proFeatureQuota: "每月 {plans} 次计划、{scans} 次饭菜识别、{messages} 条 Coach 消息与 {reviews} 次完整复盘",

  chooseMonthly: "选择月付 →",
  chooseYearly: "选择年付 →",
  chooseYearlySaving: "选择年付 · 省 {amount}",
  checkoutRedirect: "正在前往 Stripe…",
  checkoutFailed: "暂时无法开始订阅。",

  noteEntitlementsTitle: "按能力管理权益",
  noteEntitlementsBody: "训练分析、饭菜识别、长期 Coach 与 App 同步独立判断，不把套餐名称硬编码进训练逻辑。",
  noteBillingTitle: "清楚地续费与取消",
  noteBillingBody: "月付、年付、续费与取消状态都会明确展示，并可通过 Stripe 客户门户随时管理。",
  noteProfileTitle: "同一个长期档案",
  noteProfileBody: "Web 与 App 共用 Cmine ID、计划、营养和进度，不需要重新建立资料。",

  footerTagline: "CMINE FIT · 懂训练，更懂你",
  footerDisclaimer: "健康、训练与营养建议不替代医疗诊断、治疗或康复方案。",
} as const;
