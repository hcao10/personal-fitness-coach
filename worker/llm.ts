import { EXERCISES, generatePlan, isExerciseAllowed, type CoachPlan, type Profile, type WorkoutDay } from "../app/lib/coach";
import type { WorkerEnv } from "./platform";

type AiExercise = { exercise_id: string; sets: number; reps: string; rest_seconds: number };
type AiDay = {
  day_index: number;
  rest_day: boolean;
  title_zh: string;
  title_en: string;
  focus_zh: string;
  focus_en: string;
  duration_minutes: number;
  exercises: AiExercise[];
};
type AiPlanOutput = {
  summary_zh: string;
  summary_en: string;
  plan_rationale_zh: string[];
  plan_rationale_en: string[];
  coach_notes_zh: string[];
  coach_notes_en: string[];
  diet_guidance_zh: string[];
  diet_guidance_en: string[];
  days: AiDay[];
};

export type PlanGenerationResult = {
  plan: CoachPlan;
  source: "llm";
  model: string;
  requestId: string | null;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    reasoningTokens: number | null;
  };
};

const responseSchema = (exerciseIds: string[]) => ({
  type: "object",
  additionalProperties: false,
  required: [
    "summary_zh", "summary_en", "plan_rationale_zh", "plan_rationale_en",
    "coach_notes_zh", "coach_notes_en", "diet_guidance_zh", "diet_guidance_en", "days",
  ],
  properties: {
    summary_zh: { type: "string", minLength: 8, maxLength: 180 },
    summary_en: { type: "string", minLength: 8, maxLength: 240 },
    plan_rationale_zh: { type: "array", minItems: 3, maxItems: 3, items: { type: "string", minLength: 8, maxLength: 120 } },
    plan_rationale_en: { type: "array", minItems: 3, maxItems: 3, items: { type: "string", minLength: 8, maxLength: 180 } },
    coach_notes_zh: { type: "array", minItems: 3, maxItems: 3, items: { type: "string", minLength: 4, maxLength: 100 } },
    coach_notes_en: { type: "array", minItems: 3, maxItems: 3, items: { type: "string", minLength: 4, maxLength: 140 } },
    diet_guidance_zh: { type: "array", minItems: 3, maxItems: 3, items: { type: "string", minLength: 4, maxLength: 100 } },
    diet_guidance_en: { type: "array", minItems: 3, maxItems: 3, items: { type: "string", minLength: 4, maxLength: 140 } },
    days: {
      type: "array", minItems: 7, maxItems: 7, items: {
        type: "object", additionalProperties: false,
        required: ["day_index", "rest_day", "title_zh", "title_en", "focus_zh", "focus_en", "duration_minutes", "exercises"],
        properties: {
          day_index: { type: "integer", minimum: 0, maximum: 6 },
          rest_day: { type: "boolean" },
          title_zh: { type: "string", maxLength: 30 },
          title_en: { type: "string", maxLength: 50 },
          focus_zh: { type: "string", maxLength: 50 },
          focus_en: { type: "string", maxLength: 80 },
          duration_minutes: { type: "integer", minimum: 20, maximum: 90 },
          exercises: {
            type: "array", maxItems: 6, items: {
              type: "object", additionalProperties: false,
              required: ["exercise_id", "sets", "reps", "rest_seconds"],
              properties: {
                exercise_id: { type: "string", enum: exerciseIds },
                sets: { type: "integer", minimum: 2, maximum: 5 },
                reps: { type: "string", enum: ["5", "6-8", "8-10", "8-12", "10-12", "12-15", "8/side", "10/side", "12/side"] },
                rest_seconds: { type: "integer", minimum: 30, maximum: 180 },
              },
            },
          },
        },
      },
    },
  },
});

function extractOutputText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as { output_text?: unknown; output?: unknown };
  if (typeof body.output_text === "string") return body.output_text;
  if (!Array.isArray(body.output)) return null;
  for (const item of body.output) {
    if (!item || typeof item !== "object" || !Array.isArray((item as { content?: unknown }).content)) continue;
    for (const content of (item as { content: unknown[] }).content) {
      if (content && typeof content === "object" && typeof (content as { text?: unknown }).text === "string") {
        return (content as { text: string }).text;
      }
    }
  }
  return null;
}

function applyAiPlan(profile: Profile, base: CoachPlan, output: AiPlanOutput): CoachPlan {
  const sorted = [...output.days].sort((a, b) => a.day_index - b.day_index);
  if (sorted.length !== 7 || sorted.some((day, index) => day.day_index !== index)) throw new Error("AI_SCHEDULE_INVALID");
  if (sorted.filter((day) => !day.rest_day).length !== profile.days) throw new Error("AI_TRAINING_DAYS_INVALID");
  const expectedTrainingDays = new Set(base.schedule.filter((day) => !day.restDay).map((day) => day.dayIndex));
  if (sorted.some((day) => day.rest_day === expectedTrainingDays.has(day.day_index))) throw new Error("AI_TRAINING_SPACING_INVALID");
  const schedule: WorkoutDay[] = sorted.map((day, index) => {
    if (day.rest_day) {
      return {
        dayIndex: index, title: { zh: day.title_zh, en: day.title_en },
        focus: { zh: day.focus_zh, en: day.focus_en }, duration: day.duration_minutes,
        exercises: [], restDay: true,
      };
    }
    const seen = new Set<string>();
    const exercises = day.exercises.flatMap((item) => {
      const exercise = EXERCISES[item.exercise_id];
      if (!exercise || seen.has(exercise.id) || !isExerciseAllowed(exercise, profile.equipment)) return [];
      seen.add(exercise.id);
      return [{
        ...exercise,
        sets: Math.max(2, Math.min(5, Math.round(item.sets))),
        reps: item.reps,
        rest: `${Math.max(30, Math.min(180, Math.round(item.rest_seconds)))}s`,
      }];
    });
    if (exercises.length < (profile.equipment === "bodyweight" ? 2 : 3)) throw new Error("AI_EXERCISES_INVALID");
    return {
      dayIndex: index, title: { zh: day.title_zh, en: day.title_en },
      focus: { zh: day.focus_zh, en: day.focus_en }, duration: day.duration_minutes, exercises,
    };
  });
  return {
    ...base,
    schedule,
    insights: {
      summary: { zh: output.summary_zh, en: output.summary_en },
      planRationale: { zh: output.plan_rationale_zh, en: output.plan_rationale_en },
      coachNotes: { zh: output.coach_notes_zh, en: output.coach_notes_en },
      dietGuidance: { zh: output.diet_guidance_zh, en: output.diet_guidance_en },
    },
  };
}

function reasoningEffort(value: string | undefined): "none" | "minimal" | "low" | "medium" | "high" {
  return value === "none" || value === "minimal" || value === "low" || value === "high" ? value : "medium";
}

async function requestOpenAi(env: WorkerEnv, body: unknown): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch(env.OPENAI_BASE_URL || "https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (response.status !== 429 && response.status < 500) return response;
      lastError = new Error(`AI_RETRYABLE:${response.status}`);
      if (attempt === 1) return response;
    } catch (error) {
      lastError = error;
      if (attempt === 1) throw error;
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, 250 + Math.floor(Math.random() * 250)));
  }
  throw lastError instanceof Error ? lastError : new Error("AI_REQUEST_FAILED");
}

export async function generateLlmPlan(env: WorkerEnv, profile: Profile, safetyIdentifier?: string): Promise<PlanGenerationResult> {
  if (!env.OPENAI_API_KEY) throw new Error("AI_NOT_CONFIGURED");
  const model = env.OPENAI_MODEL || "gpt-5.6";
  const base = generatePlan(profile);
  const allowed = Object.values(EXERCISES).filter((exercise) => isExerciseAllowed(exercise, profile.equipment));
  const trainingDays = base.schedule.filter((day) => !day.restDay).map((day) => day.dayIndex);
  const system = `You are the planning engine for Cmine Fit. Build one specific, realistic week of training. This is general fitness guidance, not medical diagnosis, treatment, or rehabilitation. The server's calorie, macro, timeline, and training-day calculations are fixed and must not be changed. Use only allowed exercise IDs. Respect experience, equipment, availability, goal, and stated limitations. Explain the user-facing rationale without exposing private chain-of-thought. Include pain, dizziness, chest pressure, unusual breathlessness, or loss of control as stop conditions. Return concise, natural Chinese and English.`;
  const input = {
    profile,
    fixed_metrics: {
      bmr: base.bmr, tdee: base.tdee, calories: base.calories, calorie_delta: base.calorieDelta,
      protein: base.protein, carbs: base.carbs, fat: base.fat, weeks: base.weeks,
    },
    required_training_day_indexes: trainingDays,
    allowed_exercises: allowed.map((exercise) => ({
      id: exercise.id, zh: exercise.name.zh, en: exercise.name.en, target: exercise.target.en,
    })),
  };
  const response = await requestOpenAi(env, {
    model,
    store: false,
    max_output_tokens: 16_000,
    reasoning: { effort: reasoningEffort(env.OPENAI_REASONING_EFFORT) },
    ...(safetyIdentifier ? { safety_identifier: safetyIdentifier.slice(0, 64) } : {}),
    input: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(input) }],
    text: {
      format: {
        type: "json_schema", name: "cmine_fit_plan", strict: true,
        schema: responseSchema(allowed.map((exercise) => exercise.id)),
      },
    },
  });
  const payload = await response.json().catch(() => null) as ({
    id?: string;
    status?: string;
    incomplete_details?: { reason?: string };
    error?: { message?: string };
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      output_tokens_details?: { reasoning_tokens?: number };
    };
  } | null);
  if (!response.ok) throw new Error(`AI_REQUEST_FAILED:${response.status}:${payload?.error?.message || "unknown"}`);
  if (payload?.status === "incomplete") throw new Error(`AI_INCOMPLETE:${payload.incomplete_details?.reason || "unknown"}`);
  const outputText = extractOutputText(payload);
  if (!outputText) throw new Error("AI_EMPTY_RESPONSE");
  let parsed: AiPlanOutput;
  try { parsed = JSON.parse(outputText) as AiPlanOutput; } catch { throw new Error("AI_JSON_INVALID"); }
  return {
    plan: applyAiPlan(profile, base, parsed),
    source: "llm",
    model,
    requestId: payload?.id || null,
    usage: {
      inputTokens: payload?.usage?.input_tokens ?? null,
      outputTokens: payload?.usage?.output_tokens ?? null,
      reasoningTokens: payload?.usage?.output_tokens_details?.reasoning_tokens ?? null,
    },
  };
}
