"use client";

import Link from "next/link";
import { useLocale } from "../../lib/i18n-provider";
import { fromPlannedExercise } from "../../../packages/exercise-catalog/src";
import { pick } from "../../../packages/i18n/src";
import { ExerciseStage } from "../exercise/exercise-stage";
import type { Action } from "./types";

export function TrainingAdjustmentCard({ action, busy, onDecide }: {
  action: Action; busy: boolean; onDecide: (action: Action, decision: "accept" | "reject") => void;
}) {
  const { locale, t } = useLocale();
  const workout = action.payload.afterWorkout;
  const before = action.payload.beforeWorkout;
  const pending = action.status === "pending";
  const accepted = action.status === "accepted";
  return <section className={`training-adjustment ${accepted ? "applied" : ""}`} aria-label={t("product.design.adjustmentTitle")}>
    <header><span>{workout ? t("product.design.adjustmentTitle") : action.payload.title}</span><b className={`adjustment-status ${action.status}`}>
      {t(pending ? "product.design.pending" : accepted ? "product.design.applied" : action.status === "rejected" ? "product.design.unchanged" : "product.design.unavailable")}
    </b></header>
    {workout ? <>
      <div className="adjustment-metrics">
        <div><span>{t("product.design.originalSession")}</span><p><b>{before?.duration ?? "—"}</b> {t("product.design.minutes")}</p><small>{t("product.plan.exercises", { count: before?.exercises.length ?? 0 })}</small></div>
        <div className="adjustment-metric-result"><span>{t("product.design.proposedSession")}</span><p><b>{workout.duration}</b> {t("product.design.minutes")}</p><small>{t("product.plan.exercises", { count: workout.exercises.length })}</small></div>
      </div>
      <ul className="adjustment-exercises">{workout.exercises.map(exercise => {
        const view = fromPlannedExercise(exercise);
        return <li key={exercise.id}><ExerciseStage view={view} size="thumb" animate={false} /><span>{pick(view.name, locale)}</span><b>{exercise.sets} × {exercise.reps}</b></li>;
      })}</ul>
    </> : <><h3>{action.payload.title}</h3><p>{action.payload.description}</p></>}
    {workout && <div className="adjustment-caption"><span>{t("product.design.todayOnly")}</span><small>{t("product.design.estimatedDuration")}</small></div>}
    {pending ? <div className="adjustment-actions">
      <button type="button" className="adjustment-secondary" disabled={busy} onClick={() => onDecide(action, "reject")}>{t("product.design.keepPlan")}</button>
      <button type="button" className="adjustment-primary" disabled={busy} onClick={() => onDecide(action, "accept")}>{t(busy ? "product.design.applying" : workout ? "product.design.applyToday" : "coach.actionAccept")}</button>
    </div> : accepted ? <Link className="adjustment-primary" href="/today">{t("product.design.openTraining")}</Link> : null}
  </section>;
}
