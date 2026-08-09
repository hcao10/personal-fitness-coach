import type { pricingZh } from "./pricing.zh.ts";
import type { Widen } from "./widen.ts";

// Copy for app/pricing.
//
// Nothing here states a price, a currency or a quota: those arrive from the
// billing catalog API at runtime and are passed in as placeholders. The free
// tier's line must also stay true — the weekly review summary really is free,
// and only adopting the coach engine's full adjustments needs Pro.
export const pricingEn = {
  metaTitle: "Plans — Cmine Fit",
  metaDescription: "Compare Cmine Fit Free and Pro: from a week of AI planning to long-term training and nutrition guidance that keeps up with you.",

  navNutrition: "Nutrition",
  navMyTraining: "My training",

  heroTitleLine1: "A plan for today,",
  heroTitleLine2: "a direction for the long run.",
  heroIntro: "The free plan is enough to really start. Pro reads your training feedback, body changes, nutrition and daily rhythm, then keeps tuning the guidance to where you are now.",
  heroTrialNote: "New accounts get every Pro capability for their first {days} days.",
  statusLiveTitle: "Pro is available now",
  statusLiveDetail: "Stripe securely handles payment, renewal and cancellation",
  statusPendingTitle: "Pro is being connected to payments",
  statusPendingDetail: "Nothing is charged or pre-authorized until payment is configured",

  plansRegionLabel: "Cmine Fit plans",

  freeBadge: "Available now",
  freeTitle: "Free",
  freePrice: "Free",
  freePriceNote: "No payment method needed",
  freeSummary: "Build your profile, generate a plan of your own, and keep every session, body change and meal on record.",
  freeCta: "Start your plan →",
  freeFeatureProfile: "A personal training profile with deterministic BMR / TDEE numbers",
  freeFeatureAiPlan: "AI weekly plans shaped by your goals, equipment and injury limits",
  freeFeatureHistory: "Plan history, completed training and body trends",
  freeFeatureReviewSummary: "Weekly review summary (the engine's analysis is free to read)",
  freeFeatureQuota: "{plans} AI plans, {scans} meal scans and {messages} Coach messages each month",

  proBadgeAvailable: "Ready to subscribe",
  proBadgePending: "Payment setup pending",
  proTitle: "Pro",
  perMonth: "/ month",
  orYearly: "or {price} / year",
  proPriceFallback: "Price is set at checkout",
  proPriceFallbackNote: "Start checkout to see the current price",
  proSummary: "Not just a few more plans. Over months it learns how you train, reviews what happened, and adjusts the next step.",
  proFeatureAdopt: "Adopt the coach engine's full adjustments in one tap (progressive load / fatigue deload / swap an exercise when you stall)",
  proFeatureAdaptive: "Ongoing adjustment from completion rate, RPE, pain and recovery feedback",
  proFeatureNutrition: "Meal photos, package barcode scanning and daily nutrition targets, at a higher quota",
  proFeatureTrends: "Long-term progress trends, plateau detection and phase reviews",
  proFeatureQuota: "{plans} plans, {scans} meal scans, {messages} Coach messages and {reviews} full reviews each month",

  chooseMonthly: "Choose monthly →",
  chooseYearly: "Choose yearly →",
  chooseYearlySaving: "Choose yearly · save {amount}",
  checkoutRedirect: "Opening Stripe…",
  checkoutFailed: "Checkout could not be started right now.",

  noteEntitlementsTitle: "Access is checked per capability",
  noteEntitlementsBody: "Training analysis, meal recognition, long-term Coach and app sync are each decided on their own, so no plan name is hardcoded into the training logic.",
  noteBillingTitle: "Renewal and cancellation stay clear",
  noteBillingBody: "Monthly, yearly, renewal and cancellation states are always shown, and you can manage them anytime in the Stripe customer portal.",
  noteProfileTitle: "One long-term record",
  noteProfileBody: "Web and app share the same Cmine ID, plans, nutrition and progress, so there is nothing to set up twice.",

  footerTagline: "CMINE FIT · Understands training, understands you",
  footerDisclaimer: "Health, training and nutrition guidance does not replace medical diagnosis, treatment or rehabilitation.",
} as const satisfies Widen<typeof pricingZh>;
