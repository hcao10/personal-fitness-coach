"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import ProductShell from "../../components/product-shell";
import { useLocale } from "../../lib/i18n-provider";
import { beginCmineLogin } from "../../lib/auth";
import { useEntry } from "../../shared/api/capability-provider";
import { EntryGate } from "../../shared/async-state/entry-gate";
import { describeFailure } from "../../shared/api/client";
import { emitProductEvent } from "../../shared/analytics/product-events";
import { ExerciseViewer } from "../exercise/exercise-viewer";
import { CoachDock } from "../coach/coach-dock";
import { planRepository } from "./repository";
import { dayIndexFor, localDate, planReasons, shiftDate, type PlanRecord, type PlanState } from "./plan-imports";
import { planReasonLine } from "../../../packages/product-state/src";
import { ExerciseStage } from "../exercise/exercise-stage";
import { fromPlannedExercise, type ExerciseView } from "../../../packages/exercise-catalog/src";
import { pick, type MessageKey } from "../../../packages/i18n/src";
import type { CoachContext } from "../../../packages/product-state/src";

/**
 * The plan overview.
 *
 * There was no such page. A generated plan expanded a section further down the
 * marketing homepage, under the intake form that produced it, so "here is your
 * plan" and "fill in this form" competed for the same screen and neither won.
 *
 * The order below is the order of the questions a reader actually has: what is
 * this, why is it this, what does the week look like, what am I doing on each
 * day, and how do I start. Accepting is the only primary action.
 */

const GOAL_LABELS: Record<string, MessageKey> = {
  fat_loss: "onboarding.goalFatLoss", muscle: "onboarding.goalMuscle",
  recomp: "onboarding.goalRecomp", arms: "onboarding.goalArms", strength: "onboarding.goalStrength",
};

export default function PlanClient() {
  const { locale, t } = useLocale();
  const probe = useEntry(true);
  const [forcedGuest, setForcedGuest] = useState(false);
  const [state, setState] = useState<PlanState | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeDay, setActiveDay] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [coachRequest, setCoachRequest] = useState<CoachContext | null>(null);

  const mode: "guest" | "account" = probe.entry.status === "account" && !forcedGuest ? "account" : "guest";

  useEffect(() => {
    if (probe.entry.status === "loading") return;
    if (probe.entry.status === "error" && !forcedGuest) return;
    let active = true;
    void planRepository(mode, locale).load().then((loaded) => {
      if (!active) return;
      setState(loaded);
      const record = loaded.status === "draft" || loaded.status === "active" ? loaded.record : null;
      if (record) setActiveDay(dayIndexFor(record, localDate(new Date())) ?? 0);
    });
    return () => { active = false; };
  }, [probe.entry.status, forcedGuest, mode, locale]);

  const record: PlanRecord | null = useMemo(
    () => state && (state.status === "draft" || state.status === "active") ? state.record : null,
    [state],
  );

  const accept = async () => {
    if (!record) return;
    setBusy(true); setMessage("");
    const result = await planRepository(mode, locale).accept(record);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.failure ? describeFailure(result.failure, locale, t("product.plan.generateFailed")) : t("product.plan.generateFailed"));
      return;
    }
    setState(result.state);
    emitProductEvent({ name: "plan_accepted", source: record.source, mode });
  };

  const day = record?.plan.schedule[activeDay];
  const dayExercises: ExerciseView[] = useMemo(() => (day?.exercises || []).map(fromPlannedExercise), [day]);
  const onAskCoach = useCallback((context: CoachContext) => { setViewerIndex(null); setCoachRequest(context); }, []);

  return (
    <ProductShell active="" eyebrow={t("product.plan.eyebrow")} title={t("product.plan.title")}
      action={<Link className="header-chip" href="/onboarding">{t("product.plan.adjust")}</Link>}>
      <EntryGate
        entry={forcedGuest ? { status: "guest", reason: "accounts_not_configured" } : probe.entry}
        missingTables={probe.missingTables}
        onRetry={probe.refresh}
        onContinueLocal={() => setForcedGuest(true)}
      >
        {() => {
          if (!state) return <div className="entry-state entry-loading" role="status">{t("product.entry.loading")}</div>;
          if (!record) {
            return (
              <section className="plan-empty">
                <h2>{t("product.plan.emptyTitle")}</h2>
                <p>{t("product.plan.emptyBody")}</p>
                <Link className="primary-cta" href="/onboarding">{t("product.plan.emptyCta")} <b aria-hidden="true"></b></Link>
              </section>
            );
          }

          const accepted = state.status === "active";
          const goalLabel = GOAL_LABELS[record.profile.goal] ? t(GOAL_LABELS[record.profile.goal]) : record.profile.goal;
          const training = record.plan.schedule.filter((entry) => !entry.restDay);

          return (
            <>
              <section className="plan-summary">
                <div className="plan-summary-head">
                  <span className={`plan-source ${record.source}`}>
                    {record.source === "ai" ? t("product.plan.sourceAi") : t("product.plan.sourceRules")}
                  </span>
                  <span className={`plan-status ${accepted ? "active" : "draft"}`}>
                    {accepted ? t("product.plan.active") : t("product.plan.draft")}
                  </span>
                </div>
                <h2>{t("product.plan.summary", {
                  goal: goalLabel,
                  days: training.length,
                  minutes: training[0]?.duration ?? Number(record.profile.sessionMinutes || 0),
                  weeks: record.plan.weeks,
                })}</h2>
                <p className="plan-source-note">{record.source === "ai" ? t("product.plan.sourceAiNote") : t("product.plan.sourceRulesNote")}</p>
                <dl className="plan-macros">
                  <div><dt>{t("product.plan.calories")}</dt><dd>{record.plan.calories.toLocaleString()} kcal</dd></div>
                  <div><dt>{t("product.plan.protein")}</dt><dd>{record.plan.protein} g</dd></div>
                  <div><dt>{t("product.plan.carbs")}</dt><dd>{record.plan.carbs} g</dd></div>
                  <div><dt>{t("product.plan.fat")}</dt><dd>{record.plan.fat} g</dd></div>
                </dl>
                <div className="plan-actions">
                  {accepted
                    ? <Link className="primary-cta" href="/today">{t("product.plan.start")} <b aria-hidden="true"></b></Link>
                    : <button type="button" className="primary-cta" disabled={busy} onClick={() => void accept()}>
                        {busy ? t("product.plan.generating") : t("product.plan.accept")} <b aria-hidden="true"></b>
                      </button>}
                  <Link className="secondary-cta" href="/onboarding">{t("product.plan.adjust")}</Link>
                </div>
                <p className="plan-storage-note">
                  {mode === "account" ? t("product.plan.savedAccount") : t("product.plan.savedLocal")}
                  {mode === "guest" && probe.capabilities?.accounts && (
                    <button type="button" className="link-button" onClick={() => void beginCmineLogin("/plan", locale)}>
                      {t("product.plan.signInToSync")}
                    </button>
                  )}
                </p>
                {message && <p className="form-message" role="alert">{message}</p>}
              </section>

              <section className="plan-why">
                <h2>{t("product.plan.whyTitle")}</h2>
                {/* Derived from the profile and the deterministic prescription,
                    so every line can be checked against a number elsewhere on
                    this page — including for an AI plan. */}
                <ol>{planReasons(record).map((reason) => {
                  const line = planReasonLine(reason, locale);
                  return <li key={line}>{line}</li>;
                })}</ol>
              </section>

              <section className="plan-week">
                <h2>{t("product.plan.weekTitle")}</h2>
                <div className="plan-day-tabs" role="tablist" aria-label={t("product.plan.weekTitle")}>
                  {record.plan.schedule.map((entry, index) => (
                    <button key={index} type="button" role="tab" id={`plan-day-${index}`}
                      aria-selected={activeDay === index} aria-controls="plan-day-panel"
                      tabIndex={activeDay === index ? 0 : -1}
                      className={activeDay === index ? "active" : ""}
                      onClick={() => setActiveDay(index)}>
                      <span>{new Date(`${shiftDate(record.startDate, index)}T12:00:00`).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric", weekday: "short" })}</span>
                      <b>{entry.restDay ? t("product.plan.restDay") : t("product.plan.minutesUnit", { minutes: entry.duration })}</b>
                    </button>
                  ))}
                </div>

                <div id="plan-day-panel" role="tabpanel" aria-labelledby={`plan-day-${activeDay}`} tabIndex={-1}>
                  {day?.restDay ? (
                    <p className="plan-rest">{pick(day.focus, locale)}</p>
                  ) : (
                    <ul className="plan-exercise-grid">
                      {dayExercises.map((view, index) => (
                        <li key={view.id}>
                          <button type="button" onClick={() => setViewerIndex(index)}
                            aria-label={t("product.viewer.openAria", { name: pick(view.name, locale) || view.id })}>
                            {/* Still only: eight autoplaying demos on one screen
                                is noise, and the viewer is one click away. */}
                            <ExerciseStage key={view.id} view={view} size="thumb" animate={false} />
                            <b>{pick(view.name, locale) || view.id}</b>
                            <small>{pick(view.target, locale)}</small>
                            {view.prescription && <span className="plan-exercise-dose">
                              {t("product.viewer.prescription", { sets: view.prescription.sets, reps: view.prescription.reps, rest: view.prescription.rest })}
                            </span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>

              {viewerIndex !== null && dayExercises[viewerIndex] && (
                <ExerciseViewer
                  exercises={dayExercises} index={viewerIndex} onIndexChange={setViewerIndex}
                  onClose={() => setViewerIndex(null)} equipment={record.profile.equipment}
                  surface="plan" coachContext={{ planId: record.id, dayIndex: activeDay }} onAskCoach={onAskCoach}
                />
              )}

              <CoachDock
                plan={record} dayIndex={activeDay}
                aiAvailable={Boolean(probe.capabilities?.ai)}
                signedIn={Boolean(probe.session?.signedIn)}
                accountsConfigured={Boolean(probe.capabilities?.accounts)}
                request={coachRequest}
              />
            </>
          );
        }}
      </EntryGate>
    </ProductShell>
  );
}
