/** Wire contracts. No SDK or database dependency. */
export type CoachScene = {
  intent?: string;
  planId?: string;
  baseVersionId?: string;
  occurrenceId?: string;
  dayIndex?: number;
  exerciseId?: string;
  exerciseInstanceId?: string;
  availableMinutes?: number;
};

export type CoachFact = {
  id: string; label: string; value: string; observedAt?: string; source: string;
};

export type SessionChangeInput =
  | { type: 'shorten_session'; availableMinutes: number }
  | { type: 'replace_exercise'; exerciseInstanceId: string; replacementExerciseId: string }
  | { type: 'adjust_load'; exerciseInstanceId: string; loadMultiplier: number };
