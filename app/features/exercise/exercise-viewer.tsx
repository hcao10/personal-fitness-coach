"use client";

import { useEffect, useId, useMemo } from "react";
import { EQUIPMENT_LABELS } from "../../shared/ui/equipment-label";
import { Dialog } from "../../shared/ui/dialog";
import { useLocale } from "../../lib/i18n-provider";
import { emitProductEvent } from "../../shared/analytics/product-events";
import { useExerciseSteps } from "./use-exercise-steps";
import { ExerciseDemo } from "./exercise-demo";
import { catalogIdFor, exerciseGuidance, substitutesFor, type ExerciseView } from "../../../packages/exercise-catalog/src";
import { pick } from "../../../packages/i18n/src";
import type { CoachContext } from "../../../packages/product-state/src";
import type { Equipment } from "../../lib/coach";

/**
 * The one exercise detail view.
 *
 * Today and the exercise library each had their own modal: different markup,
 * different fallbacks, different keyboard behaviour, and only one of them
 * bothered with the animated demo. This replaces both, and the coach's action
 * cards and the plan overview use it too — so a movement looks and behaves the
 * same wherever the user meets it.
 *
 * The media rule is the reason it is worth sharing, and it lives one file over
 * in ExerciseStage: the still loads first, the animation replaces it, and a
 * movement with no shipped media says so in words rather than leaving a broken
 * image frame.
 */

export function ExerciseViewer({ exercises, index, onIndexChange, onClose, equipment, surface, coachContext, onAskCoach, onSwap }: {
  exercises: ExerciseView[];
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
  equipment: Equipment;
  surface: "plan" | "today" | "library" | "coach";
  /** Plan/day ids so a question carries structure rather than a sentence. */
  coachContext?: Pick<CoachContext, "planId" | "dayIndex" | "occurrenceId" | "baseVersionId">;
  onAskCoach?: (context: CoachContext) => void;
  onSwap?: (from: ExerciseView, to: ExerciseView) => void;
}) {
  const { locale, t } = useLocale();
  const titleId = useId();
  const view = exercises[index];

  // The dataset is keyed by its own ids, which is not always the plan's id.
  const catalogId = view ? catalogIdFor(view) : null;
  const fetchedSteps = useExerciseSteps(catalogId, Boolean(view?.steps));
  const enriched = useMemo<ExerciseView | null>(
    () => view ? { ...view, steps: view.steps ?? fetchedSteps ?? undefined } : null,
    [view, fetchedSteps],
  );

  useEffect(() => {
    if (!view) return;
    emitProductEvent({ name: "exercise_viewed", surface, hasMedia: Boolean(view.asset) });
  }, [view, surface]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" && index < exercises.length - 1) onIndexChange(index + 1);
      if (event.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [index, exercises.length, onIndexChange]);

  if (!enriched) return null;

  const name = pick(enriched.name, locale) || enriched.id;
  const guidance = exerciseGuidance(enriched, locale);
  const substitutes = substitutesFor(enriched, equipment);
  const ask = (intent: CoachContext["intent"]) => onAskCoach?.({ intent, exerciseId: enriched.id, ...coachContext,
    exerciseInstanceId: coachContext?.occurrenceId ? `${coachContext.occurrenceId}:${index}` : undefined });

  return (
    <Dialog open onClose={onClose} labelledBy={titleId} className="exercise-viewer" backdropClassName="exercise-viewer-backdrop">
      <header className="exercise-viewer-head">
        <div>
          <span>{pick(enriched.target, locale) || enriched.equipment}</span>
          <h2 id={titleId}>{name}</h2>
        </div>
        <button type="button" className="exercise-viewer-close" onClick={onClose}>{t("product.viewer.close")}</button>
      </header>

      <div className="exercise-viewer-stage">
        {/* Keyed on the movement so its media state resets with it, rather than
            being cleared by an effect a render later. */}
        <ExerciseDemo key={enriched.id} view={enriched} size="large" />
        {exercises.length > 1 && (
          <nav className="exercise-viewer-paging" aria-label={t("product.viewer.position", { index: index + 1, total: exercises.length })}>
            <button type="button" onClick={() => onIndexChange(index - 1)} disabled={index === 0}>{t("product.viewer.previous")}</button>
            <span>{t("product.viewer.position", { index: index + 1, total: exercises.length })}</span>
            <button type="button" onClick={() => onIndexChange(index + 1)} disabled={index >= exercises.length - 1}>{t("product.viewer.next")}</button>
          </nav>
        )}
      </div>

      <div className="exercise-viewer-body">
        <dl className="exercise-viewer-facts">
          <div><dt>{t("product.viewer.target")}</dt><dd>{pick(enriched.target, locale) || "—"}</dd></div>
          <div><dt>{t("product.viewer.equipment")}</dt><dd>{EQUIPMENT_LABELS[enriched.equipment] ? t(EQUIPMENT_LABELS[enriched.equipment]) : enriched.equipment}</dd></div>
          {enriched.prescription && (
            <div>
              <dt>{t("product.viewer.prescriptionLabel")}</dt>
              <dd>{t("product.viewer.prescription", { sets: enriched.prescription.sets, reps: enriched.prescription.reps, rest: enriched.prescription.rest })}</dd>
            </div>
          )}
        </dl>

        <section className="exercise-viewer-section">
          <h3>{t("product.viewer.stepsTitle")}</h3>
          <ol>{guidance.steps.map((step, position) => <li key={`${position}:${step}`}>{step}</li>)}</ol>
        </section>

        <section className="exercise-viewer-section">
          <h3>{t("product.viewer.breathingTitle")}</h3>
          <p>{guidance.breathing}</p>
        </section>

        <section className="exercise-viewer-section">
          <h3>{t("product.viewer.mistakesTitle")}</h3>
          <ul>{guidance.mistakes.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>

        <section className="exercise-viewer-section exercise-viewer-stop">
          <h3>{t("product.viewer.stopTitle")}</h3>
          <ul>{guidance.stopConditions.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>

        <section className="exercise-viewer-section">
          <h3>{t("product.viewer.substitutesTitle")}</h3>
          {substitutes.length ? (
            <ul className="exercise-viewer-substitutes">
              {substitutes.map((substitute) => (
                <li key={substitute.id}>
                  <span>{pick(substitute.name, locale) || substitute.id}</span>
                  {onSwap && <button type="button" onClick={() => onSwap(enriched, substitute)}>{t("product.viewer.swap")}</button>}
                </li>
              ))}
            </ul>
          ) : <p>{t("product.viewer.noSubstitutes")}</p>}
        </section>

        {onAskCoach && (
          <div className="exercise-viewer-actions">
            <button type="button" onClick={() => ask("how_to_perform")}>{t("product.coach.quickHowTo")}</button>
            <button type="button" onClick={() => ask("common_mistakes")}>{t("product.coach.quickMistakes")}</button>
            <button type="button" onClick={() => ask("stop_conditions")}>{t("product.coach.quickStop")}</button>
            <button type="button" onClick={() => ask("substitute_exercise")}>{t("product.coach.quickSwap")}</button>
          </div>
        )}

        {enriched.attribution && <small className="exercise-viewer-credit">{t("product.viewer.attribution")}: {enriched.attribution}</small>}
      </div>
    </Dialog>
  );
}
