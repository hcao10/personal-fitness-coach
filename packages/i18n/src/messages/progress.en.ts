import type { progressZh } from "./progress.zh.ts";
import type { Widen } from "./widen.ts";

// Copy for app/progress.
export const progressEn = {
  eyebrow: "PROGRESS / Long-term view",
  title: "See what changed, then decide what's next",

  // Weekly review panel.
  reviewEyebrow: "This week's review",
  reviewPrompt: "Tell us how you recovered this week",
  metricAdherence: "Adherence",
  metricSessions: "Sessions completed",
  metricAverageRpe: "Average RPE",
  metricPeakPain: "Peak pain",
  engineSummary: "The coach engine found {count} targeted adjustments in your data{stalled}. {teaser}",
  engineStagnation: ", and flagged {count} stalled exercises",
  unlockAdjustments: "Upgrade to Pro to unlock and apply the full adjustments →",
  keepCurrentPlan: "Keep current plan",
  acceptAdjustments: "Accept and apply",

  // Check-in sliders.
  recoveryLabel: "Recovery",
  sleepLabel: "Sleep quality",
  painLabel: "Pain level",
  generating: "Analyzing…",
  generateReview: "Generate this week's review →",

  // Result messages.
  generateFailed: "Could not generate this week's review.",
  planActivated: "The new plan version is active. The previous one stays in your history.",
  planKept: "Your current plan is unchanged.",
  actionFailed: "That did not work. Please try again.",

  // History rail.
  historyEyebrow: "Past reviews",
  historyPlaceholderTitle: "Still collecting data",
  historyEmpty: "After a few weeks of training, your trends and plan versions appear here.",

  // Charts.
  chartsEyebrow: "Progress charts",
  chartsEmptyTitle: "Not enough training data yet",
  chartsEmptyBody: "Log a few weighted sessions and this is where weekly tonnage and e1RM trends for your main exercises appear.",
  chartsTitle: "Changes you can see",
  chartsSummary: "Total volume {tonnes} t · {sessions} sessions logged. Everything here comes from the sets you actually recorded — nothing is smoothed.",
  weeklyTonnageHeading: "Weekly tonnage (kg)",
  weeklyTonnageChartLabel: "Weekly tonnage: {data}",
  listSeparator: ", ",
  weeklyTonnageBarTitle: "{date}: {tonnage} kg · {sessions} sessions",
  weeklyTonnageRange: "{from} — {to} · peak {peak} kg",
  e1rmHeading: "Main exercise e1RM",
  exerciseChange: " · {change}%",
  e1rmChartLabel: "{name} e1RM from {from} kg to {to} kg",
  e1rmNote: "e1RM is estimated from your completed sets with the Epley formula. Read it as a trend, not as a tested one-rep max.",
  weightHeading: "Weight trend",
  weightChartLabel: "Weight from {from} kg to {to} kg",
  planAdjustments: " · plan adjusted {count}× in this period (latest {date})",
} as const satisfies Widen<typeof progressZh>;
