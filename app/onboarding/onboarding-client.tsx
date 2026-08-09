"use client";

import { useEffect, useMemo, useState } from "react";
import ProductShell from "../components/product-shell";
import { defaultProfile, generatePlan, type Activity, type BeginnerBarrier, type Equipment, type Experience, type Goal, type Profile, type Sex, type TrainingTrack } from "../lib/coach";
import { beginCmineLogin, getCmineSession } from "../lib/auth";
import { useLocale, useT, useLocaleRef } from "../lib/i18n-provider";
import { localizeApiError, type ApiErrorBody } from "../lib/api-error";
import type { MessageKey } from "../lib/i18n";

// The rail holds message keys rather than text, the same way the product shell
// holds its nav keys: the order is layout, the words come from the catalog.
const steps = ["onboarding.stepStart", "onboarding.stepGoal", "onboarding.stepBody", "onboarding.stepTraining", "onboarding.stepSafety", "onboarding.stepDiet", "onboarding.stepConfirm"] as const;
type Draft = Profile & { sessionMinutes: number; dietaryPreference: string; exclusions: string; trainingTrack: TrainingTrack; beginnerBarrier: BeginnerBarrier; trainingAgeMonths: number; currentSplit: string; weakPoints: string; acceptsWeightGain: boolean };
const initial: Draft = { ...defaultProfile, sessionMinutes: 30, dietaryPreference: "balanced", exclusions: "", trainingTrack: "beginner_fat_loss", beginnerBarrier: "confidence", trainingAgeMonths: 0, currentSplit: "", weakPoints: "", acceptsWeightGain: false };
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const recommendedStartDate = () => { const date = new Date(); if (date.getHours() >= 15) date.setDate(date.getDate() + 1); return localDate(date); };

export default function OnboardingClient() {
  const { locale, t } = useLocale();
  const localeRef = useLocaleRef();
  const [step, setStep] = useState(0); const [draft, setDraft] = useState<Draft>(initial);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [consent, setConsent] = useState(false); const [message, setMessage] = useState("");
  const [startDate, setStartDate] = useState(recommendedStartDate);
  const [dateOptions] = useState(() => { const today = new Date(); const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1); return { today: localDate(today), tomorrow: localDate(tomorrow) }; });
  const [timezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const estimate = useMemo(() => generatePlan(draft), [draft]);
  const patch = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  useEffect(() => { void (async () => {
    const session = await getCmineSession();
    if (!session.user) { await beginCmineLogin("/onboarding", localeRef.current); return; }
    const response = await fetch("/api/v1/onboarding", { cache: "no-store" });
    const state = response.ok ? await response.json() as { step?: number; draft?: Partial<Draft> } : {};
    let merged = { ...initial, ...(state.draft || {}) };
    const local = sessionStorage.getItem("cmine_fit_intake_draft");
    if (local) {
      try { merged = { ...merged, ...JSON.parse(local) as Partial<Draft> }; } catch { /* ignore an invalid local draft */ }
      await fetch("/api/v1/onboarding/import-intake", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ step: 6, data: merged, source: "homepage_intake" }) });
      setStep(6);
    } else setStep(Math.max(0, Math.min(6, Number(state.step || 0))));
    setDraft(merged); setLoading(false);
  })(); }, [localeRef]);

  const saveAndMove = async (next: number) => {
    setSaving(true); setMessage("");
    const response = await fetch("/api/v1/onboarding", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ step: next, data: draft }) });
    setSaving(false); if (!response.ok) { setMessage(t("onboarding.saveFailed")); return; } setStep(next);
  };
  const skip = async () => { await fetch("/api/v1/onboarding/skip", { method: "POST" }); window.location.assign("/"); };
  const complete = async () => {
    if (!consent) { setMessage(t("onboarding.consentRequired")); return; }
    setSaving(true); setMessage("");
    // The consent record stores the language the disclaimer was actually read
    // in, so it has to be the live locale — a hardcoded "zh" filed an English
    // reader's consent as Chinese.
    const completed = await fetch("/api/v1/onboarding/complete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile: draft, consent: true, locale }) });
    if (!completed.ok) { const error = await completed.json().catch(() => null) as ApiErrorBody | null; setMessage(localizeApiError(error, locale, t("onboarding.completeFailed"))); setSaving(false); return; }
    sessionStorage.removeItem("cmine_fit_intake_draft");
    const generated = await fetch("/api/v1/plans", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile: draft, consent: true, startDate, timezone }) });
    setSaving(false);
    if (!generated.ok) { setMessage(t("onboarding.planFailed")); return; }
    window.location.assign("/today");
  };
  if (loading) return <div className="onboarding-loading">{t("onboarding.loading")}</div>;

  return <ProductShell active="" eyebrow={t("onboarding.eyebrow")} title={t("onboarding.title")} action={<button className="text-action" onClick={() => void skip()}>{t("onboarding.skip")}</button>}>
    <section className="onboarding-layout">
      <div className="onboarding-steps">{steps.map((name, index) => <button key={name} className={index === step ? "active" : index < step ? "done" : ""} onClick={() => index <= step && setStep(index)}><b>{index < step ? "✓" : index + 1}</b><span>{t(name)}</span></button>)}</div>
      <div className="onboarding-card">
        {step === 0 && <div className="onboarding-welcome"><span>{t("onboarding.welcomeDuration")}</span><h2>{t("onboarding.welcomeTitle")}</h2><p>{t("onboarding.welcomeBody")}</p><button className="primary-cta" onClick={() => void saveAndMove(1)}>{t("onboarding.welcomeCta")} <b>→</b></button></div>}
        {step === 1 && <Step title={t("onboarding.goalTitle")} note={t("onboarding.goalNote")}>
          <div className="track-choice">
            <button className={draft.trainingTrack === "beginner_fat_loss" ? "active" : ""} onClick={() => setDraft((current) => ({ ...current, trainingTrack: "beginner_fat_loss", goal: "fat_loss", experience: "beginner", days: Math.min(4, current.days), sessionMinutes: [20, 30, 45].includes(current.sessionMinutes) ? current.sessionMinutes : 30 }))}><span>{t("onboarding.trackBeginnerBadge")}</span><b>{t("onboarding.trackBeginnerName")}</b><small>{t("onboarding.trackBeginnerBlurb")}</small></button>
            <button className={draft.trainingTrack === "intermediate_hypertrophy" ? "active" : ""} onClick={() => setDraft((current) => ({ ...current, trainingTrack: "intermediate_hypertrophy", goal: "muscle", experience: "intermediate", days: Math.max(3, current.days), sessionMinutes: Math.max(45, current.sessionMinutes) }))}><span>{t("onboarding.trackAdvancedBadge")}</span><b>{t("onboarding.trackAdvancedName")}</b><small>{t("onboarding.trackAdvancedBlurb")}</small></button>
          </div>
          <p className="path-note">{t("onboarding.currentTrack", { track: draft.trainingTrack === "intermediate_hypertrophy" ? t("onboarding.trackShortAdvanced") : t("onboarding.trackShortBeginner") })}</p>
          <div className="choice-grid">{([['fat_loss','onboarding.goalFatLoss'],['muscle','onboarding.goalMuscle'],['recomp','onboarding.goalRecomp'],['arms','onboarding.goalArms'],['strength','onboarding.goalStrength']] as [Goal,MessageKey][]).map(([value,label]) => <button className={draft.goal === value ? "active" : ""} onClick={() => patch("goal", value)} key={value}>{t(label)}</button>)}</div>
          <Nav step={step} saving={saving} back={() => setStep(0)} next={() => void saveAndMove(2)} />
        </Step>}
        {step === 2 && <Step title={t("onboarding.bodyTitle")} note={t("onboarding.bodyNote")}>
          <div className="choice-grid compact">{([['female','onboarding.sexFemale'],['male','onboarding.sexMale']] as [Sex,MessageKey][]).map(([value,label]) => <button className={draft.sex === value ? "active" : ""} onClick={() => patch("sex", value)} key={value}>{t(label)}</button>)}</div>
          <div className="onboarding-fields"><label>{t("onboarding.ageLabel")}<input type="number" value={draft.age} onChange={(event) => patch("age", Number(event.target.value))} /></label><label>{t("onboarding.heightLabel")}<input type="number" value={draft.height} onChange={(event) => patch("height", Number(event.target.value))} /></label><label>{t("onboarding.weightLabel")}<input type="number" value={draft.weight} onChange={(event) => patch("weight", Number(event.target.value))} /></label><label>{t("onboarding.targetWeightLabel")}<input type="number" value={draft.targetWeight} onChange={(event) => patch("targetWeight", Number(event.target.value))} /></label></div>
          <Nav step={step} saving={saving} back={() => setStep(1)} next={() => void saveAndMove(3)} />
        </Step>}
        {step === 3 && <Step title={t("onboarding.conditionsTitle")} note={t("onboarding.conditionsNote")}>
          <div className="onboarding-fields"><label>{t("onboarding.experienceLabel")}<select value={draft.experience} onChange={(event) => patch("experience", event.target.value as Experience)}><option value="beginner">{t("onboarding.experienceBeginner")}</option><option value="intermediate">{t("onboarding.experienceIntermediate")}</option><option value="advanced">{t("onboarding.experienceAdvanced")}</option></select></label><label>{t("onboarding.equipmentLabel")}<select value={draft.equipment} onChange={(event) => patch("equipment", event.target.value as Equipment)}><option value="bodyweight">{t("onboarding.equipmentBodyweight")}</option><option value="dumbbell">{t("onboarding.equipmentDumbbell")}</option><option value="gym">{t("onboarding.equipmentGym")}</option></select></label><label>{t("onboarding.activityLabel")}<select value={draft.activity} onChange={(event) => patch("activity", event.target.value as Activity)}><option value="sedentary">{t("onboarding.activitySedentary")}</option><option value="light">{t("onboarding.activityLight")}</option><option value="moderate">{t("onboarding.activityModerate")}</option><option value="active">{t("onboarding.activityActive")}</option></select></label><label>{t("onboarding.sessionMinutesLabel")}<input type="number" value={draft.sessionMinutes} onChange={(event) => patch("sessionMinutes", Number(event.target.value))} /></label></div>
          <div className="day-picker"><span>{t("onboarding.daysPerWeekLabel")}</span>{[2,3,4,5,6].map((day) => <button key={day} className={draft.days === day ? "active" : ""} onClick={() => patch("days", day)}>{day}</button>)}</div>
          {draft.trainingTrack === "beginner_fat_loss" ? <div className="path-fields"><label>{t("onboarding.barrierLabel")}<select value={draft.beginnerBarrier} onChange={(event) => patch("beginnerBarrier", event.target.value as BeginnerBarrier)}><option value="confidence">{t("onboarding.barrierConfidence")}</option><option value="time">{t("onboarding.barrierTime")}</option><option value="consistency">{t("onboarding.barrierConsistency")}</option><option value="food">{t("onboarding.barrierFood")}</option><option value="feedback">{t("onboarding.barrierFeedback")}</option></select></label><label>{t("onboarding.preferredDurationLabel")}<select value={draft.sessionMinutes} onChange={(event) => patch("sessionMinutes", Number(event.target.value))}><option value="20">{t("onboarding.durationMinutes", { minutes: 20 })}</option><option value="30">{t("onboarding.durationMinutes", { minutes: 30 })}</option><option value="45">{t("onboarding.durationMinutes", { minutes: 45 })}</option></select></label></div> : <div className="path-fields"><label>{t("onboarding.trainingAgeLabel")}<input type="number" min="3" max="600" value={draft.trainingAgeMonths} onChange={(event) => patch("trainingAgeMonths", Number(event.target.value))} /></label><label>{t("onboarding.currentSplitLabel")}<input value={draft.currentSplit} onChange={(event) => patch("currentSplit", event.target.value)} placeholder={t("onboarding.currentSplitPlaceholder")} /></label><label>{t("onboarding.weakPointsLabel")}<input value={draft.weakPoints} onChange={(event) => patch("weakPoints", event.target.value)} placeholder={t("onboarding.weakPointsPlaceholder")} /></label><label className="gain-consent"><input type="checkbox" checked={draft.acceptsWeightGain} onChange={(event) => patch("acceptsWeightGain", event.target.checked)} />{t("onboarding.acceptsWeightGain")}</label></div>}
          <Nav step={step} saving={saving} back={() => setStep(2)} next={() => void saveAndMove(4)} />
        </Step>}
        {step === 4 && <Step title={t("onboarding.safetyTitle")} note={t("onboarding.safetyNote")}>
          <label className="wide-field">{t("onboarding.limitationsLabel")}<textarea value={draft.limitations} onChange={(event) => patch("limitations", event.target.value)} placeholder={t("onboarding.limitationsPlaceholder")} /></label>
          <div className="safety-note">{t("onboarding.safetyWarning")}</div>
          <Nav step={step} saving={saving} back={() => setStep(3)} next={() => void saveAndMove(5)} />
        </Step>}
        {step === 5 && <Step title={t("onboarding.dietTitle")} note={t("onboarding.dietNote")}>
          <div className="choice-grid">{([['balanced','onboarding.dietBalanced'],['vegetarian','onboarding.dietVegetarian'],['high_protein','onboarding.dietHighProtein'],['none','onboarding.dietNone']] as [string,MessageKey][]).map(([value,label]) => <button className={draft.dietaryPreference === value ? "active" : ""} onClick={() => patch("dietaryPreference", value as Draft["dietaryPreference"])} key={value}>{t(label)}</button>)}</div>
          <label className="wide-field">{t("onboarding.exclusionsLabel")}<input value={draft.exclusions} onChange={(event) => patch("exclusions", event.target.value)} placeholder={t("onboarding.exclusionsPlaceholder")} /></label>
          <Nav step={step} saving={saving} back={() => setStep(4)} next={() => void saveAndMove(6)} />
        </Step>}
        {step === 6 && <Step title={t("onboarding.confirmTitle")} note={t("onboarding.confirmNote")}>
          <div className="onboarding-summary"><article><span>{t("onboarding.summaryCalories")}</span><b>{estimate.calories}</b><small>kcal</small></article><article><span>{t("onboarding.summaryProtein")}</span><b>{estimate.protein}</b><small>g</small></article><article><span>{t("onboarding.summaryWeeklyTraining")}</span><b>{draft.days}</b><small>{t("onboarding.unitDays")}</small></article><article><span>{t("onboarding.summaryCycle")}</span><b>{estimate.weeks}</b><small>{t("onboarding.unitWeeks")}</small></article></div>
          <div className="onboarding-start-date"><div><b>{t("onboarding.startDateTitle")}</b><p>{t("onboarding.startDateNote")}</p></div><button className={startDate === dateOptions.today ? "active" : ""} onClick={() => setStartDate(dateOptions.today)}>{t("onboarding.startToday")}</button><button className={startDate === dateOptions.tomorrow ? "active" : ""} onClick={() => setStartDate(dateOptions.tomorrow)}>{t("onboarding.startTomorrow")}</button><input type="date" aria-label={t("onboarding.startDateLabel")} min={dateOptions.today} value={startDate} onChange={(event) => setStartDate(event.target.value)} /></div>
          <label className="consent-row"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>{t("onboarding.consentText")}</span></label>
          <Nav step={step} saving={saving} back={() => setStep(5)} next={() => void complete()} final />
        </Step>}
        {message && <p className="form-message">{message}</p>}
      </div>
    </section>
  </ProductShell>;
}

function Step({ title, note, children }: { title: string; note: string; children: React.ReactNode }) { return <div className="onboarding-step"><p>CMINE FIT INTAKE</p><h2>{title}</h2><span>{note}</span>{children}</div>; }
function Nav({ saving, back, next, final = false }: { step: number; saving: boolean; back: () => void; next: () => void; final?: boolean }) { const t = useT(); return <div className="onboarding-nav"><button onClick={back}>{t("onboarding.back")}</button><button className="primary-cta" disabled={saving} onClick={next}>{saving ? t("onboarding.saving") : final ? t("onboarding.confirmAndGenerate") : t("onboarding.saveAndContinue")}<b>→</b></button></div>; }
