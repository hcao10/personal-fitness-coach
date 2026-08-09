import type { Locale } from "../locales.ts";
import type { Widen } from "./widen.ts";
import { homeZh } from "./home.zh.ts";
import { homeEn } from "./home.en.ts";
import { todayZh } from "./today.zh.ts";
import { todayEn } from "./today.en.ts";
import { coachZh } from "./coach.zh.ts";
import { coachEn } from "./coach.en.ts";
import { nutritionZh } from "./nutrition.zh.ts";
import { nutritionEn } from "./nutrition.en.ts";
import { progressZh } from "./progress.zh.ts";
import { progressEn } from "./progress.en.ts";
import { accountZh } from "./account.zh.ts";
import { accountEn } from "./account.en.ts";
import { pricingZh } from "./pricing.zh.ts";
import { pricingEn } from "./pricing.en.ts";
import { onboardingZh } from "./onboarding.zh.ts";
import { onboardingEn } from "./onboarding.en.ts";
import { exercisesZh } from "./exercises.zh.ts";
import { exercisesEn } from "./exercises.en.ts";
import { authZh } from "./auth.zh.ts";
import { authEn } from "./auth.en.ts";

// Chinese is the schema. Every other locale is `satisfies Messages`, so a
// missing key, an extra key or a wrong type is a compile error rather than a
// runtime fallback that silently ships the wrong language — the exact failure
// this product had when a nine-language picker rendered English for seven of
// them. Adding a locale therefore cannot be done halfway.
export const zh = {
  nav: {
    today: "今日",
    coach: "Coach",
    nutrition: "饮食",
    progress: "进度",
    account: "我的",
  },
  common: {
    close: "关闭",
    cancel: "取消",
    save: "保存",
    retry: "重试",
    loading: "加载中…",
    notConfigured: "尚未配置",
  },
  // Chrome shared by every product page (sidebar, bottom nav).
  shell: {
    proPitch: "更长期、更贴合的专业指导",
  },
  // Server error codes. errorJson already carries a stable machine code as its
  // first argument, so localizing these is a lookup on a key that exists rather
  // than a string-matching exercise.
  error: {
    AUTH_REQUIRED: "请先登录 Cmine ID。",
    RATE_LIMITED: "请求过于频繁，请稍后再试。",
    ORIGIN_REJECTED: "请求来源未通过校验。",
    DATABASE_NOT_CONFIGURED: "数据库尚未连接。",
    INVALID_PROFILE: "训练档案不完整或超出安全范围。",
    CONSENT_REQUIRED: "请先确认健康免责声明。",
    PLAN_LIMIT_REACHED: "本周期的 AI 计划额度已用完，可使用积分兑换或升级专业版。",
    MEAL_SCAN_LIMIT_REACHED: "本周期的饭菜识别额度已用完，可使用积分兑换或升级专业版。",
    COACH_LIMIT_REACHED: "本周期的 Coach 体验额度已用完。",
    REVIEW_LIMIT_REACHED: "本月的完整复盘额度已用完。",
    REVIEW_UPGRADE_REQUIRED: "复盘摘要免费可看；采纳教练的完整调整方案需要升级 Pro。",
    AI_NOT_CONFIGURED: "AI 教练尚未配置，计划没有生成，也不会消耗你的额度。",
    AI_BUDGET_EXHAUSTED: "今日 AI 成本保护已触发，请稍后再试。",
    AI_USER_BUDGET_EXHAUSTED: "你今天的 AI 用量已达上限，额度已退回。用量按 UTC 日切重置。",
    AI_GENERATION_FAILED: "这次计划没有通过完整校验，额度已退回，请稍后重新生成。",
    MEAL_STORAGE_NOT_CONFIGURED: "图片存储或转换服务尚未配置。",
    INVALID_MEAL_IMAGE: "图片格式、大小或内容无效。",
    MEAL_IMAGE_TOO_LARGE: "图片太大，请换一张或降低分辨率。",
    DELETE_CONFIRMATION_REQUIRED: "删除账户需要在请求中确认。",
    INVALID_HABIT_COMMITMENT: "训练时间承诺无效：需要 HH:MM 时间，地点不超过 60 字。",
    INVALID_LOCALE: "不支持的语言。",
    // Codes below are the ones a user can actually hit from the product pages.
    // Webhook and token-verification codes (STRIPE_SIGNATURE_*, CMINE_JWT_*,
    // ADMOB_*, REVENUECAT_*, MAINTENANCE_*) are deliberately absent: they never
    // reach a screen, and cataloguing them would bury the ones that do.
    FORBIDDEN: "你没有访问这项内容的权限。",
    NOT_FOUND: "没有找到这个地址。",
    CMINE_NOT_CONFIGURED: "登录服务尚未配置。",
    MAINTENANCE_MODE: "AI 教练正在进行短暂维护，请稍后再试。",
    INVALID_TIMEZONE: "设备时区无效，请重新选择开始日期。",
    INVALID_ONBOARDING_DRAFT: "问卷草稿格式无效。",
    ONBOARDING_DRAFT_TOO_LARGE: "问卷草稿过大，请精简后再保存。",
    PLAN_NOT_FOUND: "没有找到这份计划。",
    PLAN_VERSION_NOT_FOUND: "没有找到这个计划版本。",
    PLAN_EXERCISE_NOT_FOUND: "这个动作不在当前计划里。",
    ACTIVE_PLAN_REQUIRED: "需要先有一份进行中的计划。",
    OCCURRENCE_NOT_FOUND: "没有找到这次训练安排。",
    INVALID_RESCHEDULE: "改期日期无效。",
    INVALID_DATE: "日期无效。",
    INVALID_MEASUREMENT: "身体数据无效或超出合理范围。",
    INVALID_WORKOUT: "训练记录无效。",
    INVALID_WORKOUT_DAY: "训练日无效。",
    INVALID_WORKOUT_SET: "这一组的记录无效。",
    INVALID_COMPLETION: "完成记录无效。",
    INVALID_CHECKIN: "状态自评无效：恢复与睡眠为 1–5，疼痛为 0–10。",
    CONVERSATION_NOT_FOUND: "没有找到这个对话。",
    MESSAGE_REQUIRED: "请先输入内容。",
    MESSAGE_NOT_FOUND: "没有找到这条消息。",
    ACTION_NOT_FOUND: "没有找到这条教练建议。",
    INVALID_EXERCISE_REPLACEMENT: "这个替换动作不适用于你的器械或限制条件。",
    EXERCISE_NOT_IN_PLAN: "这个动作不在计划里，无法替换。",
    INVALID_MEMORY: "教练记忆内容无效。",
    PRO_REQUIRED: "这项功能需要升级 Pro。",
    REVIEW_NOT_FOUND: "没有找到这次复盘。",
    REVIEW_FAILED: "暂时无法完成这次周度复盘。",
    MEAL_NOT_FOUND: "没有找到这餐记录。",
    MEAL_IMAGE_NOT_FOUND: "没有找到这张照片。",
    INVALID_MEAL: "这餐记录无效。",
    INVALID_MEAL_UPLOAD: "上传内容无效，请确认选择了图片。",
    INVALID_MEAL_ITEMS: "食物条目不完整或份量无效。",
    NUTRITION_REFERENCE_REQUIRED: "这一项缺少营养数据来源，无法计算热量。",
    INVALID_CUSTOM_FOOD: "自定义食品的营养信息无效。",
    FOOD_NOT_FOUND: "没有找到这个食品。",
    INVALID_CORRECTION: "纠错内容无效。",
    INVALID_RECIPE: "配方内容无效。",
    RECIPE_NOT_FOUND: "没有找到这个配方。",
    INVALID_TEMPLATE: "餐食模板无效。",
    EXERCISE_CATALOG_UNAVAILABLE: "动作库暂时不可用。",
    EXERCISE_NOT_FOUND: "没有找到这个动作。",
    INVALID_INTERVAL: "请选择月付或年付。",
    STRIPE_NOT_CONFIGURED: "支付服务尚未配置。",
    CHECKOUT_FAILED: "暂时无法创建结账页面。",
    INSUFFICIENT_POINTS: "积分不足。",
    INVALID_REWARD: "这个兑换项目无效。",
    REWARD_AD_NOT_CONFIGURED: "激励广告尚未配置。",
    INVALID_NOTIFICATION_PREFERENCES: "通知偏好设置无效。",
    INVALID_DEVICE: "设备信息无效。",
    INVALID_SYNC_BATCH: "同步批次无效。",
    INVALID_HEALTH_CONNECTION: "健康数据连接无效。",
    INVALID_HEALTH_BATCH: "健康数据批次无效。",
  },
  home: homeZh,
  today: todayZh,
  coach: coachZh,
  nutrition: nutritionZh,
  progress: progressZh,
  account: accountZh,
  pricing: pricingZh,
  onboarding: onboardingZh,
  exercises: exercisesZh,
  auth: authZh,
} as const;

export type Messages = Widen<typeof zh>;

export const en = {
  nav: {
    today: "Today",
    coach: "Coach",
    nutrition: "Nutrition",
    progress: "Progress",
    account: "Account",
  },
  common: {
    close: "Close",
    cancel: "Cancel",
    save: "Save",
    retry: "Retry",
    loading: "Loading…",
    notConfigured: "Not configured",
  },
  shell: {
    proPitch: "Longer-term guidance, tuned to you",
  },
  error: {
    AUTH_REQUIRED: "Please sign in with Cmine ID first.",
    RATE_LIMITED: "Too many requests — please try again shortly.",
    ORIGIN_REJECTED: "The request origin could not be verified.",
    DATABASE_NOT_CONFIGURED: "The database is not connected.",
    INVALID_PROFILE: "Your training profile is incomplete or outside the safe range.",
    CONSENT_REQUIRED: "Please confirm the health disclaimer first.",
    PLAN_LIMIT_REACHED: "You have used this period's AI plan quota. Redeem points or upgrade to Pro.",
    MEAL_SCAN_LIMIT_REACHED: "You have used this period's meal recognition quota. Redeem points or upgrade to Pro.",
    COACH_LIMIT_REACHED: "You have used this period's Coach message quota.",
    REVIEW_LIMIT_REACHED: "You have used this month's full review quota.",
    REVIEW_UPGRADE_REQUIRED: "The review summary is free; adopting the coach's full adjustments requires Pro.",
    AI_NOT_CONFIGURED: "The AI coach is not configured. No plan was generated and no quota was used.",
    AI_BUDGET_EXHAUSTED: "Today's AI cost protection has triggered. Please try again later.",
    AI_USER_BUDGET_EXHAUSTED: "You have reached today's AI usage limit and your quota was refunded. Usage resets at the UTC day boundary.",
    AI_GENERATION_FAILED: "This plan did not pass validation. Your quota was refunded — please try again.",
    MEAL_STORAGE_NOT_CONFIGURED: "Image storage or transformation is not configured.",
    INVALID_MEAL_IMAGE: "That image's format, size or content is not valid.",
    MEAL_IMAGE_TOO_LARGE: "That image is too large — try another one or lower the resolution.",
    DELETE_CONFIRMATION_REQUIRED: "Deleting your account requires an explicit confirmation in the request.",
    INVALID_HABIT_COMMITMENT: "Invalid training commitment: a HH:MM time is required and the place must be 60 characters or fewer.",
    INVALID_LOCALE: "That language is not supported.",
    FORBIDDEN: "You do not have access to this.",
    NOT_FOUND: "That address does not exist.",
    CMINE_NOT_CONFIGURED: "Sign-in is not configured.",
    MAINTENANCE_MODE: "The AI coach is briefly down for maintenance. Please try again shortly.",
    INVALID_TIMEZONE: "That device time zone is not valid — pick the start date again.",
    INVALID_ONBOARDING_DRAFT: "That intake draft is not in a valid format.",
    ONBOARDING_DRAFT_TOO_LARGE: "That intake draft is too large — please shorten it.",
    PLAN_NOT_FOUND: "That plan could not be found.",
    PLAN_VERSION_NOT_FOUND: "That plan version could not be found.",
    PLAN_EXERCISE_NOT_FOUND: "That exercise is not in your current plan.",
    ACTIVE_PLAN_REQUIRED: "You need an active plan first.",
    OCCURRENCE_NOT_FOUND: "That scheduled session could not be found.",
    INVALID_RESCHEDULE: "That new date is not valid.",
    INVALID_DATE: "That date is not valid.",
    INVALID_MEASUREMENT: "Those body measurements are invalid or outside a plausible range.",
    INVALID_WORKOUT: "That workout record is not valid.",
    INVALID_WORKOUT_DAY: "That training day is not valid.",
    INVALID_WORKOUT_SET: "That set is not valid.",
    INVALID_COMPLETION: "That completion record is not valid.",
    INVALID_CHECKIN: "Invalid check-in: recovery and sleep are 1–5, pain is 0–10.",
    CONVERSATION_NOT_FOUND: "That conversation could not be found.",
    MESSAGE_REQUIRED: "Type something first.",
    MESSAGE_NOT_FOUND: "That message could not be found.",
    ACTION_NOT_FOUND: "That coach proposal could not be found.",
    INVALID_EXERCISE_REPLACEMENT: "That substitute does not fit your equipment or limitations.",
    EXERCISE_NOT_IN_PLAN: "That exercise is not in the plan, so it cannot be replaced.",
    INVALID_MEMORY: "That coach memory entry is not valid.",
    PRO_REQUIRED: "This requires Pro.",
    REVIEW_NOT_FOUND: "That review could not be found.",
    REVIEW_FAILED: "This weekly review could not be completed right now.",
    MEAL_NOT_FOUND: "That meal could not be found.",
    MEAL_IMAGE_NOT_FOUND: "That photo could not be found.",
    INVALID_MEAL: "That meal record is not valid.",
    INVALID_MEAL_UPLOAD: "That upload is not valid — check that you selected an image.",
    INVALID_MEAL_ITEMS: "A food entry is incomplete or its portion is invalid.",
    NUTRITION_REFERENCE_REQUIRED: "This item has no nutrition source, so its calories cannot be calculated.",
    INVALID_CUSTOM_FOOD: "That custom food's nutrition values are not valid.",
    FOOD_NOT_FOUND: "That food could not be found.",
    INVALID_CORRECTION: "That correction is not valid.",
    INVALID_RECIPE: "That recipe is not valid.",
    RECIPE_NOT_FOUND: "That recipe could not be found.",
    INVALID_TEMPLATE: "That meal template is not valid.",
    EXERCISE_CATALOG_UNAVAILABLE: "The exercise library is unavailable right now.",
    EXERCISE_NOT_FOUND: "That exercise could not be found.",
    INVALID_INTERVAL: "Choose monthly or yearly.",
    STRIPE_NOT_CONFIGURED: "Payments are not configured.",
    CHECKOUT_FAILED: "The checkout page could not be created right now.",
    INSUFFICIENT_POINTS: "You do not have enough points.",
    INVALID_REWARD: "That redemption is not valid.",
    REWARD_AD_NOT_CONFIGURED: "Reward ads are not configured.",
    INVALID_NOTIFICATION_PREFERENCES: "Those notification preferences are not valid.",
    INVALID_DEVICE: "That device information is not valid.",
    INVALID_SYNC_BATCH: "That sync batch is not valid.",
    INVALID_HEALTH_CONNECTION: "That health connection is not valid.",
    INVALID_HEALTH_BATCH: "That health data batch is not valid.",
  },
  home: homeEn,
  today: todayEn,
  coach: coachEn,
  nutrition: nutritionEn,
  progress: progressEn,
  account: accountEn,
  pricing: pricingEn,
  onboarding: onboardingEn,
  exercises: exercisesEn,
  auth: authEn,
} as const satisfies Messages;

export const MESSAGES: Record<Locale, Messages> = { zh, en };
