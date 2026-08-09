import type { onboardingZh } from "./onboarding.zh.ts";
import type { Widen } from "./widen.ts";

// Copy for app/onboarding.
export const onboardingEn = {
  // Step rail down the left of the intake. Kept to one short word each so the
  // chips stay on one line at the narrow rail width.
  stepStart: "Start",
  stepGoal: "Goal",
  stepBody: "Body",
  stepTraining: "Training",
  stepSafety: "Safety",
  stepDiet: "Food",
  stepConfirm: "Confirm",

  // Page chrome.
  eyebrow: "WELCOME / BUILD YOUR TRAINING PROFILE",
  title: "We get to know you first, then plan your training",
  skip: "Not now",
  loading: "Restoring your training profile…",

  // Status and validation messages under the card.
  saveFailed: "Could not save right now. Please try again.",
  consentRequired: "Please confirm the health disclaimer and the data notice first.",
  completeFailed: "Could not confirm your details. Please try again.",
  planFailed: "Your details are saved. The AI could not build a plan right now — you can try again from Today.",

  // Step 0 — welcome.
  welcomeTitle: "A plan that fits your life, instead of a life that fits the plan.",
  welcomeBody: "Fill this in a step at a time, or come back to it later. Nothing is generated until you confirm at the end.",
  welcomeCta: "Start building my plan",

  // Step 1 — track and goal.
  goalTitle: "Choose the starting point that fits you",
  goalNote: "Both tracks share the same logging and the same Coach. You can switch later.",
  trackBeginnerBadge: "START HERE",
  trackBeginnerName: "Beginner fat loss",
  trackBeginnerBlurb: "Start with what to do today and how much to eat, and build a rhythm you can keep.",
  trackAdvancedBadge: "PROGRESSIVE",
  trackAdvancedName: "Intermediate hypertrophy",
  trackAdvancedBlurb: "Set-by-set logging, progressive load, per-muscle volume and cycle reviews.",
  currentTrack: "Current choice: {track}",
  trackShortBeginner: "Beginner fat loss",
  trackShortAdvanced: "Intermediate hypertrophy",
  goalFatLoss: "Fat loss",
  goalMuscle: "Build muscle",
  goalRecomp: "Recomposition",
  goalArms: "Defined arms",
  goalStrength: "Strength",

  // Step 2 — body basics.
  bodyTitle: "Your body basics",
  bodyNote: "Used to calculate your metabolism, your training intensity and the safe ranges.",
  sexFemale: "Female",
  sexMale: "Male",
  ageLabel: "Age",
  heightLabel: "Height (cm)",
  weightLabel: "Weight (kg)",
  targetWeightLabel: "Target weight (kg)",

  // Step 3 — training conditions.
  conditionsTitle: "Your training reality",
  conditionsNote: "A plan you can actually run beats an ideal one you cannot.",
  experienceLabel: "Experience",
  experienceBeginner: "Beginner",
  experienceIntermediate: "Intermediate",
  experienceAdvanced: "Advanced",
  equipmentLabel: "Equipment",
  equipmentBodyweight: "Bodyweight / home",
  equipmentDumbbell: "Dumbbells",
  equipmentGym: "Full gym",
  activityLabel: "Daily activity",
  activitySedentary: "Mostly seated",
  activityLight: "Light activity",
  activityModerate: "Moderate activity",
  activityActive: "Very active",
  sessionMinutesLabel: "Session length",
  daysPerWeekLabel: "Training days per week",
  barrierLabel: "What do you most need to solve?",
  barrierConfidence: "Not sure how to start",
  barrierTime: "Never a full block of time",
  barrierConsistency: "Staying consistent",
  barrierFood: "Food gets out of hand",
  barrierFeedback: "No feedback on progress",
  preferredDurationLabel: "Preferred session length",
  durationMinutes: "{minutes} min",
  trainingAgeLabel: "Consistent training (months)",
  currentSplitLabel: "Current split",
  currentSplitPlaceholder: "e.g. upper/lower, push-pull-legs",
  weakPointsLabel: "Muscles to prioritize",
  weakPointsPlaceholder: "e.g. lats, side delts",
  acceptsWeightGain: "I accept slow weight gain during a muscle-building phase",

  // Step 4 — safety and movement limits.
  safetyTitle: "Safety and movement limits",
  safetyNote: "This is not diagnostic information. It tells us which exercises to leave out.",
  limitationsLabel: "Injuries, pain or exercises to avoid",
  limitationsPlaceholder: "e.g. old right knee injury, avoid jumping. Leave blank if none.",
  safetyWarning: "Stop training and get professional medical help if you have chest pain, fainting, difficulty breathing, an inability to bear weight, or pain that keeps getting worse.",

  // Step 5 — food preferences.
  dietTitle: "Food preferences",
  dietNote: "Optional. It keeps the guidance close to how you actually eat.",
  dietBalanced: "Balanced",
  dietVegetarian: "Vegetarian",
  dietHighProtein: "High protein",
  dietNone: "No preference",
  exclusionsLabel: "Foods you avoid",
  exclusionsPlaceholder: "Leave blank if none",

  // Step 6 — confirm and generate.
  confirmTitle: "Confirm to generate your plan",
  confirmNote: "These numbers come from deterministic rules. The AI arranges the full training week and it passes the safety checks again.",
  summaryCalories: "Daily calories",
  summaryProtein: "Protein",
  summaryWeeklyTraining: "Weekly training",
  summaryCycle: "Suggested cycle",
  unitDays: "days",
  unitWeeks: "weeks",
  startDateTitle: "When should the plan start?",
  startDateNote: "If you finish late in the day, the plan starts tomorrow by default. Once it is active, days are tracked by real date instead of always starting on Monday.",
  startToday: "Today",
  startTomorrow: "Tomorrow",
  startDateLabel: "Plan start date",
  consentText: "I understand that Cmine Fit gives general training and nutrition information and does not replace medical diagnosis, and that I will stop an exercise if the pain is not normal.",

  // Footer navigation shared by every step.
  back: "← Back",
  saving: "Saving…",
  confirmAndGenerate: "Confirm and generate my plan",
  saveAndContinue: "Save and continue",
} as const satisfies Widen<typeof onboardingZh>;
