import type { todayZh } from "./today.zh.ts";
import type { Widen } from "./widen.ts";

// Copy for app/today.
export const todayEn = {
  // Page chrome
  loading: "Getting today's session ready…",
  eyebrow: "TODAY / TRAINING SESSION",
  greetingFallback: "Hi there",
  title: "{name}, train at your own pace today",
  exerciseLibraryLink: "Exercise library",
  askCoachLink: "Ask Coach ↗",

  // No active plan
  emptyTitle: "Start with a plan that actually fits you",
  emptyBody: "Spend 2–3 minutes on your profile. We calculate your base metrics, then AI builds a full training cycle.",
  emptyCta: "Start your profile →",

  // Daily brief strip
  briefFromPlan: "From your current plan",
  briefFromRecentLogs: "From your recent logs",
  currentPhase: "Current phase",
  phaseWeek: "Week {current} of {total}",
  todayLabel: "Today",

  // Pre-training check-in
  checkinEyebrow: "TRAINING CHECK / 30-SECOND CHECK-IN",
  checkinTitle: "First, pick today's version",
  checkinNote: "Ordinary cases are handled instantly by safety rules and use none of your Coach message quota.",
  energyLabel: "Energy",
  sorenessLabel: "Soreness",
  painLabel: "Noticeable pain",
  availableTimeLabel: "Time available",
  availableTimeAria: "Time available (minutes)",
  minutesValue: "{minutes} min",
  checkinPending: "Checking…",
  checkinSubmit: "See today's recommendation →",
  recommendationEyebrow: "Today's recommendation",
  recheck: "Check again",

  // Session variants
  versionsAria: "Today's session versions",
  modeStandard: "Standard",
  modeShort: "20-minute short version",
  modeShortNote: "Keeps the key exercises",
  modeRecovery: "Recovery version",
  modeRecoveryNote: "Less volume, less intensity",
  rescheduleLabel: "Move to another day",
  rescheduleConfirm: "Confirm new date",

  // Session header and rest day
  trackIntermediate: "Intermediate hypertrophy",
  trackBeginner: "Beginner fat loss",
  restDayTitle: "Recovery day",
  restDayBody: "Easy walking, some mobility work and enough sleep — that is the whole plan today.",

  // Fallbacks for plan content that is missing in the reader's language.
  // Shown instead of a blank line, and never instead of a safety instruction.
  sessionTitleFallback: "Today's session",
  sessionFocusFallback: "No focus note for this session.",
  exerciseNameFallback: "Unnamed exercise",
  exerciseTargetFallback: "Target area not listed",
  exerciseCueFallback: "No form cue is available for this exercise.",
  exerciseProgressionFallback: "No progression note yet.",

  // Exercise card
  zoomExerciseAria: "Enlarge {name}",
  exerciseDemoAlt: "{name} demonstration",
  zoom: "Enlarge",
  exercisePrompt: "How should I do {name} right now?",
  exerciseIssueLink: "Movement does not feel right, or the machine is taken?",

  // Form cues and safety — reviewed copy, do not soften
  safetySummary: "Form cues and safety notes",
  cueLabel: "How to do it now: ",
  breathingLabel: "Breathing: ",
  breathingBody: "Exhale through the hard part of the movement and inhale on the way back. Keep your torso braced the whole time; never hold your breath to force a rep.",
  commonMistakesLabel: "Common mistakes: ",
  commonMistakesBody: "Do not use momentum to chase reps, and do not give up joint position or range of motion to hit the target reps.",
  stopConditionsLabel: "Stop conditions: ",
  stopConditionsBody: "Stop immediately if you get sharp pain, numbness, dizziness or chest pain, or if you cannot hold the load steady.",

  // Set table
  colSet: "Set",
  colType: "Type",
  colWeight: "Weight kg",
  colReps: "Reps",
  colDone: "Done",
  setTypeAria: "Set {index} type",
  setTypeWarmup: "Warm-up",
  setTypeWorking: "Working",
  setTypeDropset: "Drop set",
  setTypeFailure: "To failure",
  setWeightAria: "Set {index} weight",
  setRepsAria: "Set {index} reps",
  setRirAria: "Set {index} RIR",
  weightPlaceholderLast: "Last time",
  weightPlaceholderOptional: "Optional",
  setComplete: "Log",
  setSummary: "{sets} sets · {reps} reps · rest {rest}",

  // Session feedback panel
  progressEyebrow: "Session progress",
  setsCompleted: "{completed}/{total} sets done",
  restTimer: "Rest timer",
  skip: "Skip",
  durationLabel: "Session length",
  durationAria: "Session length (minutes)",
  rpeLabel: "Perceived effort RPE",
  painLevelLabel: "Pain level",
  painWarning: "Stop any movement that causes pain. If the pain continues or gets worse, see a qualified professional.",
  updateLog: "Update this session →",
  completeAndLog: "Finish and log session →",

  // Exercise media dialog
  closeModal: "Close ×",
  exerciseAnimatedAlt: "{name} animated demonstration",
  mediaTip1: "Learn the movement with a load you can fully control.",
  mediaTip2: "Exhale through the hard part, inhale on the way back.",
  mediaTip3: "Stop immediately if you get sharp pain, numbness or joint instability.",
  mediaCoachPrompt: "Given my plan, explain the form cues for {name} and which exercises I could use instead.",
  mediaCoachLink: "Ask Coach to explain it for me →",

  // Notes written onto the saved session record
  noteShortVariant: "Did the short version.",
  noteRecoveryVariant: "Did the recovery version.",
  notePain: "Pain {pain}/10.",

  // Status messages
  setSaveFailed: "That set did not save. Please try again.",
  checkinSaveFailed: "The check-in did not save. Please try again.",
  logOneSetFirst: "Log at least one set before you finish today's training.",
  sessionLogged: "Today's training is logged. Coach will use your sets and recovery feedback in the weekly review.",
  logFailed: "Could not save the log. Please try again.",
  chooseNewDate: "Pick a new training date.",
  rescheduleFailed: "The training date cannot be changed right now.",
  rescheduled: "Moved to {date}. The rest of your week is unchanged.",
} as const satisfies Widen<typeof todayZh>;
