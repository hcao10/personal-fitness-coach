/**
 * One exercise shape for every surface that shows one.
 *
 * The plan page, Today, the exercise library and the coach's action cards each
 * built their own object and their own modal. Two of those modals existed, with
 * different markup, different fallbacks and different keyboard behaviour, and
 * the library one showed a placeholder letter for 150 movements whose media is
 * actually shipped — because the catalog JSON records `asset: null` for
 * everything outside the hand-curated seventeen, while the plannable pool knows
 * the real asset id.
 *
 * `toExerciseView` is where those disagreements are resolved, once.
 */

import { EXERCISE_POOL, EXERCISES, exercisePattern, isExerciseAllowed, type Equipment, type Exercise, type MovementPattern, type PlannedExercise } from "../../coach-core/src/index.ts";
import type { Localized, LocalizedPartial } from "../../i18n/src/locales.ts";

export type ExercisePrescription = {
  sets: number;
  reps: string;
  rest: string;
  restSeconds?: number;
  targetRir?: number | null;
  progression?: Localized;
  suggestedLoadMultiplier?: number;
};

export type ExerciseView = {
  id: string;
  name: Localized;
  target: Localized;
  cue: Localized;
  /** Base name under /exercises; null when this movement ships no media. */
  asset: string | null;
  equipment: string;
  muscles: string[];
  pattern: MovementPattern | null;
  prescription?: ExercisePrescription;
  /** Dataset instruction steps, per language, when the catalog has them. */
  steps?: LocalizedPartial<string[]>;
  attribution?: string;
};

export const mediaFor = (asset: string | null): { still: string | null; animated: string | null } =>
  asset ? { still: `/exercises/${asset}.jpg`, animated: `/exercises/${asset}.gif` } : { still: null, animated: null };

/**
 * Pool ids are `ex0002`; the shipped dataset and the catalog JSON use `0002`.
 * One helper rather than a `.slice(2)` scattered across call sites.
 */
export const datasetId = (exerciseId: string): string => exerciseId.startsWith("ex") ? exerciseId.slice(2) : exerciseId;

const POOL_BY_DATASET_ID = new Map(EXERCISE_POOL.map((exercise) => [datasetId(exercise.id), exercise]));
const CURATED_BY_ASSET_PREFIX = new Map(Object.values(EXERCISES).map((exercise) => [exercise.asset.split("-")[0], exercise]));

/** The asset a dataset row really has, whether or not the catalog recorded it. */
export function resolveAsset(id: string, declared?: string | null): string | null {
  if (declared) return declared;
  const key = datasetId(id);
  return POOL_BY_DATASET_ID.get(key)?.asset ?? CURATED_BY_ASSET_PREFIX.get(key)?.asset ?? null;
}

/**
 * The id this movement has in the shipped dataset, or null when it has none.
 *
 * Pool ids carry it directly (`ex0032` → `0032`). The seventeen hand-curated
 * movements do not — their ids are words like `bench` — but their asset name
 * starts with the dataset id, which is why the fallback below exists: without it
 * exactly the movements with the best hand-written cues would be the ones whose
 * numbered steps never load.
 */
export function catalogIdFor(view: { id: string; asset: string | null }): string | null {
  const fromId = datasetId(view.id);
  if (/^\d+$/.test(fromId)) return fromId;
  const fromAsset = view.asset?.split("-")[0];
  return fromAsset && /^\d+$/.test(fromAsset) ? fromAsset : null;
}

export function fromPlannedExercise(exercise: PlannedExercise): ExerciseView {
  return {
    id: exercise.id, name: exercise.name, target: exercise.target, cue: exercise.cue,
    asset: exercise.asset || null, equipment: exercise.equipment, muscles: exercise.muscles || [],
    pattern: exercisePattern(exercise.id),
    prescription: {
      sets: exercise.sets, reps: exercise.reps, rest: exercise.rest,
      restSeconds: exercise.restSeconds, targetRir: exercise.targetRir, progression: exercise.progression,
      suggestedLoadMultiplier: exercise.suggestedLoadMultiplier,
    },
  };
}

export function fromExercise(exercise: Exercise): ExerciseView {
  return {
    id: exercise.id, name: exercise.name, target: exercise.target, cue: exercise.cue,
    asset: exercise.asset || null, equipment: exercise.equipment, muscles: exercise.muscles || [],
    pattern: exercisePattern(exercise.id),
  };
}

/** A row from /api/v1/exercises/search — English-only names, per-language steps. */
export type CatalogRow = {
  id: string;
  name: string;
  bodyPart: string;
  target: string;
  muscleGroup?: string;
  secondaryMuscles?: string[];
  equipment: string;
  instructions?: LocalizedPartial<string[]>;
  asset?: string | null;
  attribution?: string;
};

export function fromCatalogRow(row: CatalogRow): ExerciseView {
  const pooled = POOL_BY_DATASET_ID.get(datasetId(row.id));
  // The dataset is indexed in English. Where the reviewed pool has a Chinese
  // name for the same movement it is used; where it does not, the English name
  // is shown to both languages rather than machine-translated on the fly.
  const name: Localized = pooled?.name ?? { zh: row.name, en: row.name };
  const target: Localized = pooled?.target ?? { zh: row.target, en: row.target };
  const cue: Localized = pooled?.cue ?? {
    zh: row.instructions?.zh?.[0] ?? row.instructions?.en?.[0] ?? "",
    en: row.instructions?.en?.[0] ?? row.instructions?.zh?.[0] ?? "",
  };
  return {
    id: pooled?.id ?? row.id, name, target, cue,
    asset: resolveAsset(row.id, row.asset),
    equipment: row.equipment,
    muscles: [row.target, row.muscleGroup, ...(row.secondaryMuscles || [])].filter((value): value is string => Boolean(value)),
    pattern: pooled?.pattern ?? null,
    steps: row.instructions,
    attribution: row.attribution,
  };
}

/**
 * Same-pattern movements the user can actually perform with their equipment.
 * The basis for "swap this" — deterministic, and available with no model.
 */
export function substitutesFor(view: ExerciseView, equipment: Equipment, limit = 4): ExerciseView[] {
  if (!view.pattern) return [];
  return EXERCISE_POOL
    .filter((candidate) => candidate.pattern === view.pattern
      && candidate.id !== view.id
      && candidate.asset !== view.asset
      && isExerciseAllowed(candidate, equipment))
    .slice(0, Math.max(1, limit))
    .map(fromExercise);
}
