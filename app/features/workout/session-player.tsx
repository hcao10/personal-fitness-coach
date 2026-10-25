"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "../../lib/i18n-provider";
import { ExerciseDemo } from "../exercise/exercise-demo";
import type { ExerciseView } from "../../../packages/exercise-catalog/src";
import { pick } from "../../../packages/i18n/src";
import type { CoachContext, WorkoutSet } from "../../../packages/product-state/src";

/**
 * Focus mode: one movement, its demo, and the sets for it.
 *
 * The page this replaces rendered every exercise, every set row and three
 * sliders at once, which is a form, not a session. Mid-workout the only things
 * that matter are what the movement looks like, what is prescribed, and marking
 * a set done — so that is all this shows, one movement at a time.
 *
 * The still image loads first and the animation replaces it; a movement with no
 * shipped media says so rather than leaving a broken frame. Set rows keep the
 * weight and rep inputs because that is the record the weekly review reads.
 */

const setKey = (exerciseId: string, setIndex: number) => `${exerciseId}:${setIndex}`;
const parseRepTarget = (reps: string) => Number((reps.match(/\d+/) || ["10"])[0]);

export function SessionPlayer({ exercises, sets, index, onIndexChange, onSaveSet, onFinish, onExit, onOpenViewer, onAskCoach, savingKey, intermediate, message }: {
  exercises: ExerciseView[];
  sets: WorkoutSet[];
  index: number;
  onIndexChange: (next: number) => void;
  onSaveSet: (set: WorkoutSet) => Promise<boolean>;
  onFinish: () => void;
  onExit: () => void;
  onOpenViewer: (index: number) => void;
  onAskCoach: (context: CoachContext) => void;
  savingKey: string | null;
  /** Intermediate and advanced users log RIR; beginners are not asked for it. */
  intermediate: boolean;
  message: string;
}) {
  const { locale, t } = useLocale();
  const [timer, setTimer] = useState(0);
  const [restDeadline, setRestDeadline] = useState(0);
  const view = exercises[index];

  useEffect(() => {
    if (!restDeadline) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((restDeadline - Date.now()) / 1000));
      setTimer(remaining);
      if (!remaining) setRestDeadline(0);
    };
    const interval = window.setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", tick); };
  }, [restDeadline]);

  const byKey = useMemo(() => new Map(sets.map((set) => [setKey(set.exerciseId, set.setIndex), set])), [sets]);
  const completed = sets.filter((set) => set.completed).length;
  const total = exercises.reduce((sum, exercise) => sum + (exercise.prescription?.sets ?? 0), 0);

  if (!view) return null;
  const name = pick(view.name, locale) || view.id;
  const prescription = view.prescription;

  const defaultSet = (setIndex: number): WorkoutSet => ({
    exerciseId: view.id, setIndex,
    setType: "working",
    targetReps: prescription?.reps ?? null,
    weightKg: null, reps: prescription ? parseRepTarget(prescription.reps) : null,
    rir: intermediate ? prescription?.targetRir ?? 2 : null,
    completed: false,
  });

  const patchSet = (setIndex: number, patch: Partial<WorkoutSet>) => {
    const current = byKey.get(setKey(view.id, setIndex)) || defaultSet(setIndex);
    const next = { ...current, ...patch };
    void onSaveSet(next).then((saved) => {
      if (!saved || !patch.completed) return;
      const seconds = prescription?.restSeconds || Number.parseInt(prescription?.rest || "60", 10) || 60;
      setTimer(seconds);
      setRestDeadline(Date.now() + seconds * 1000);
    });
  };

  return (
    <section className="session-player" aria-label={t("product.workout.focusMode")}>
      <button type="button" className="session-exit" onClick={onExit}>{t("product.workout.exitFocus")}</button>
      <header className="session-player-head">
        <div>
          <span>{t("product.viewer.position", { index: index + 1, total: exercises.length })}</span>
          <h2>{name}</h2>
          <p>{pick(view.target, locale)}</p>
        </div>
        <p className="session-progress" role="status">{t("product.workout.setsProgress", { completed, total })}</p>
      </header>

      <div className="session-media">
        {/* Keyed on the movement, so the media state resets with it. */}
        <ExerciseDemo key={view.id} view={view} size="compact" />
        <button type="button" className="session-details" onClick={() => onOpenViewer(index)}
          aria-label={t("product.viewer.openAria", { name })}>{t("product.viewer.openDetails")} <span aria-hidden="true"></span></button>
      </div>

      <p className="session-cue">{pick(view.cue, locale)}</p>
      {prescription?.suggestedLoadMultiplier !== undefined && <p role="status">
        {t('coach.loadGuidance', { percent: Math.round(prescription.suggestedLoadMultiplier * 100) })}
      </p>}

      {prescription && (
        <table className="session-sets">
          <caption className="sr-only">{t("product.viewer.prescription", { sets: prescription.sets, reps: prescription.reps, rest: prescription.rest })}</caption>
          <thead>
            <tr>
              <th scope="col">{t("product.workout.setColumn")}</th>
              <th scope="col">{t("product.workout.weightColumn")}</th>
              <th scope="col">{t("product.workout.repsColumn")}</th>
              {intermediate && <th scope="col">RIR</th>}
              <th scope="col">{t("product.workout.doneColumn")}</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: prescription.sets }, (_, setIndex) => {
              const key = setKey(view.id, setIndex);
              const value = byKey.get(key) || defaultSet(setIndex);
              return (
                <tr key={key} className={value.completed ? "done" : ""}>
                  <th scope="row">{setIndex + 1}</th>
                  <td>
                    <input type="number" inputMode="decimal" min="0" step="0.5" value={value.weightKg ?? ""}
                      aria-label={t("product.workout.weightAria", { index: setIndex + 1 })}
                      onChange={(event) => patchSet(setIndex, { weightKg: event.target.value === "" ? null : Number(event.target.value) })} />
                  </td>
                  <td>
                    <input type="number" inputMode="numeric" min="0" value={value.reps ?? ""}
                      aria-label={t("product.workout.repsAria", { index: setIndex + 1 })}
                      onChange={(event) => patchSet(setIndex, { reps: event.target.value === "" ? null : Number(event.target.value) })} />
                  </td>
                  {intermediate && (
                    <td>
                      <input type="number" inputMode="decimal" min="0" max="10" step="0.5" value={value.rir ?? ""}
                        aria-label="RIR" onChange={(event) => patchSet(setIndex, { rir: event.target.value === "" ? null : Number(event.target.value) })} />
                    </td>
                  )}
                  <td>
                    <button type="button" className={value.completed ? "set-done" : "set-todo"} disabled={Boolean(savingKey)}
                      aria-pressed={value.completed} onClick={() => patchSet(setIndex, { completed: !value.completed })}>
                      {savingKey === key ? "…" : value.completed ? "✓" : t("product.workout.markSet", { index: setIndex + 1 })}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {timer > 0 && (
        <div className="session-rest">
          <span>{t("product.workout.restTimer")}</span>
          <b role="timer" aria-live="off">{Math.floor(timer / 60)}:{String(timer % 60).padStart(2, "0")}</b>
          <button type="button" onClick={() => { setTimer(0); setRestDeadline(0); }}>{t("product.workout.skipRest")}</button>
        </div>
      )}

      <div className="session-coach-row">
        <button type="button" onClick={() => onAskCoach({ intent: "how_to_perform", exerciseId: view.id })}>{t("product.coach.quickHowTo")}</button>
        <button type="button" onClick={() => onAskCoach({ intent: "stop_conditions", exerciseId: view.id })}>{t("product.coach.quickStop")}</button>
        <button type="button" onClick={() => onAskCoach({ intent: "substitute_exercise", exerciseId: view.id })}>{t("product.coach.quickSwap")}</button>
      </div>

      {message && <p className="form-message" role="alert">{message}</p>}

      <nav className="session-nav" aria-label={t("product.workout.focusMode")}>
        <button type="button" disabled={index === 0} onClick={() => onIndexChange(index - 1)}>{t("product.workout.prevExercise")}</button>
        {index < exercises.length - 1
          ? <button type="button" className="primary-cta" onClick={() => onIndexChange(index + 1)}>{t("product.workout.nextExercise")}</button>
          : <button type="button" className="primary-cta" disabled={Boolean(savingKey)} onClick={onFinish}>{t("product.workout.finishSession")}</button>}
      </nav>
      {index < exercises.length - 1 && (
        <button type="button" className="session-finish-early" disabled={Boolean(savingKey)} onClick={onFinish}>{t("product.workout.finishSession")}</button>
      )}
    </section>
  );
}
