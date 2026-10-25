"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../../shared/ui/icon";
import ProductShell from "../../components/product-shell";
import { useLocale } from "../../lib/i18n-provider";
import { beginCmineLogin } from "../../lib/auth";
import { useEntry } from "../../shared/api/capability-provider";
import { EntryGate } from "../../shared/async-state/entry-gate";
import { describeFailure } from "../../shared/api/client";
import { emitProductEvent } from "../../shared/analytics/product-events";
import { profileRepository, writeLocalDraft } from "./repository";
import { planRepository } from "../plan/repository";
import { localDate } from "../plan/plan-imports";
import {
  INTAKE_STEPS, emptyDraft, intakeImpact, toProfile, validateStep,
  type FieldIssue, type IntakeStep, type ProfileDraft,
} from "../../../packages/product-state/src";
import type { MessageKey } from "../../lib/i18n";
import type { Activity, Equipment, Experience, Goal, Sex, TrainingLocation } from "../../lib/coach";

/**
 * The single intake.
 *
 * What it replaces: a fully pre-filled form on the marketing homepage plus a
 * seven-step wizard behind a login. A user who filled the first was asked the
 * same questions again by the second, and the wizard could not start at all
 * without an account — on a deployment with no Cmine ID it sat on "restoring
 * your profile" forever, because the failed sign-in call returned without ever
 * clearing the loading flag.
 *
 * Four steps, in the order that changes the plan the most; food preferences are
 * gone from intake entirely because they change nothing about training. Each
 * step ends by showing what the answers just bought, which is the only thing
 * that makes asking one more question fair.
 */

const STEP_LABELS: Record<IntakeStep, MessageKey> = {
  goal: "onboarding.stepGoal",
  body: "onboarding.stepBody",
  schedule: "onboarding.stepTraining",
  safety: "onboarding.stepSafety",
};

const GOALS: Array<[Goal, MessageKey]> = [
  ["fat_loss", "onboarding.goalFatLoss"], ["muscle", "onboarding.goalMuscle"],
  ["recomp", "onboarding.goalRecomp"], ["arms", "onboarding.goalArms"], ["strength", "onboarding.goalStrength"],
];
const EXPERIENCE: Array<[Experience, MessageKey]> = [
  ["beginner", "onboarding.experienceBeginner"], ["intermediate", "onboarding.experienceIntermediate"], ["advanced", "onboarding.experienceAdvanced"],
];
const SEXES: Array<[Sex, MessageKey]> = [["female", "onboarding.sexFemale"], ["male", "onboarding.sexMale"]];
const ACTIVITIES: Array<[Activity, MessageKey]> = [
  ["sedentary", "onboarding.activitySedentary"], ["light", "onboarding.activityLight"],
  ["moderate", "onboarding.activityModerate"], ["active", "onboarding.activityActive"],
];
const EQUIPMENT: Array<[Equipment, MessageKey]> = [
  ["bodyweight", "onboarding.equipmentBodyweight"], ["dumbbell", "onboarding.equipmentDumbbell"], ["gym", "onboarding.equipmentGym"],
];
const LOCATIONS: Array<[TrainingLocation, MessageKey]> = [
  ["home", "onboarding.locationHome"], ["gym", "onboarding.locationGym"],
  ["outdoors", "onboarding.locationOutdoors"], ["mixed", "onboarding.locationMixed"],
];

export default function IntakeClient() {
  const { locale, t } = useLocale();
  const probe = useEntry(true);
  const [forcedGuest, setForcedGuest] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>(emptyDraft);
  const [step, setStep] = useState<IntakeStep>("goal");
  const [showIssues, setShowIssues] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [imported, setImported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const mode: "guest" | "account" = probe.entry.status === "account" && !forcedGuest ? "account" : "guest";

  useEffect(() => {
    // Wait for the entry decision, then load once. Both branches finish: the
    // guest one reads local storage, the account one merges server and local.
    if (probe.entry.status === "loading" || loaded) return;
    if (probe.entry.status === "error" && !forcedGuest) return;
    let active = true;
    void profileRepository(mode, locale).load().then((result) => {
      if (!active) return;
      setDraft(result.draft);
      setImported(result.imported);
      const pending = INTAKE_STEPS.find((candidate) => validateStep(candidate, result.draft).length > 0);
      setStep(pending ?? "safety");
      setLoaded(true);
      emitProductEvent({ name: "profile_started", mode });
    });
    return () => { active = false; };
  }, [probe.entry.status, forcedGuest, loaded, mode, locale]);

  const patch = useCallback(<K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => {
    setDraft((current) => {
      const next = { ...current, [key]: value };
      // Autosave locally on every keystroke regardless of mode: a signed-in user
      // whose connection drops mid-intake should not lose what they typed.
      writeLocalDraft(next);
      return next;
    });
  }, []);

  const issues = useMemo(() => validateStep(step, draft), [step, draft]);
  const issueFor = (field: keyof ProfileDraft): FieldIssue | undefined => showIssues ? issues.find((issue) => issue.field === field) : undefined;
  const issueText = (issue: FieldIssue | undefined): string | null => {
    if (!issue) return null;
    return issue.code === "range" ? t("onboarding.rangeIssue", { min: issue.min ?? 0, max: issue.max ?? 0 }) : t("onboarding.requiredIssue");
  };

  const stepIndex = INTAKE_STEPS.indexOf(step);
  const impact = useMemo(() => intakeImpact(step, draft), [step, draft]);

  const advance = async () => {
    if (issues.length) { setShowIssues(true); return; }
    setShowIssues(false);
    if (stepIndex < INTAKE_STEPS.length - 1) { setStep(INTAKE_STEPS[stepIndex + 1]); return; }
    await finish();
  };

  const finish = async () => {
    const profile = toProfile(draft);
    if (!profile) { setShowIssues(true); return; }
    setBusy(true); setMessage("");
    const saved = await profileRepository(mode, locale).save(draft);
    if (!saved.ok) {
      setBusy(false);
      setMessage(saved.failure ? describeFailure(saved.failure, locale, t("onboarding.saveFailed")) : t("onboarding.saveFailed"));
      return;
    }
    emitProductEvent({ name: "profile_completed", mode, steps: INTAKE_STEPS.length });
    const generated = await planRepository(mode, locale).generate(profile, localDate(new Date()), Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    setBusy(false);
    if (!generated.ok) {
      setMessage(generated.failure ? describeFailure(generated.failure, locale, t("onboarding.planFailed")) : t("onboarding.planFailed"));
      return;
    }
    const source = generated.state.status === "draft" || generated.state.status === "active" ? generated.state.record.source : "rules";
    emitProductEvent({ name: "plan_generated", source, mode });
    window.location.assign("/plan");
  };

  return (
    <ProductShell active="/today" eyebrow={t("onboarding.eyebrow")} title={t("onboarding.title")}>
      <EntryGate
        entry={forcedGuest ? { status: "guest", reason: "accounts_not_configured" } : probe.entry}
        missingTables={probe.missingTables}
        onRetry={probe.refresh}
        onContinueLocal={() => setForcedGuest(true)}
      >
        {() => !loaded ? <div className="entry-state entry-loading" role="status">{t("onboarding.loading")}</div> : (
          <section className="intake-layout">
            <ol className="intake-rail" aria-label={t("onboarding.progress", { step: stepIndex + 1, total: INTAKE_STEPS.length })}>
              {INTAKE_STEPS.map((candidate, index) => (
                <li key={candidate}>
                  <button
                    type="button"
                    className={candidate === step ? "active" : index < stepIndex ? "done" : ""}
                    aria-current={candidate === step ? "step" : undefined}
                    // Only backwards: a step you have not reached cannot be
                    // validated yet, and jumping into it shows empty errors.
                    disabled={index > stepIndex}
                    onClick={() => { setStep(candidate); setShowIssues(false); }}
                  >
                    <b aria-hidden="true">{index < stepIndex ? <Icon name="check" /> : index + 1}</b>
                    <span>{t(STEP_LABELS[candidate])}</span>
                  </button>
                </li>
              ))}
            </ol>

            <div className="intake-card">
              <p className="intake-progress">{t("onboarding.progress", { step: stepIndex + 1, total: INTAKE_STEPS.length })}</p>
              {imported && <p className="intake-imported" role="status">{t("product.mode.importedNote")}</p>}
              {mode === "guest" && <p className="intake-guest-note">{t("onboarding.guestNote")}</p>}

              {step === "goal" && (
                <Step title={t("onboarding.goalTitle")} note={t("onboarding.goalNote")}>
                  <Choice label={t("onboarding.goalTitle")} options={GOALS.map(([value, key]) => ({ value, label: t(key) }))}
                    value={draft.goal} onChange={(value) => patch("goal", value as Goal)} issue={issueText(issueFor("goal"))} />
                  <Choice label={t("onboarding.experienceLabel")} options={EXPERIENCE.map(([value, key]) => ({ value, label: t(key) }))}
                    value={draft.experience} onChange={(value) => patch("experience", value as Experience)} issue={issueText(issueFor("experience"))} />
                </Step>
              )}

              {step === "body" && (
                <Step title={t("onboarding.bodyTitle")} note={t("onboarding.bodyNote")}>
                  <Choice label={t("onboarding.bodyTitle")} options={SEXES.map(([value, key]) => ({ value, label: t(key) }))}
                    value={draft.sex} onChange={(value) => patch("sex", value as Sex)} issue={issueText(issueFor("sex"))} />
                  <div className="intake-fields">
                    <NumberField label={t("onboarding.ageLabel")} value={draft.age} onChange={(value) => patch("age", value)} issue={issueText(issueFor("age"))} />
                    <NumberField label={t("onboarding.heightLabel")} value={draft.height} onChange={(value) => patch("height", value)} issue={issueText(issueFor("height"))} />
                    <NumberField label={t("onboarding.weightLabel")} value={draft.weight} onChange={(value) => patch("weight", value)} issue={issueText(issueFor("weight"))} />
                    <NumberField label={t("onboarding.targetWeightLabel")} value={draft.targetWeight} onChange={(value) => patch("targetWeight", value)}
                      hint={t("onboarding.targetWeightOptional")} issue={issueText(issueFor("targetWeight"))} />
                  </div>
                  <Choice label={t("onboarding.activityLabel")} options={ACTIVITIES.map(([value, key]) => ({ value, label: t(key) }))}
                    value={draft.activity} onChange={(value) => patch("activity", value as Activity)} issue={issueText(issueFor("activity"))} />
                </Step>
              )}

              {step === "schedule" && (
                <Step title={t("onboarding.scheduleTitle")} note={t("onboarding.scheduleNote")}>
                  <fieldset className="intake-days">
                    <legend>{t("onboarding.daysPerWeekLabel")}</legend>
                    <div role="radiogroup" aria-label={t("onboarding.daysPerWeekLabel")}>
                      {[2, 3, 4, 5, 6].map((day) => (
                        <button key={day} type="button" role="radio" aria-checked={draft.days === day}
                          className={draft.days === day ? "active" : ""} onClick={() => patch("days", day)}>{day}</button>
                      ))}
                    </div>
                    {issueText(issueFor("days")) && <p className="field-issue">{issueText(issueFor("days"))}</p>}
                  </fieldset>
                  <div className="intake-fields">
                    <NumberField label={t("onboarding.sessionMinutesLabel")} value={draft.sessionMinutes}
                      onChange={(value) => patch("sessionMinutes", value)} issue={issueText(issueFor("sessionMinutes"))} />
                  </div>
                  <Choice label={t("onboarding.equipmentLabel")} options={EQUIPMENT.map(([value, key]) => ({ value, label: t(key) }))}
                    value={draft.equipment} onChange={(value) => patch("equipment", value as Equipment)} issue={issueText(issueFor("equipment"))} />
                  <Choice label={t("onboarding.trainingLocationLabel")} options={LOCATIONS.map(([value, key]) => ({ value, label: t(key) }))}
                    value={draft.trainingLocation} onChange={(value) => patch("trainingLocation", value as TrainingLocation)} issue={issueText(issueFor("trainingLocation"))} />
                </Step>
              )}

              {step === "safety" && (
                <Step title={t("onboarding.safetyTitle")} note={t("onboarding.safetyNote")}>
                  <label className="intake-wide">
                    <span>{t("onboarding.limitationsLabel")}</span>
                    <textarea value={draft.limitations} placeholder={t("onboarding.limitationsPlaceholder")}
                      onChange={(event) => patch("limitations", event.target.value)} />
                  </label>
                  <p className="intake-safety-note">{t("onboarding.safetyWarning")}</p>
                  <label className="intake-consent">
                    <input type="checkbox" checked={draft.safetyAcknowledged} onChange={(event) => patch("safetyAcknowledged", event.target.checked)} />
                    <span>{t("onboarding.consentText")}</span>
                  </label>
                  {issueText(issueFor("safetyAcknowledged")) && <p className="field-issue">{issueText(issueFor("safetyAcknowledged"))}</p>}
                  <p className="intake-diet-note">{t("onboarding.dietLaterNote")}</p>
                </Step>
              )}

              {impact.kind !== "none" && (
                <aside className="intake-impact" aria-live="polite">
                  <h3>{t("onboarding.impactTitle")}</h3>
                  <p>
                    {impact.kind === "goal" && t("onboarding.impactGoal", { min: impact.weeklySetsMin, max: impact.weeklySetsMax, rir: impact.targetRir })}
                    {impact.kind === "body" && t("onboarding.impactBody", { bmr: impact.bmr, calories: impact.calories, protein: impact.protein, weeks: impact.weeks })}
                    {impact.kind === "schedule" && t("onboarding.impactSchedule", { days: impact.trainingDays, minutes: impact.sessionMinutes, exercises: impact.exercisesPerSession })}
                    {impact.kind === "safety" && (impact.adaptedExercises > 0
                      ? t("onboarding.impactSafety", { count: impact.adaptedExercises, confidence: impact.confidence === "high" ? t("onboarding.confidenceHigh") : t("onboarding.confidenceMedium") })
                      : t("onboarding.impactSafetyNone"))}
                  </p>
                </aside>
              )}

              <div className="intake-nav">
                <button type="button" disabled={stepIndex === 0}
                  onClick={() => { setStep(INTAKE_STEPS[Math.max(0, stepIndex - 1)]); setShowIssues(false); }}>{t("onboarding.back")}</button>
                <button type="button" className="primary-cta" disabled={busy} onClick={() => void advance()}>
                  {busy ? t("onboarding.saving") : stepIndex === INTAKE_STEPS.length - 1 ? t("onboarding.finish") : t("onboarding.saveAndContinue")}
                </button>
              </div>
              {message && <p className="form-message" role="alert">{message}</p>}
              {mode === "guest" && probe.capabilities?.accounts && (
                <button type="button" className="intake-signin"
                  onClick={() => void beginCmineLogin("/onboarding", locale)}>{t("product.entry.signIn")}</button>
              )}
            </div>
          </section>
        )}
      </EntryGate>
    </ProductShell>
  );
}

function Step({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return <div className="intake-step"><h2>{title}</h2><p className="intake-note">{note}</p>{children}</div>;
}

function Choice({ label, options, value, onChange, issue }: {
  label: string; options: Array<{ value: string; label: string }>; value: string | null;
  onChange: (value: string) => void; issue: string | null;
}) {
  return (
    <fieldset className="intake-choice">
      <legend>{label}</legend>
      {/* A radiogroup, not styled buttons: marking the chosen one with a class
          alone leaves the selection invisible to assistive technology. */}
      <div role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button key={option.value} type="button" role="radio" aria-checked={value === option.value}
            className={value === option.value ? "active" : ""} onClick={() => onChange(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
      {issue && <p className="field-issue">{issue}</p>}
    </fieldset>
  );
}

function NumberField({ label, value, onChange, issue, hint }: {
  label: string; value: number | null; onChange: (value: number | null) => void; issue: string | null; hint?: string;
}) {
  return (
    <label className={`intake-field${issue ? " invalid" : ""}`}>
      <span>{label}</span>
      <input
        type="number" inputMode="decimal" value={value ?? ""} aria-invalid={issue ? true : undefined}
        // An empty box means "not answered", which is different from zero. The
        // pre-filled defaults this replaces made that distinction impossible.
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
      />
      {hint && !issue && <small>{hint}</small>}
      {issue && <small className="field-issue">{issue}</small>}
    </label>
  );
}
