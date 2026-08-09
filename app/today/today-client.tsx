/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ProductShell from "../components/product-shell";
import type { CoachPlan, PlannedExercise, Profile, WorkoutDay } from "../lib/coach";
import { beginCmineLogin } from "../lib/auth";
import { useDialog } from "../lib/use-dialog";
import { LOCALE_META } from "../../packages/i18n/src";
import { useLocale } from "../lib/i18n-provider";

type StoredSet = { id?: string; exerciseId: string; setIndex: number; setType: string; targetReps?: string | null; weightKg: number | null; reps: number | null; rir: number | null; rpe: number | null; completed: boolean };
type Account = { user: { name?: string | null }; latestPlan: { id: string; plan: CoachPlan; profile: Profile } | null };
type Mode = "standard" | "short" | "recovery";
type CoachHome = {
  brief: { headline: string; summary: string; priorities: string[]; dataState: string };
  phase: { kind: string; lengthWeeks: number; currentWeek: number; progressPct: number; weeklyFocus: Array<{ zh: string }> } | null;
  today: { occurrenceId: string | null; scheduledDate: string; dayIndex: number; status: string; mode: Mode; workout: WorkoutDay } | null;
};
type Checkin = { recommendation: { mode: Mode | "reschedule"; title: string; explanation: string; stopConditions: string[] } };

const setKey = (exerciseId: string, setIndex: number) => `${exerciseId}:${setIndex}`;
const parseRepTarget = (value: string) => Number((value.match(/\d+/) || ["10"])[0]);
const defaultSet = (exercise: PlannedExercise, setIndex: number, intermediate: boolean): StoredSet => ({
  exerciseId: exercise.id, setIndex, setType: setIndex === 0 && intermediate ? "warmup" : "working",
  targetReps: exercise.reps, weightKg: null, reps: parseRepTarget(exercise.reps), rir: intermediate ? exercise.targetRir ?? 2 : null, rpe: null, completed: false,
});
const addDays = (date: string, days: number) => { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + days); return value.toISOString().slice(0, 10); };

export default function TodayClient() {
  const { locale, t } = useLocale();
  const [account, setAccount] = useState<Account | null>(null);
  const [home, setHome] = useState<CoachHome | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [rpe, setRpe] = useState(7);
  const [pain, setPain] = useState(0);
  const [duration, setDuration] = useState(30);
  const [mode, setMode] = useState<Mode>("standard");
  const [sets, setSets] = useState<Record<string, StoredSet>>({});
  const [savingSet, setSavingSet] = useState<string | null>(null);
  const [timer, setTimer] = useState(0);
  const [energy, setEnergy] = useState(3);
  const [soreness, setSoreness] = useState(2);
  const [availableMinutes, setAvailableMinutes] = useState(45);
  const [checkin, setCheckin] = useState<Checkin | null>(null);
  const [checking, setChecking] = useState(false);
  const [mediaExercise, setMediaExercise] = useState<PlannedExercise | null>(null);
  const mediaDialogRef = useDialog(Boolean(mediaExercise), () => setMediaExercise(null));
  const [rescheduleDate, setRescheduleDate] = useState("");

  const plan = account?.latestPlan;
  const planId = plan?.id;
  const occurrence = home?.today;
  const dayIndex = occurrence?.dayIndex ?? 0;
  const day = occurrence?.workout || plan?.plan.schedule[dayIndex];
  const occurrenceId = occurrence?.occurrenceId || null;
  const intermediate = plan?.profile.trainingTrack === "intermediate_hypertrophy" || plan?.profile.experience === "intermediate" || plan?.profile.experience === "advanced";

  const load = async () => {
    const [accountResponse, homeResponse] = await Promise.all([
      fetch("/api/v1/me", { cache: "no-store" }), fetch("/api/v1/coach/home", { cache: "no-store" }),
    ]);
    if (accountResponse.status === 401 || homeResponse.status === 401) { await beginCmineLogin("/today"); return; }
    if (accountResponse.ok) setAccount(await accountResponse.json() as Account);
    if (homeResponse.ok) {
      const value = await homeResponse.json() as CoachHome;
      setHome(value); setMode(value.today?.mode || "standard"); setDuration(value.today?.workout.duration || 30);
      if (value.today?.scheduledDate) setRescheduleDate(addDays(value.today.scheduledDate, 1));
    }
    setLoading(false);
  };

  useEffect(() => { const task = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(task); }, []);

  useEffect(() => {
    if (!planId || !occurrence) return;
    let active = true;
    const query = occurrenceId ? `&occurrenceId=${encodeURIComponent(occurrenceId)}` : "";
    void fetch(`/api/v1/workouts/${planId}/sets?dayIndex=${dayIndex}${query}`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const body = await response.json() as { sets?: StoredSet[] };
      if (active) setSets(Object.fromEntries((body.sets || []).map((item) => [setKey(item.exerciseId, item.setIndex), item])));
    });
    return () => { active = false; };
  }, [planId, dayIndex, occurrenceId, occurrence]);

  useEffect(() => {
    if (timer <= 0) return;
    const interval = window.setInterval(() => setTimer((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(interval);
  }, [timer]);

  const visibleExercises = useMemo(() => {
    if (!day) return [];
    if (mode === "standard") return day.exercises;
    const ids = mode === "short" ? day.variants?.short.exerciseIds : day.variants?.recovery.exerciseIds;
    return ids?.length ? day.exercises.filter((exercise) => ids.includes(exercise.id)) : day.exercises.slice(0, Math.max(1, Math.ceil(day.exercises.length * (mode === "short" ? .6 : .4))));
  }, [day, mode]);
  const completedSets = Object.values(sets).filter((item) => item.completed).length;
  const requiredSets = visibleExercises.reduce((sum, exercise) => sum + exercise.sets, 0);
  const displayDuration = mode === "short" ? day?.variants?.short.duration : mode === "recovery" ? day?.variants?.recovery.duration : day?.duration;

  const saveSet = async (exercise: PlannedExercise, setIndex: number, patch: Partial<StoredSet> = {}) => {
    if (!plan) return;
    const key = setKey(exercise.id, setIndex);
    const next = { ...defaultSet(exercise, setIndex, intermediate), ...sets[key], ...patch } as StoredSet;
    setSets((current) => ({ ...current, [key]: next })); setSavingSet(key);
    const response = await fetch(`/api/v1/workouts/${plan.id}/sets`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...next, occurrenceId, dayIndex, targetReps: exercise.reps, clientMutationId: `${occurrenceId || plan.id}:${key}` }),
    });
    setSavingSet(null);
    if (!response.ok) setMessage(t("today.setSaveFailed"));
    if (patch.completed) setTimer(exercise.restSeconds || Number.parseInt(exercise.rest) || 60);
  };

  const submitCheckin = async () => {
    setChecking(true); setMessage("");
    const response = await fetch("/api/v1/coach/check-ins", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ occurrenceId, energy, soreness, pain, availableMinutes }) });
    setChecking(false);
    if (!response.ok) return setMessage(t("today.checkinSaveFailed"));
    const value = (await response.json() as { checkin: Checkin }).checkin;
    setCheckin(value);
    if (value.recommendation.mode !== "reschedule") {
      setMode(value.recommendation.mode);
      const recommended = value.recommendation.mode === "short" ? day?.variants?.short.duration : value.recommendation.mode === "recovery" ? day?.variants?.recovery.duration : day?.duration;
      if (recommended) setDuration(recommended);
    }
  };

  const complete = async () => {
    if (!plan) return;
    if (!day?.restDay && requiredSets > 0 && completedSets === 0) return setMessage(t("today.logOneSetFirst"));
    const response = await fetch(`/api/v1/workouts/${plan.id}/complete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ occurrenceId, dayIndex, durationMinutes: duration, rpe, pain, notes: `${mode === "short" ? t("today.noteShortVariant") : mode === "recovery" ? t("today.noteRecoveryVariant") : ""}${pain >= 4 ? ` ${t("today.notePain", { pain })}` : ""}`.trim() }) });
    setMessage(response.ok ? t("today.sessionLogged") : t("today.logFailed"));
    if (response.ok) await load();
  };

  const reschedule = async () => {
    if (!occurrenceId || !rescheduleDate) return setMessage(t("today.chooseNewDate"));
    const response = await fetch(`/api/v1/workouts/occurrences/${encodeURIComponent(occurrenceId)}/reschedule`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scheduledDate: rescheduleDate }) });
    const body = await response.json().catch(() => null);
    if (!response.ok) return setMessage(body?.message || t("today.rescheduleFailed"));
    setMessage(t("today.rescheduled", { date: new Date(`${rescheduleDate}T12:00:00`).toLocaleDateString(LOCALE_META[locale].tag, { month: "long", day: "numeric", weekday: "short" }) }));
    await load();
  };

  if (loading) return <div className="product-loading">{t("today.loading")}</div>;

  return <ProductShell active="/today" eyebrow={t("today.eyebrow")} title={t("today.title", { name: account?.user.name || t("today.greetingFallback") })} action={<div className="header-actions-inline"><Link className="header-chip" href="/exercises">{t("today.exerciseLibraryLink")}</Link><Link className="header-chip" href="/coach">{t("today.askCoachLink")}</Link></div>}>
    {!plan || !day ? <section className="empty-product"><span>NO ACTIVE PLAN</span><h2>{t("today.emptyTitle")}</h2><p>{t("today.emptyBody")}</p><Link href="/onboarding">{t("today.emptyCta")}</Link></section> : <>
      <section className="daily-brief-strip"><div><span>{home?.brief.dataState === "plan_only" ? t("today.briefFromPlan") : t("today.briefFromRecentLogs")}</span><h2>{home?.brief.headline}</h2><p>{home?.brief.summary}</p></div><ol>{home?.brief.priorities.map((item) => <li key={item}>{item}</li>)}</ol><aside><small>{t("today.currentPhase")}</small><b>{t("today.phaseWeek", { current: home?.phase?.currentWeek || 1, total: home?.phase?.lengthWeeks || plan.plan.phase?.lengthWeeks || 4 })}</b><span>{occurrence?.scheduledDate ? new Date(`${occurrence.scheduledDate}T12:00:00`).toLocaleDateString(LOCALE_META[locale].tag, { month: "long", day: "numeric", weekday: "long" }) : t("today.todayLabel")}</span></aside></section>

      {!checkin && !day.restDay ? <section className="prework-check"><div><span>{t("today.checkinEyebrow")}</span><h2>{t("today.checkinTitle")}</h2><p>{t("today.checkinNote")}</p></div><label>{t("today.energyLabel")}<b aria-hidden="true">{energy}/5</b><input type="range" aria-label={t("today.energyLabel")} aria-valuetext={`${energy} / 5`} min="1" max="5" value={energy} onChange={(event) => setEnergy(Number(event.target.value))} /></label><label>{t("today.sorenessLabel")}<b aria-hidden="true">{soreness}/10</b><input type="range" aria-label={t("today.sorenessLabel")} aria-valuetext={`${soreness} / 10`} min="0" max="10" value={soreness} onChange={(event) => setSoreness(Number(event.target.value))} /></label><label>{t("today.painLabel")}<b aria-hidden="true">{pain}/10</b><input type="range" aria-label={t("today.painLabel")} aria-valuetext={`${pain} / 10`} min="0" max="10" value={pain} onChange={(event) => setPain(Number(event.target.value))} /></label><label>{t("today.availableTimeLabel")}<b aria-hidden="true">{t("today.minutesValue", { minutes: availableMinutes })}</b><input type="range" aria-label={t("today.availableTimeAria")} aria-valuetext={t("today.minutesValue", { minutes: availableMinutes })} min="10" max="120" step="5" value={availableMinutes} onChange={(event) => setAvailableMinutes(Number(event.target.value))} /></label><button disabled={checking} onClick={() => void submitCheckin()}>{checking ? t("today.checkinPending") : t("today.checkinSubmit")}</button></section> : null}
      {checkin && <section className={`checkin-result ${checkin.recommendation.mode}`}><div><span>{t("today.recommendationEyebrow")}</span><h3>{checkin.recommendation.title}</h3><p>{checkin.recommendation.explanation}</p></div><ul>{checkin.recommendation.stopConditions.map((item) => <li key={item}>{item}</li>)}</ul><button onClick={() => setCheckin(null)}>{t("today.recheck")}</button></section>}

      <div className="workout-options" aria-label={t("today.versionsAria")}><button className={mode === "standard" ? "active" : ""} onClick={() => setMode("standard")}><b>{t("today.modeStandard")}</b><span>{t("today.minutesValue", { minutes: day.duration })}</span></button><button className={mode === "short" ? "active" : ""} onClick={() => setMode("short")}><b>{t("today.modeShort")}</b><span>{t("today.modeShortNote")}</span></button><button className={mode === "recovery" ? "active" : ""} onClick={() => setMode("recovery")}><b>{t("today.modeRecovery")}</b><span>{t("today.modeRecoveryNote")}</span></button><div className="reschedule-control"><label>{t("today.rescheduleLabel")}<input type="date" min={occurrence?.scheduledDate} value={rescheduleDate} onChange={(event) => setRescheduleDate(event.target.value)} /></label><button onClick={() => void reschedule()}>{t("today.rescheduleConfirm")}</button></div></div>

      <div className="today-grid"><section className="today-workout"><div className="today-kicker"><span>DAY {dayIndex + 1} · {intermediate ? t("today.trackIntermediate") : t("today.trackBeginner")}</span><b>{displayDuration || 0} MIN</b></div><h2>{day.title.zh}</h2><p>{day.focus.zh}</p>
        {day.restDay ? <div className="rest-day-card"><b>{t("today.restDayTitle")}</b><p>{t("today.restDayBody")}</p></div> : <div className="workout-player">{visibleExercises.map((exercise, exerciseIndex) => <article className="exercise-player" key={exercise.id}>
          <header><button className="exercise-media-button" type="button" onClick={() => setMediaExercise(exercise)} aria-label={t("today.zoomExerciseAria", { name: exercise.name.zh })}><img src={`/exercises/${exercise.asset}.jpg`} alt={t("today.exerciseDemoAlt", { name: exercise.name.zh })} onError={(event) => { event.currentTarget.style.display = "none"; }} /><span>{t("today.zoom")}</span></button><div><span>{String(exerciseIndex + 1).padStart(2, "0")} · {exercise.target.zh}</span><h3>{exercise.name.zh}</h3><p>{exercise.cue.zh}</p></div><Link href={`/coach?prompt=${encodeURIComponent(t("today.exercisePrompt", { name: exercise.name.zh }))}`}>{t("today.exerciseIssueLink")}</Link></header>
          <details className="exercise-safety"><summary>{t("today.safetySummary")}</summary><div><p><b>{t("today.cueLabel")}</b>{exercise.cue.zh}</p><p><b>{t("today.breathingLabel")}</b>{t("today.breathingBody")}</p><p><b>{t("today.commonMistakesLabel")}</b>{t("today.commonMistakesBody")}</p><p><b>{t("today.stopConditionsLabel")}</b>{t("today.stopConditionsBody")}</p></div></details>
          <div className={`set-table ${intermediate ? "advanced" : "simple"}`}><div className="set-row set-head"><span>{t("today.colSet")}</span><span>{t("today.colType")}</span><span>{t("today.colWeight")}</span><span>{t("today.colReps")}</span>{intermediate && <span>RIR</span>}<span>{t("today.colDone")}</span></div>{Array.from({ length: exercise.sets }, (_, setIndex) => { const key = setKey(exercise.id, setIndex); const value = sets[key] || defaultSet(exercise, setIndex, intermediate); return <div className={`set-row ${value.completed ? "done" : ""}`} key={key}><b>{setIndex + 1}</b><select aria-label={t("today.setTypeAria", { index: setIndex + 1 })} value={value.setType} onChange={(event) => setSets((current) => ({ ...current, [key]: { ...value, setType: event.target.value } }))} disabled={!intermediate}><option value="warmup">{t("today.setTypeWarmup")}</option><option value="working">{t("today.setTypeWorking")}</option><option value="dropset">{t("today.setTypeDropset")}</option><option value="failure">{t("today.setTypeFailure")}</option></select><input aria-label={t("today.setWeightAria", { index: setIndex + 1 })} inputMode="decimal" type="number" min="0" step=".5" value={value.weightKg ?? ""} placeholder={intermediate ? t("today.weightPlaceholderLast") : t("today.weightPlaceholderOptional")} onChange={(event) => setSets((current) => ({ ...current, [key]: { ...value, weightKg: event.target.value === "" ? null : Number(event.target.value) } }))} /><input aria-label={t("today.setRepsAria", { index: setIndex + 1 })} inputMode="numeric" type="number" min="0" value={value.reps ?? ""} onChange={(event) => setSets((current) => ({ ...current, [key]: { ...value, reps: event.target.value === "" ? null : Number(event.target.value) } }))} />{intermediate && <input aria-label={t("today.setRirAria", { index: setIndex + 1 })} inputMode="decimal" type="number" min="0" max="10" step=".5" value={value.rir ?? ""} onChange={(event) => setSets((current) => ({ ...current, [key]: { ...value, rir: event.target.value === "" ? null : Number(event.target.value) } }))} />}<button className="set-complete" disabled={savingSet === key} onClick={() => void saveSet(exercise, setIndex, { completed: !value.completed })}>{savingSet === key ? "…" : value.completed ? "✓" : t("today.setComplete")}</button></div>; })}</div>
          <footer><span>{t("today.setSummary", { sets: exercise.sets, reps: exercise.reps, rest: exercise.rest })}</span>{intermediate && exercise.progression && <small>{exercise.progression.zh}</small>}</footer>
        </article>)}</div>}
      </section><aside className="today-feedback"><span>{t("today.progressEyebrow")}</span><h3>{t("today.setsCompleted", { completed: completedSets, total: requiredSets || 0 })}</h3>{timer > 0 && <div className="rest-timer"><span>{t("today.restTimer")}</span><b>{Math.floor(timer / 60)}:{String(timer % 60).padStart(2, "0")}</b><button onClick={() => setTimer(0)}>{t("today.skip")}</button></div>}<label>{t("today.durationLabel")}<b aria-hidden="true">{t("today.minutesValue", { minutes: duration })}</b><input type="range" aria-label={t("today.durationAria")} aria-valuetext={t("today.minutesValue", { minutes: duration })} min="10" max="120" step="5" value={duration} onChange={(event) => setDuration(Number(event.target.value))} /></label><label>{t("today.rpeLabel")}<b aria-hidden="true">{rpe}/10</b><input type="range" aria-label={t("today.rpeLabel")} aria-valuetext={`${rpe} / 10`} min="1" max="10" value={rpe} onChange={(event) => setRpe(Number(event.target.value))} /></label><label>{t("today.painLevelLabel")}<b aria-hidden="true">{pain}/10</b><input type="range" aria-label={t("today.painLevelLabel")} aria-valuetext={`${pain} / 10`} min="0" max="10" value={pain} onChange={(event) => setPain(Number(event.target.value))} /></label>{pain >= 4 && <div className="pain-warning">{t("today.painWarning")}</div>}<button onClick={() => void complete()}>{occurrence?.status === "completed" ? t("today.updateLog") : t("today.completeAndLog")}</button>{message && <p>{message}</p>}</aside></div>
    </>}

    {mediaExercise && <div ref={mediaDialogRef} className="exercise-media-modal" role="dialog" aria-modal="true" aria-label={t("today.exerciseDemoAlt", { name: mediaExercise.name.zh })} onClick={() => setMediaExercise(null)}><article onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setMediaExercise(null)}>{t("today.closeModal")}</button><div className="exercise-media-stage"><img src={`/exercises/${mediaExercise.asset}.gif`} alt={t("today.exerciseAnimatedAlt", { name: mediaExercise.name.zh })} onError={(event) => { event.currentTarget.style.display = "none"; }} /></div><div className="exercise-media-copy"><span>{mediaExercise.target.zh}</span><h2>{mediaExercise.name.zh}</h2><p>{mediaExercise.cue.zh}</p><ul><li>{t("today.mediaTip1")}</li><li>{t("today.mediaTip2")}</li><li>{t("today.mediaTip3")}</li></ul><Link href={`/coach?prompt=${encodeURIComponent(t("today.mediaCoachPrompt", { name: mediaExercise.name.zh }))}`}>{t("today.mediaCoachLink")}</Link></div></article></div>}
  </ProductShell>;
}
