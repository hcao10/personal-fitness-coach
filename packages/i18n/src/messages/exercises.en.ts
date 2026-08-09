import type { exercisesZh } from "./exercises.zh.ts";
import type { Widen } from "./widen.ts";

// Copy for app/exercises.
export const exercisesEn = {
  metaTitle: "Exercise catalog · Cmine Fit",
  metaDescription: "Find exercises and their safety cues by body part, equipment or name.",

  // Every page eyebrow is a two-part "ORNAMENT / GLOSS". A literal translation
  // of the Chinese gloss would just repeat the ornament here, so English says
  // what the page is actually for instead of dropping the second half.
  eyebrow: "EXERCISE CATALOG / FORM AND SAFETY CUES",
  title: "Know the exercise before you train it",
  backToToday: "Back to today's training",

  searchPlaceholder: "Search by exercise, muscle or body part",
  searchAction: "Search",
  equipmentAll: "All equipment",
  equipmentBodyweight: "Bodyweight",
  equipmentDumbbell: "Dumbbell",
  equipmentBarbell: "Barbell",
  equipmentCable: "Cable",
  equipmentBand: "Resistance band",
  // The option sends `equipment=leverage machine`, which the catalog matches
  // exactly — smith, sled, elliptical and stepmill machines are separate values
  // and never come back. "Machine" promised all of them, so it names the one.
  equipmentMachine: "Leverage machine",
  catalogNote: "There are {count} exercises to browse. Your AI plan currently draws on the safety-reviewed subset, and nothing here replaces an exercise in your plan until you confirm it.",
  catalogNotePending: "Loading the exercise catalog. Your AI plan currently draws on the safety-reviewed subset, and nothing here replaces an exercise in your plan until you confirm it.",
  loading: "Loading the exercise catalog…",

  demoAlt: "{name} demonstration",
  primaryTarget: "Primary target: {target}",
  supportingMuscles: "Supporting muscles: {muscles}",
  muscleSeparator: ", ",
  notSpecified: "Not listed",
  askCoachToSwap: "Ask Coach if this swap works →",
  swapPrompt: "I want to replace my current exercise with {name}. Based on my plan, my equipment and my movement limits, is it a good fit?",
} as const satisfies Widen<typeof exercisesZh>;
