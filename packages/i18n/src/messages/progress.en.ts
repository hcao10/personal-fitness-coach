import type { progressZh } from "./progress.zh.ts";
import type { Widen } from "./widen.ts";

// Copy for app/progress.
export const progressEn = {
  eyebrow: "PROGRESS / Long-term view",
  title: "See what changed, then decide what's next",

  // Keyed by the engine's machine `kind`. The deload wording is safety copy and
  // keeps the same force as the Chinese: "stop … and consult a professional",
  // not a softened suggestion.
  reviewKind: {
    collect_more_data: {
      title: "Log one more week first",
      explanation: "Fewer than two qualifying sessions this week, so there is not enough to judge whether the plan needs changing.",
      change1: "Stay on the current plan",
      change2: "Record RPE and pain after each session",
    },
    deload: {
      title: "Take a deload week",
      explanation: "Pain or training intensity has reached the range where adding more load is not appropriate.",
      change1: "Cut total weekly sets by 10%",
      change2: "Hold load targets where they are",
      change3: "If pain persists, stop the movement and consult a professional",
    },
    progress: {
      title: "Adjust the plan slightly",
      explanation: "Three consecutive qualifying weeks with steady execution, but the trend is behind target.",
      change1: "Increase total weekly sets by up to 10%",
      change2: "Increase load targets on the main lifts by up to 5%",
      change3: "Keep your existing equipment and movement limits",
    },
    hold: {
      title: "Keep the current rhythm",
      explanation: "Execution and recovery show no signal that the plan needs changing yet.",
      change1: "Keep the current training structure",
      change2: "Keep logging recovery and pain next week",
    },
  },

  // Weekly review panel.
  reviewEyebrow: "This week's review",
  reviewPrompt: "Tell us how you recovered this week",
  metricAdherence: "Adherence",
  metricSessions: "Sessions completed",
  metricAverageRpe: "Average RPE",
  metricPeakPain: "Peak pain",
  engineSummary: "The coach engine found {count} targeted adjustments in your data{stalled}. {teaser}",
  engineStagnation: ", and flagged {count} stalled exercises",
  unlockAdjustments: "Upgrade to Pro to unlock and apply the full adjustments ",
  keepCurrentPlan: "Keep current plan",
  acceptAdjustments: "Accept and apply",

  // Check-in sliders.
  recoveryLabel: "Recovery",
  sleepLabel: "Sleep quality",
  painLabel: "Pain level",
  generating: "Analyzing…",
  generateReview: "Generate this week's review ",

  // Result messages.
  generateFailed: "Could not generate this week's review.",
  planActivated: "The new plan version is active. The previous one stays in your history.",
  planKept: "Your current plan is unchanged.",
  actionFailed: "That did not work. Please try again.",

  // History rail.
  historyEyebrow: "Past reviews",
  historyPlaceholderTitle: "Still collecting data",
  historyEmpty: "After a few weeks of training, your trends and plan versions appear here.",

  measurementDraftEyebrow: "COACH RECORD TO REVIEW",
  measurementDraftTitle: "Confirm this body measurement",
  measurementDraftBody: "Coach only created a draft. Check or enter the values; nothing reaches your progress history until you confirm. BMI is calculated from your profile height and is a screening measure only.",
  weightKg: "Weight (kg)",
  bodyFatPct: "Body fat (%)",
  waistCm: "Waist (cm)",
  measurementNote: "Note (optional)",
  confirmMeasurement: "Confirm and record",
  rejectMeasurement: "Do not record",
  measurementSaved: "Measurement saved and your progress trend is up to date.",
  measurementRejected: "That draft was discarded.",
  measurementFailed: "The measurement was not saved. Check the values and try again.",

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
  bmiLatest: "Latest BMI {bmi} (a screening measure, not a diagnosis)",
  planAdjustments: " · plan adjusted {count}× in this period (latest {date})",
} as const satisfies Widen<typeof progressZh>;
