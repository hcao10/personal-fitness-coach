import type { exercisesZh } from "./exercises.zh.ts";
import type { Widen } from "./widen.ts";

// Copy for app/exercises.
export const exercisesEn = {
  metaTitle: "Exercise catalog · Cmine Fit",
  metaDescription: "Find exercises and their safety cues by body part, equipment or name.",

  // The Chinese eyebrow pairs an English ornament with a Chinese gloss; in
  // English the gloss would just repeat the ornament, so only the ornament stays.
  eyebrow: "EXERCISE CATALOG",
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
  equipmentMachine: "Machine",
  catalogNote: "There are {count} exercises to browse. Your AI plan currently draws on the safety-reviewed subset, and nothing here replaces an exercise in your plan until you confirm it.",
  loading: "Loading the exercise catalog…",

  demoAlt: "{name} demonstration",
  primaryTarget: "Primary target: {target}",
  supportingMuscles: "Supporting muscles: {muscles}",
  muscleSeparator: ", ",
  notSpecified: "Not listed",
  askCoachToSwap: "Ask Coach if this swap works →",
  swapPrompt: "I want to replace my current exercise with {name}. Based on my plan, my equipment and my movement limits, is it a good fit?",
} as const satisfies Widen<typeof exercisesZh>;
