"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ProductShell from "../../components/product-shell";
import { useLocale } from "../../lib/i18n-provider";
import { useEntry } from "../../shared/api/capability-provider";
import { EntryGate } from "../../shared/async-state/entry-gate";
import { apiFetch, describeFailure } from "../../shared/api/client";
import { emitProductEvent } from "../../shared/analytics/product-events";
import { ExerciseViewer } from "../exercise/exercise-viewer";
import { ExerciseStage } from "../exercise/exercise-stage";
import { Icon } from "../../shared/ui/icon";
import { CoachDock } from "../coach/coach-dock";
import { planRepository } from "../plan/repository";
import { dayIndexFor, localDate, shiftDate, type PlanRecord } from "../plan/plan-imports";
import { SessionPlayer } from "./session-player";
import { FeedbackPanel } from "./feedback-panel";
import { sessionKey, workoutRepository } from "./repository";
import {
  durationForMode, exercisesForMode, nextStepAdvice, requiredSets, workoutState, encodeCoachContext,
  type CoachContext, type NextStepAdvice, type WorkoutFeedback, type WorkoutMode, type WorkoutSet,
} from "../../../packages/product-state/src";
import { fromPlannedExercise, type ExerciseView } from "../../../packages/exercise-catalog/src";
import type { WorkoutDay } from "../../../packages/coach-core/src";
import { pick } from "../../../packages/i18n/src";

/**
 * Today.
 *
 * The page this replaces opened with a daily brief, a phase card, a four-slider
 * pre-session check-in and a variant selector before it said what to do — and on
 * a deployment with no Cmine ID it never got that far, because a 401 sent it to
 * a sign-in that did not exist and it returned without clearing its loading
 * flag.
 *
 * Now the first thing on screen is the session and a start button. The account
 * extras (the brief, the check-in, rescheduling) are still here, below, behind a
 * disclosure — they are useful, they are just not the decision this page is for.
 */

type CoachHome = {
  brief?: { headline: string; summary: string; priorities: string[]; dataState: string };
  today?: { occurrenceId: string | null; scheduledDate: string; dayIndex: number; status: string; mode: WorkoutMode; workout: WorkoutDay; versionId?: string; revision?: number } | null;
};

export default function TodayClient() {
  const { locale, t } = useLocale();
  const probe = useEntry(true);
  const [forcedGuest, setForcedGuest] = useState(false);
  const [record, setRecord] = useState<PlanRecord | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [home, setHome] = useState<CoachHome | null>(null);
  const [mode, setMode] = useState<WorkoutMode>("standard");
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [advice, setAdvice] = useState<NextStepAdvice | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [coachRequest, setCoachRequest] = useState<CoachContext | null>(null);
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());
  const pendingWrites = useRef(0);
  const writeVersions = useRef(new Map<string, number>());
  const confirmedSets = useRef(new Map<string, WorkoutSet>());

  const accountMode: "guest" | "account" = probe.entry.status === "account" && !forcedGuest ? "account" : "guest";
  const today = localDate(new Date());

  useEffect(() => {
    if (probe.entry.status === "loading") return;
    if (probe.entry.status === "error" && !forcedGuest) return;
    let active = true;
    void (async () => {
      const [plan, coachHome] = await Promise.all([
        planRepository(accountMode, locale).load(),
        accountMode === "account" ? apiFetch<CoachHome>("/api/v1/coach/home") : Promise.resolve(null),
      ]);
      if (!active) return;
      const loadedRecord = plan.status === "active" || plan.status === "draft" ? plan.record : null;
      setRecord(loadedRecord);
      if (coachHome?.ok) { setHome(coachHome.data); setMode(coachHome.data.today?.mode || "standard"); }
      // The load always ends, in every branch. That is the whole fix: the page
      // this replaces returned early on a 401 and left `loading` true forever.
      setLoaded(true);
    })();
    return () => { active = false; };
  }, [probe.entry.status, forcedGuest, accountMode, locale]);

  const occurrence = home?.today ?? null;
  const dayIndex = occurrence?.dayIndex ?? (record ? dayIndexFor(record, today) : null);
  const day = occurrence?.workout ?? (record && dayIndex !== null ? record.plan.schedule[dayIndex] : null);
  const scheduledDate = occurrence?.scheduledDate ?? (record && dayIndex !== null ? shiftDate(record.startDate, dayIndex) : today);
  const key = record && dayIndex !== null ? sessionKey(record.id, dayIndex, scheduledDate) : "";
  const repository = useMemo(() => workoutRepository(accountMode), [accountMode]);

  useEffect(() => {
    if (!record || dayIndex === null || !key) return;
    let active = true;
    void repository.load(key, record.id, dayIndex, occurrence?.occurrenceId ?? null).then((snapshot) => {
      if (!active) return;
      setSets(snapshot.sets);
      confirmedSets.current = new Map(snapshot.sets.map(set => [`${set.exerciseId}:${set.setIndex}`, set]));
      // A session already finished on this device shows its advice again rather
      // than asking for the same three answers a second time.
      if (snapshot.feedback && day) setAdvice(nextStepAdvice(snapshot.feedback, day, mode));
    });
    return () => { active = false; };
    // `day` and `mode` only affect the advice recomputation, which is cheap and
    // must not re-fetch the sets; keying on them here would do exactly that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record, dayIndex, key, occurrence?.occurrenceId, repository]);

  const exercises: ExerciseView[] = useMemo(
    () => day ? exercisesForMode(day, mode).map(fromPlannedExercise) : [],
    [day, mode],
  );
  const completedSets = sets.filter((set) => set.completed).length;
  const state = day ? workoutState(day, mode, sets) : null;
  const intermediate = record?.profile.trainingTrack === "intermediate_hypertrophy"
    || record?.profile.experience === "intermediate" || record?.profile.experience === "advanced";

  const saveSet = (set: WorkoutSet): Promise<boolean> => {
    if (!record || dayIndex === null) return Promise.resolve(false);
    const setId = `${set.exerciseId}:${set.setIndex}`;
    const version = (writeVersions.current.get(setId) || 0) + 1;
    writeVersions.current.set(setId, version);
    pendingWrites.current += 1;
    setSets((current) => [...current.filter((item) => !(item.exerciseId === set.exerciseId && item.setIndex === set.setIndex)), set]);
    setSavingKey(setId);
    // Preserve input order over a slow connection. Failed optimistic writes must
    // not leave a completed checkmark that never reached the account.
    const task = writeQueue.current.then(async () => {
      let saved = false;
      try {
        const result = await repository.saveSet(key, record.id, dayIndex, occurrence?.occurrenceId ?? null, set);
        saved = result.ok;
        if (result.ok) { confirmedSets.current.set(setId, set); setMessage(""); }
        else setMessage(result.failure ? describeFailure(result.failure, locale, t("product.workout.saveFailed")) : t("product.workout.saveFailed"));
      } catch { setMessage(t("product.workout.saveFailed")); }
      if (!saved && writeVersions.current.get(setId) === version) {
        const confirmed = confirmedSets.current.get(setId);
        setSets(current => [...current.filter(item => `${item.exerciseId}:${item.setIndex}` !== setId), ...(confirmed ? [confirmed] : [])]);
      }
      pendingWrites.current -= 1;
      if (!pendingWrites.current) setSavingKey(null);
      return saved;
    });
    writeQueue.current = task;
    return task;
  };

  const submitFeedback = async (feedback: WorkoutFeedback) => {
    if (!record || dayIndex === null || !day) return;
    setBusy(true); setMessage("");
    const withDuration = { ...feedback, durationMinutes: durationForMode(day, mode) };
    const result = await repository.complete(key, record.id, dayIndex, occurrence?.occurrenceId ?? null, withDuration);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.failure ? describeFailure(result.failure, locale, t("product.workout.saveFailed")) : t("product.workout.saveFailed"));
      return;
    }
    const next = nextStepAdvice(withDuration, day, mode);
    setAdvice(next);
    setPlaying(false);
    setFinishing(false);
    emitProductEvent({ name: "workout_completed", mode: accountMode, setsLogged: completedSets });
    emitProductEvent({ name: "workout_feedback_submitted", advice: next.kind, painFlagged: next.urgent });
  };

  const onAskCoach = useCallback((context: CoachContext) => {
    setViewerIndex(null);
    const index = day?.exercises.findIndex(exercise => exercise.id === context.exerciseId) ?? -1;
    setCoachRequest({ ...context, planId: record?.id, dayIndex: dayIndex ?? undefined,
      occurrenceId: occurrence?.occurrenceId ?? undefined, baseVersionId: occurrence?.versionId,
      exerciseInstanceId: context.exerciseInstanceId || (occurrence?.occurrenceId && index >= 0 ? `${occurrence.occurrenceId}:${index}` : undefined) });
  }, [record, dayIndex, day, occurrence]);

  return (
    <ProductShell active="/today" className={playing ? "workout-screen is-playing" : "workout-screen"} eyebrow={t("today.eyebrow")} title={t("product.workout.todayTitle")}
      action={<div className="header-actions-inline">
        <Link className="header-chip" href="/plan">{t("product.plan.eyebrow")}</Link>
        <Link className="header-chip" href="/exercises">{t("today.exerciseLibraryLink")}</Link>
      </div>}>
      <EntryGate
        entry={forcedGuest ? { status: "guest", reason: "accounts_not_configured" } : probe.entry}
        missingTables={probe.missingTables}
        onRetry={probe.refresh}
        onContinueLocal={() => setForcedGuest(true)}
      >
        {() => {
          if (!loaded) return <div className="entry-state entry-loading" role="status">{t("today.loading")}</div>;
          if (!record || !day || dayIndex === null) {
            return (
              <section className="plan-empty">
                <h2>{t("today.emptyTitle")}</h2>
                <p>{t("today.emptyBody")}</p>
                <Link className="primary-cta" href="/onboarding">{t("today.emptyCta")}</Link>
              </section>
            );
          }

          if (day.restDay) {
            return (
              <>
                <section className="today-rest">
                  <h2>{t("product.workout.restDayTitle")}</h2>
                  <p>{pick(day.focus, locale) || t("product.workout.restDayBody")}</p>
                  <Link className="secondary-cta" href="/plan">{t("product.plan.eyebrow")}</Link>
                </section>
                <CoachDock contextualOnly plan={record} dayIndex={dayIndex} aiAvailable={Boolean(probe.capabilities?.ai)}
                  signedIn={Boolean(probe.session?.signedIn)} accountsConfigured={Boolean(probe.capabilities?.accounts)}
                  occurrenceId={occurrence?.occurrenceId ?? undefined} baseVersionId={occurrence?.versionId} request={coachRequest} />
              </>
            );
          }

          return (
            <>
              {!playing && !finishing && !advice && (
                <section className="today-hero">
                  <div className="today-overview"><div className="today-overview-copy">
                  <p className="today-date">{new Date(`${scheduledDate}T12:00:00`).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { month: "long", day: "numeric", weekday: "long" })}</p>
                  <h2>{pick(day.title, locale)}</h2>
                  <p className="today-focus">{pick(day.focus, locale)}</p>
                  <p className="today-dose">
                    {t("product.plan.exercises", { count: exercises.length })} · {t("product.plan.minutesUnit", { minutes: durationForMode(day, mode) })} · {t("product.workout.setsProgress", { completed: completedSets, total: requiredSets(day, mode) })}
                  </p>
                  <div className="today-primary-actions"><button type="button" className="primary-cta today-start" onClick={() => {
                    setPlaying(true);
                    emitProductEvent({ name: "workout_started", mode: accountMode, variant: mode });
                  }}>
                    <Icon name="play" />{completedSets > 0 ? t("product.workout.resumeSession") : t("product.workout.startSession")}
                  </button>
                  <Link className="today-adjust" href={`/coach?${encodeCoachContext({ intent: "free_text", planId: record.id, dayIndex, occurrenceId: occurrence?.occurrenceId ?? undefined, baseVersionId: occurrence?.versionId })}`}><Icon name="coach" />{t("product.design.changeToday")}</Link></div>
                  </div><div className="today-overview-art"><Image src="/images/brand/calm-strength-hero.webp" alt={t("refresh.today.equipmentAlt")} width={1200} height={800} priority unoptimized /></div></div>

                  {day.variants && <div className="today-variants" role="radiogroup" aria-label={t("today.versionsAria")}>
                    {(["standard", "short", "recovery"] as const).map((variant) => (
                      <button key={variant} type="button" role="radio" aria-checked={mode === variant}
                        className={mode === variant ? "active" : ""} onClick={() => setMode(variant)}>
                        <b>{variant === "standard" ? t("today.modeStandard") : variant === "short" ? t("today.modeShort") : t("today.modeRecovery")}</b>
                        <span>{t("product.plan.minutesUnit", { minutes: durationForMode(day, variant) })}</span>
                      </button>
                    ))}
                  </div>}

                  <h3 className="today-movements-heading">{t("refresh.today.movementList")}</h3>
                  <ul className="today-preview">
                    {exercises.map((view, index) => (
                      <li key={view.id}>
                        <button type="button" onClick={() => setViewerIndex(index)}
                          aria-label={t("product.viewer.openAria", { name: pick(view.name, locale) || view.id })}>
                          <ExerciseStage key={view.id} view={view} size="thumb" animate={false} />
                          <span className="today-exercise-copy"><b>{pick(view.name, locale) || view.id}</b><small>{pick(view.target, locale)}</small></span>
                          {view.prescription && <span className="today-exercise-dose">{view.prescription.sets} × {view.prescription.reps}<small>{t("product.viewer.openDetails")}</small></span>}
                          
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="today-guidance"><Icon name="plan" /><div><h3>{t("refresh.today.guideTitle")}</h3><p>{t("refresh.today.guideBody")}</p><Link className="fit-text-link" href="/exercises">{t("refresh.today.guideLink")}</Link></div></div>
                </section>
              )}

              {playing && (
                <SessionPlayer
                  exercises={exercises} sets={sets} index={exerciseIndex} onIndexChange={setExerciseIndex}
                  onSaveSet={saveSet} onFinish={() => { setPlaying(false); setFinishing(true); }} onExit={() => setPlaying(false)}
                  onOpenViewer={setViewerIndex} onAskCoach={onAskCoach}
                  savingKey={savingKey} intermediate={Boolean(intermediate)} message={message}
                />
              )}
              {playing && <p className="workout-save-status" role="status">{savingKey ? t("product.design.savePending") : sets.length ? t("product.design.saved") : ""}</p>}

              {(finishing || advice) && (
                <FeedbackPanel
                  onSubmit={(feedback) => {
                    if (completedSets === 0) { setMessage(t("product.workout.logOneSetFirst")); return; }
                    void submitFeedback(feedback);
                  }}
                  busy={busy} message={message} advice={advice}
                  storageNote={accountMode === "account" ? t("product.workout.savedAccount") : t("product.workout.savedLocally")}
                />
              )}

              {advice && (
                <div className="today-after-actions">
                  <Link className="secondary-cta" href="/plan">{t("product.plan.eyebrow")}</Link>
                  <button type="button" onClick={() => { setAdvice(null); setFinishing(false); setPlaying(true); }}>{t("product.workout.resumeSession")}</button>
                </div>
              )}

              {/* Account-only depth, kept but demoted: it is useful context, not
                  the decision this page exists for. */}
              {accountMode === "account" && home?.brief && (
                <details className="today-brief">
                  <summary>{t("today.briefFromRecentLogs")}</summary>
                  <h3>{home.brief.headline}</h3>
                  <p>{home.brief.summary}</p>
                  <ol>{home.brief.priorities.map((item) => <li key={item}>{item}</li>)}</ol>
                </details>
              )}

              {viewerIndex !== null && exercises[viewerIndex] && (
                <ExerciseViewer
                  exercises={exercises} index={viewerIndex} onIndexChange={setViewerIndex}
                  onClose={() => setViewerIndex(null)} equipment={record.profile.equipment}
                  surface="today" coachContext={{ planId: record.id, dayIndex, occurrenceId: occurrence?.occurrenceId ?? undefined, baseVersionId: occurrence?.versionId }} onAskCoach={onAskCoach}
                />
              )}

              <CoachDock contextualOnly plan={record} dayIndex={dayIndex} aiAvailable={Boolean(probe.capabilities?.ai)}
                signedIn={Boolean(probe.session?.signedIn)} accountsConfigured={Boolean(probe.capabilities?.accounts)}
                occurrenceId={occurrence?.occurrenceId ?? undefined} baseVersionId={occurrence?.versionId} request={coachRequest} />
              {state?.status === "completed" && !advice && !finishing && (
                <p className="today-completed-note" role="status">{t("product.workout.setsProgress", { completed: completedSets, total: requiredSets(day, mode) })}</p>
              )}
            </>
          );
        }}
      </EntryGate>
    </ProductShell>
  );
}
