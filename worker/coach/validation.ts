import { z } from 'zod';

export const sceneSchema = z.object({
  intent: z.string().max(60).optional(), planId: z.string().max(100).optional(),
  baseVersionId: z.string().max(100).optional(), occurrenceId: z.string().max(100).optional(),
  dayIndex: z.number().int().min(0).max(6).optional(), exerciseId: z.string().max(100).optional(),
  exerciseInstanceId: z.string().max(150).optional(), availableMinutes: z.number().int().min(10).max(90).optional(),
}).strict();

export const changeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('shorten_session'), availableMinutes: z.number().int().min(10).max(90) }),
  z.object({ type: z.literal('replace_exercise'), exerciseInstanceId: z.string(), replacementExerciseId: z.string() }),
  z.object({ type: z.literal('adjust_load'), exerciseInstanceId: z.string(), loadMultiplier: z.number().min(.8).max(1.05) }),
]);

export const answerSchema = z.object({
  reply: z.string().min(2).max(3000),
  intent: z.enum(['explain_plan', 'adjust_today', 'exercise_help', 'nutrition', 'progress', 'general_knowledge', 'safety']),
  safety: z.object({ highRisk: z.boolean(), category: z.string().max(60), detail: z.string().max(200) }),
  evidenceIds: z.array(z.string()).max(8), knowledgeIds: z.array(z.string()).max(4),
  proposalIds: z.array(z.string()).max(1), limitations: z.array(z.string().max(240)).max(5),
});
