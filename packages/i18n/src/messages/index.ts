import type { Locale } from "../locales.ts";
import { homeZh } from "./home.zh.ts";
import { homeEn } from "./home.en.ts";

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
  },
  home: homeZh,
} as const;

// The Chinese catalog is `as const`, which would otherwise demand that every
// other locale repeat the *same literal strings*. Widening the leaves to
// `string` keeps what actually matters — identical key sets, identical shape —
// while letting each locale carry its own text.
type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
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
  },
  home: homeEn,
} as const satisfies Messages;

export const MESSAGES: Record<Locale, Messages> = { zh, en };
