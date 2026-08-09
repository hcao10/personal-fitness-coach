/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import { defaultProfile, generatePlan, readPlanInsights, type Activity, type CoachPlan, type Equipment, type Experience, type Goal, type Profile, type TrainingTrack } from "./lib/coach";
import { AUTH_PROVIDERS, beginCmineLogin, getCmineSession, type CmineUser } from "./lib/auth";
import { languageOptions, type DisplayLanguage, type Locale } from "./lib/i18n";
import { useLocale } from "./lib/i18n-provider";
import { localizeApiError } from "./lib/api-error";
import { CONSENT_STORAGE_KEY, FALLBACK_DISCLAIMER_VERSION, FALLBACK_PRIVACY_VERSION, PRODUCT_VERSION, consentStamp } from "./lib/consent-versions";
import { useDialog } from "./lib/use-dialog";

const goalOptions: { value: Goal; zh: string; en: string }[] = [
  { value: "arms", zh: "手臂线条", en: "Defined arms" },
  { value: "fat_loss", zh: "减脂", en: "Fat loss" },
  { value: "muscle", zh: "增肌", en: "Build muscle" },
  { value: "recomp", zh: "塑形", en: "Recomposition" },
  { value: "strength", zh: "提升力量", en: "Strength" },
];
const dayNames = { zh: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"], en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] };
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const recommendedStartDate = () => { const date = new Date(); if (date.getHours() >= 15) date.setDate(date.getDate() + 1); return localDate(date); };
const scheduleDateLabel = (start: string, index: number, lang: DisplayLanguage) => { const date = new Date(`${start}T12:00:00`); date.setDate(date.getDate() + index); return date.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric", weekday: "short" }); };
const shiftLocalDate = (start: string, days: number) => { const date = new Date(`${start}T12:00:00`); date.setDate(date.getDate() + days); return localDate(date); };

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="field-label">{children}</span>;
}

export default function CoachApp() {
  // The locale lives in the provider that wraps the whole app, not in this
  // component. When it was local state here, switching language on the homepage
  // left every other page in Chinese, and nested components had no way to reach
  // the choice at all.
  const { locale, t, setLocale: changeLocale } = useLocale();
  const lang: DisplayLanguage = locale === "zh" ? "zh" : "en";
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [plan, setPlan] = useState<CoachPlan>(() => generatePlan(defaultProfile));
  const [generating, setGenerating] = useState(false);
  const [planReady, setPlanReady] = useState(false);
  const [planSource, setPlanSource] = useState<"llm" | "rules" | null>(null);
  const [anonymousPreview, setAnonymousPreview] = useState(false);
  const [planId, setPlanId] = useState<string | null>(null);
  const [planStatus, setPlanStatus] = useState<"active" | "draft">("active");
  const [services, setServices] = useState({ ai: false, rewardAds: false });
  const [announcement, setAnnouncement] = useState("");
  const [activeDay, setActiveDay] = useState(0);
  const [accepted, setAccepted] = useState<boolean | null>(null);
  const [consentVersions, setConsentVersions] = useState({ disclaimer: FALLBACK_DISCLAIMER_VERSION, privacy: FALLBACK_PRIVACY_VERSION });
  const [healthCheck, setHealthCheck] = useState(false);
  const [estimateCheck, setEstimateCheck] = useState(false);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);
  const [points, setPoints] = useState(0);
  const [loginOpen, setLoginOpen] = useState(false);
  const [adOpen, setAdOpen] = useState(false);
  const [adClaimed, setAdClaimed] = useState(false);
  const [toast, setToast] = useState("");
  const [user, setUser] = useState<CmineUser | null>(null);
  const [startDate, setStartDate] = useState(recommendedStartDate);
  const [dateOptions] = useState(() => { const today = new Date(); const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1); return { today: localDate(today), tomorrow: localDate(tomorrow) }; });
  const [timezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const planRef = useRef<HTMLElement>(null);
  // The consent gate passes null: it must be answered, not dismissed.
  const consentDialogRef = useDialog(Boolean(user) && accepted === false, null);
  const loginDialogRef = useDialog(loginOpen, () => setLoginOpen(false));
  const adDialogRef = useDialog(adOpen, () => setAdOpen(false));

  useEffect(() => {
    queueMicrotask(() => {
      // `accepted` stays null until /api/v1/site reports the current document
      // versions; a server-side version bump therefore forces re-confirmation.
      void getCmineSession().then(async (session) => {
        setUser(session.user);
        setPoints(session.points);
        if (!session.user) return;
        const response = await fetch("/api/v1/me", { cache: "no-store" }).catch(() => null);
        if (!response?.ok) return;
        const account = await response.json() as {
          profile?: Profile | null;
          latestPlan?: { id: string; profile: Profile | null; plan: CoachPlan | null; source?: string | null } | null;
        };
        if (account.profile) setProfile(account.profile);
        if (account.latestPlan?.plan) {
          setPlan(account.latestPlan.plan);
          setPlanId(account.latestPlan.id);
          setPlanStatus("active");
          setPlanSource(account.latestPlan.source === "llm" ? "llm" : "rules");
          setPlanReady(true);
          const homeResponse = await fetch("/api/v1/coach/home", { cache: "no-store" }).catch(() => null);
          const coachHome = homeResponse?.ok ? await homeResponse.json() as { today?: { dayIndex?: number; scheduledDate?: string } | null } : null;
          setActiveDay(Math.max(0, Math.min(6, Number(coachHome?.today?.dayIndex || 0))));
          if (coachHome?.today?.scheduledDate) setStartDate(shiftLocalDate(coachHome.today.scheduledDate, -Number(coachHome.today.dayIndex || 0)));
        } else if (account.profile) {
          setPlan(generatePlan(account.profile));
        }
      });
      void fetch("/api/health", { cache: "no-store" }).then((response) => response.json()).then((status: { llm?: boolean; rewardAds?: boolean }) => setServices({ ai: Boolean(status.llm), rewardAds: Boolean(status.rewardAds) })).catch(() => undefined);
      void fetch("/api/v1/site", { cache: "no-store" }).then((response) => response.json()).then((site: { announcement?: string; disclaimerVersion?: string; privacyVersion?: string }) => {
        setAnnouncement(site.announcement || "");
        const disclaimer = site.disclaimerVersion || FALLBACK_DISCLAIMER_VERSION;
        const privacy = site.privacyVersion || FALLBACK_PRIVACY_VERSION;
        setConsentVersions({ disclaimer, privacy });
        setAccepted(localStorage.getItem(CONSENT_STORAGE_KEY) === consentStamp(disclaimer, privacy));
      }).catch(() => {
        setAccepted(localStorage.getItem(CONSENT_STORAGE_KEY) === consentStamp(FALLBACK_DISCLAIMER_VERSION, FALLBACK_PRIVACY_VERSION));
      });
      const authError = new URLSearchParams(window.location.search).get("auth_error");
      if (authError) setToast(authError);
    });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 4200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const patchProfile = <K extends keyof Profile>(key: K, value: Profile[K]) => {
    const next = { ...profile, [key]: value };
    setProfile(next);
    setPlan(generatePlan(next));
    setPlanReady(false);
    setPlanSource(null);
    setPlanId(null);
    setCompleted(new Set());
  };
  const selectTrack = (track: TrainingTrack) => {
    const next: Profile = track === "intermediate_hypertrophy"
      ? { ...profile, trainingTrack: track, goal: "muscle", experience: "intermediate", days: Math.max(3, profile.days), sessionMinutes: Math.max(45, Number(profile.sessionMinutes || 45)), equipment: profile.equipment === "bodyweight" ? "dumbbell" : profile.equipment }
      : { ...profile, trainingTrack: "beginner_fat_loss", goal: "fat_loss", experience: "beginner", days: Math.min(4, profile.days), sessionMinutes: [20, 30, 45].includes(Number(profile.sessionMinutes)) ? profile.sessionMinutes : 30 };
    setProfile(next); setPlan(generatePlan(next)); setPlanReady(false); setPlanSource(null); setPlanId(null); setCompleted(new Set());
  };
  const buildPlan = async () => {
    if (!user) {
      sessionStorage.setItem("cmine_fit_intake_draft", JSON.stringify(profile));
      setPlan(generatePlan(profile));
      setAnonymousPreview(true);
      setToast(t("home.yourPrivateRulesBased"));
      return;
    }
    setGenerating(true);
    let revealPlan = false;
    try {
      const response = await fetch("/api/plans", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile, consent: accepted === true, startDate, timezone }) });
      const result = await response.json() as { plan?: CoachPlan; planId?: string | null; planStatus?: "active" | "draft"; source?: "llm" | "rules"; error?: string; message?: string };
      if (response.ok && result.plan) {
        const source = result.source === "llm" ? "llm" : "rules";
        setPlan(result.plan);
        setPlanId(result.planId || null);
        setPlanStatus(result.planStatus || "active");
        setCompleted(new Set());
        setPlanSource(source);
        setPlanReady(true);
        revealPlan = true;
        setActiveDay(0);
        setToast(result.planStatus === "draft"
          ? (t("home.yourNewPlanIs"))
          : source === "llm"
            ? (t("home.yourAiPlanPassed"))
            : (t("home.yourPlanWasGenerated")));
      } else {
        setPlanReady(false);
        setPlanSource(null);
        setToast(localizeApiError(result, locale, t("home.theAiCoachIs")));
      }
    } catch {
      setPlanReady(false);
      setPlanSource(null);
      setToast(t("home.couldNotReachThe"));
    } finally {
      setGenerating(false);
      if (revealPlan) {
        window.setTimeout(() => planRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
      }
    }
  };
  const completeExercise = async (key: string, dayIndex: number, exerciseId: string) => {
    if (completed.has(key)) return;
    if (user && planId) {
      const response = await fetch("/api/completions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ planId, dayIndex, exerciseId }) });
      const result = await response.json() as { points?: number; message?: string };
      if (!response.ok) { setToast(result.message || (t("home.couldNotSyncThis"))); return; }
      if (typeof result.points === "number") setPoints(result.points);
    }
    setCompleted((current) => new Set(current).add(key));
  };
  const activateDraft = async () => {
    if (!planId) return;
    const response = await fetch(`/api/v1/plans/${encodeURIComponent(planId)}/activate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ startDate, timezone }) });
    if (!response.ok) { setToast(t("home.couldNotActivateThis")); return; }
    setPlanStatus("active"); setToast(t("home.theNewPlanIs"));
  };
  const signIn = async (resumeIntake = false) => {
    const result = await beginCmineLogin(resumeIntake ? "/onboarding?resume=intake" : "/");
    if (!result.ok) { setLoginOpen(false); setToast(result.message || "登录暂不可用。"); }
  };
  const currentDay = plan.schedule[activeDay] || plan.schedule[0];
  const goalLabel = goalOptions.find((goal) => goal.value === profile.goal)?.[lang] || "";
  // One tolerant read for both plan vintages; everything below is plain strings.
  const insights = readPlanInsights(plan.insights, lang);
  const coachNotes = insights?.coachNotes.length ? insights.coachNotes : [t("home.note1"), t("home.note2"), t("home.note3")];
  const dietGuidance = insights?.dietGuidance.length ? insights.dietGuidance : [t("home.diet1"), t("home.diet2"), t("home.diet3")];
  const planRationale = insights?.planRationale || [];

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Cmine Fit home"><span className="brand-mark">C</span><span>CMINE <b>FIT</b></span></a>
        <nav className="topnav" aria-label="Primary navigation"><a href="#coach">{t("home.navCoach")}</a><a href="/nutrition">{t("home.linkNutrition")}</a><a href="#editions">{t("home.navAbout")}</a><a href="/pricing">{t("home.navPricing")}</a><a href="/admin">{t("home.navAdmin")}</a></nav>
        <div className="header-actions">
          <label className="language-select"><span className="sr-only">Language</span>
            <select value={locale} onChange={(event) => void changeLocale(event.target.value as Locale)}>
              {languageOptions.map((language) => <option key={language.value} value={language.value}>{language.label}</option>)}
            </select>
          </label>
          {user && services.rewardAds && <button className="points-pill" onClick={() => setAdOpen(true)} aria-label={t("home.watchAd")}><span>◆</span> {points}</button>}
          {user ? (
            <a className="avatar-button" href="/account"><span>{(user.name || user.email || "C").slice(0, 1).toUpperCase()}</span><em>{t("home.myTraining")}</em></a>
          ) : <button className="login-button" onClick={() => setLoginOpen(true)}>{t("home.login")} <span>↗</span></button>}
        </div>
      </header>
      {announcement && <div className="site-announcement" role="status"><span>CMINE FIT</span><p>{announcement}</p></div>}

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="edition-pills"><span>{t("home.aspiration")}</span><i>+</i><span>{t("home.expertPlan")}</span></div>
          <p className="eyebrow"><span /> {t("home.eyebrow")}</p>
          <h1><s>{t("home.titleA")}</s><br /><em>{lang === "zh" ? <>为您定制的专属<br />计划如下：</> : t("home.titleB")}</em></h1>
          <p className="hero-subtitle">{t("home.subtitle")}</p>
          <div className="trust-row">
            <div><b>1:1</b><span>{t("home.personal")}</span><small>{t("home.socialProof")}</small></div>
          </div>
        </div>
        <div className="signal-card" aria-label={t("home.estimate")}>
          <div className="signal-top"><span>{t("home.estimate")}</span><i>{planReady ? (planSource === "llm" ? "LLM COACHED" : "RULES BASED") : services.ai ? "READY FOR AI" : "PROFILE ESTIMATE"}</i></div>
          <div className="calorie-orbit"><div><b>{plan.calories.toLocaleString()}</b><span>{t("home.kcal")} / day</span></div></div>
          <div className="signal-stats">
            <div><b>{plan.protein}g</b><span>{t("home.protein")}</span></div><div><b>{profile.days}×</b><span>{t("home.weekPlan")}</span></div><div><b>{plan.weeks}</b><span>{t("home.daysUnit")}</span></div>
          </div>
          <p><span>{planReady ? (planSource === "llm" ? "AI" : "R") : "B"}</span>{planReady ? (planSource === "llm" ? (t("home.aiCompletedYourSessions")) : (t("home.thisPlanComesFrom"))) : (t("home.baseMetricsFirstThe"))}</p>
        </div>
      </section>

      <section className="coach-studio" id="coach">
        <div className="section-heading"><p>01 / INTAKE</p><div><h2>{t("home.profileTitle")}</h2><span>{t("home.profileHint")}</span></div></div>
        <div className="intake-grid">
          <div className="form-card">
            {/* Single-select button groups are exposed as radio groups: styling
                the chosen one with a class leaves the selection invisible to
                assistive technology. */}
            <div className="homepage-track-selector" role="radiogroup" aria-label={t("home.trainingTrack")}><button role="radio" aria-checked={profile.trainingTrack !== "intermediate_hypertrophy"} className={profile.trainingTrack !== "intermediate_hypertrophy" ? "active" : ""} onClick={() => selectTrack("beginner_fat_loss")}><span>{t("home.startHere")}</span><b>{t("home.beginnerFatLoss")}</b><small>{t("home.2045MinuteSessions")}</small></button><button role="radio" aria-checked={profile.trainingTrack === "intermediate_hypertrophy"} className={profile.trainingTrack === "intermediate_hypertrophy" ? "active" : ""} onClick={() => selectTrack("intermediate_hypertrophy")}><span>{t("home.progressive")}</span><b>{t("home.intermediateHypertrophy")}</b><small>{t("home.setsRirProgressionAnd")}</small></button></div>
            <div className="form-section">
              <div className="form-section-title"><span>01</span><h3>{t("home.basics")}</h3></div>
              <div className="segmented" role="radiogroup" aria-label={t("home.sex")}>
                {(["female", "male"] as const).map((sex) => <button key={sex} role="radio" aria-checked={profile.sex === sex} className={profile.sex === sex ? "active" : ""} onClick={() => patchProfile("sex", sex)}>{lang === "zh" ? (sex === "female" ? "女性" : "男性") : sex === "female" ? "Female" : "Male"}</button>)}
              </div>
              <div className="field-grid three">
                <label><FieldLabel>{t("home.age")}</FieldLabel><span className="input-unit"><input aria-label={t("home.age")} type="number" min="16" max="85" value={profile.age} onChange={(e) => patchProfile("age", Number(e.target.value))} /><em>{t("home.yr")}</em></span></label>
                <label><FieldLabel>{t("home.height")}</FieldLabel><span className="input-unit"><input aria-label={t("home.height")} type="number" min="130" max="220" value={profile.height} onChange={(e) => patchProfile("height", Number(e.target.value))} /><em>cm</em></span></label>
                <label><FieldLabel>{t("home.weight")}</FieldLabel><span className="input-unit"><input aria-label={t("home.weight")} type="number" min="35" max="250" value={profile.weight} onChange={(e) => patchProfile("weight", Number(e.target.value))} /><em>kg</em></span></label>
              </div>
            </div>
            <div className="form-section">
              <div className="form-section-title"><span>02</span><h3>{t("home.goal")}</h3></div>
              <div className="goal-grid" role="radiogroup" aria-label={t("home.goal")}>
                {goalOptions.map((goal) => <button key={goal.value} role="radio" aria-checked={profile.goal === goal.value} className={profile.goal === goal.value ? "active" : ""} onClick={() => patchProfile("goal", goal.value)}><span aria-hidden="true">{goal.value === "arms" ? "◎" : goal.value === "fat_loss" ? "↘" : goal.value === "muscle" ? "＋" : goal.value === "recomp" ? "◇" : "↑"}</span>{goal[lang]}</button>)}
              </div>
              {profile.trainingTrack === "intermediate_hypertrophy" ? <div className="track-detail-fields"><label><FieldLabel>{t("home.trainingMonths")}</FieldLabel><input type="number" min="3" max="600" value={profile.trainingAgeMonths || 0} onChange={(event) => patchProfile("trainingAgeMonths", Number(event.target.value))} /></label><label><FieldLabel>{t("home.priorityMuscles")}</FieldLabel><input value={profile.weakPoints || ""} onChange={(event) => patchProfile("weakPoints", event.target.value)} placeholder={t("home.eGLatsSide")} /></label></div> : <div className="track-detail-fields"><label><FieldLabel>{t("home.mainBarrier")}</FieldLabel><select value={profile.beginnerBarrier || "confidence"} onChange={(event) => patchProfile("beginnerBarrier", event.target.value as Profile["beginnerBarrier"])}><option value="confidence">{t("home.notSureHowTo")}</option><option value="time">{t("home.limitedTime")}</option><option value="consistency">{t("home.consistency")}</option><option value="food">{t("home.foodChoices")}</option><option value="feedback">{t("home.lackOfFeedback")}</option></select></label><label><FieldLabel>{t("home.preferredDuration")}</FieldLabel><select value={profile.sessionMinutes || 30} onChange={(event) => patchProfile("sessionMinutes", Number(event.target.value))}><option value="20">20 min</option><option value="30">30 min</option><option value="45">45 min</option></select></label></div>}
              <div className="field-grid two">
                <label><FieldLabel>{t("home.targetWeight")}</FieldLabel><span className="input-unit"><input aria-label={t("home.targetWeight")} type="number" min="35" max="250" value={profile.targetWeight} onChange={(e) => patchProfile("targetWeight", Number(e.target.value))} /><em>kg</em></span></label>
                <label><FieldLabel>{t("home.dailyActivity")}</FieldLabel>
                  <select value={profile.activity} onChange={(e) => patchProfile("activity", e.target.value as Activity)}>
                    <option value="sedentary">{t("home.mostlySeated")}</option><option value="light">{t("home.lightActivity")}</option>
                    <option value="moderate">{t("home.moderateActivity")}</option><option value="active">{t("home.veryActive")}</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="form-section">
              <div className="form-section-title"><span>03</span><h3>{t("home.routine")}</h3></div>
              <div className="field-grid two">
                <label><FieldLabel>{t("home.experience")}</FieldLabel>
                  <select value={profile.experience} onChange={(e) => patchProfile("experience", e.target.value as Experience)}>
                    <option value="beginner">{t("home.beginner06Months")}</option><option value="intermediate">{t("home.intermediate")}</option><option value="advanced">{t("home.advanced")}</option>
                  </select>
                </label>
                <label><FieldLabel>{t("home.equipment")}</FieldLabel>
                  <select value={profile.equipment} onChange={(e) => patchProfile("equipment", e.target.value as Equipment)}>
                    <option value="bodyweight">{t("home.bodyweightHome")}</option><option value="dumbbell">{t("home.dumbbells")}</option><option value="gym">{t("home.fullGym")}</option>
                  </select>
                </label>
              </div>
              <div className="field-grid two">
                <label><FieldLabel>{t("home.sessionDuration")}</FieldLabel><span className="input-unit"><input type="number" min="20" max="180" value={profile.sessionMinutes || 50} onChange={(e) => patchProfile("sessionMinutes", Number(e.target.value))} /><em>{t("home.min")}</em></span></label>
                <label><FieldLabel>{t("home.trainingLocation")}</FieldLabel>
                  <select value={profile.trainingLocation || "mixed"} onChange={(e) => patchProfile("trainingLocation", e.target.value as NonNullable<Profile["trainingLocation"]>)}>
                    <option value="home">{t("home.home")}</option><option value="gym">{t("home.gym")}</option><option value="outdoors">{t("home.outdoors")}</option><option value="mixed">{t("home.mixed")}</option>
                  </select>
                </label>
              </div>
              <div className="days-control"><FieldLabel>{t("home.trainingDaysPerWeek")}</FieldLabel><div>{[2, 3, 4, 5, 6].map((day) => <button key={day} className={profile.days === day ? "active" : ""} onClick={() => patchProfile("days", day)}>{day}</button>)}</div></div>
              <label className="full-field"><FieldLabel>{t("home.injuriesPainOrMovements")}</FieldLabel><input value={profile.limitations} onChange={(e) => patchProfile("limitations", e.target.value)} placeholder={t("home.eGOldRight")} /></label>
            </div>
            <div className="form-section">
              <div className="form-section-title"><span>04</span><h3>{t("home.foodPreferences")}</h3></div>
              <div className="field-grid two">
                <label><FieldLabel>{t("home.eatingStyle")}</FieldLabel>
                  <select value={profile.dietaryPreference || "balanced"} onChange={(e) => patchProfile("dietaryPreference", e.target.value as NonNullable<Profile["dietaryPreference"]>)}>
                    <option value="balanced">{t("home.balanced")}</option><option value="vegetarian">{t("home.vegetarian")}</option><option value="high_protein">{t("home.highProtein")}</option><option value="none">{t("home.noPreference")}</option>
                  </select>
                </label>
                <label><FieldLabel>{t("home.exclusionsOrAllergies")}</FieldLabel><input value={profile.exclusions || ""} onChange={(e) => patchProfile("exclusions", e.target.value)} placeholder={t("home.eGLactosePeanut")} /></label>
              </div>
            </div>
            {user && <div className="plan-start-picker"><div><FieldLabel>{t("home.planStartDate")}</FieldLabel><p>{t("home.plansMadeLaterIn")}</p></div><button type="button" className={startDate === dateOptions.today ? "active" : ""} onClick={() => setStartDate(dateOptions.today)}>{t("home.today")}</button><button type="button" className={startDate === dateOptions.tomorrow ? "active" : ""} onClick={() => setStartDate(dateOptions.tomorrow)}>{t("home.tomorrow")}</button><input aria-label={t("home.planStartDate2")} type="date" value={startDate} min={dateOptions.today} onChange={(event) => setStartDate(event.target.value)} /></div>}
            <button className="primary-cta" onClick={buildPlan} disabled={generating}><span>{generating ? (t("home.aiIsPlanning")) : !user ? (t("home.previewMyPlan")) : t("home.generate")}</span><b>{generating ? "···" : "→"}</b></button>
            <p className="privacy-line">◉ {!user ? (t("home.previewCalculationsStayIn")) : (t("home.generationSecurelySubmitsThis"))}</p>
          </div>

          <aside className="preview-card">
            <div className="preview-header"><span>{t("home.preview")}</span><i>LIVE</i></div>
            <div className="preview-hero"><p>{goalLabel}</p><h3>{plan.weeks} <span>{t("home.daysUnit")}</span></h3><small>{t("home.aSafeSustainableCycle")}</small></div>
            <div className="metric-stack">
              <div><span>{t("home.calories")}<small>{t("home.bmr")} {plan.bmr}</small></span><b>{plan.calories}<em> kcal</em></b></div>
              <div><span>{t("home.protein")}<small>{t("home.about")} {(plan.protein / profile.weight).toFixed(1)}g/kg</small></span><b>{plan.protein}<em> g</em></b></div>
              <div><span>{t("home.weekPlan")}<small>{profile.days} {t("home.trainingDays")}</small></span><b>{Math.round(plan.schedule.reduce((sum, day) => sum + day.duration, 0) / 60)}<em> h</em></b></div>
            </div>
            <div className="week-strip">{plan.schedule.map((day, index) => <div key={index} className={day.restDay ? "" : "training"}><span>{user ? scheduleDateLabel(startDate, index, lang) : dayNames[lang][index]}</span><b>{day.restDay ? "·" : "●"}</b></div>)}</div>
            <div className="preview-note"><span>↗</span><p>{insights?.summary || t("home.previewNote", { goal: goalLabel })}</p></div>
            {anonymousPreview && !user && <div className="anonymous-plan-preview">
              <div className="preview-day-sample">
                <span>{t("home.dayOnePartialPreview")}</span>
                <b>{plan.schedule.find((day) => !day.restDay)?.title[lang]}</b>
                <p>{plan.schedule.find((day) => !day.restDay)?.exercises.slice(0, 2).map((exercise) => exercise.name[lang]).join(" · ")}</p>
              </div>
              <div className="locked-plan-sections" aria-label={t("home.fullPlanUnlockedAfter")}>
                <span>完整 7 天安排</span><span>组数、次数与休息</span><span>渐进负荷</span><span>完整饮食建议</span><span>为什么这样安排</span><span>Coach 长期调整</span>
              </div>
              <p>{t("home.signInToGenerate")}</p>
              <button onClick={() => void signIn(true)}>{t("home.saveDetailsAndGenerate")}<b>→</b></button>
            </div>}
          </aside>
        </div>
      </section>

      {planReady && <section className="plan-section" id="plan" ref={planRef}>
        <div className="section-heading light"><p>02 / YOUR PLAN</p><div><h2>{t("home.planTitle")}</h2><span>{t("home.planSub")}</span></div></div><div className={`plan-source-pill ${planSource === "llm" ? "llm" : "rules"}`}>{planSource === "llm" ? (t("home.aiPersonalizedSafetyChecked")) : (t("home.rulesBasedDeterministic"))}</div>
        {planStatus === "draft" && <div className="plan-draft-banner"><div><span>DRAFT / 待确认</span><p>{t("home.thisIsADraft")}</p></div><button onClick={() => void activateDraft()}>{t("home.confirmAndActivate")} →</button></div>}
        {plan.phase && <div className="plan-phase-overview"><div><span>{t("home.currentPhase")}</span><h3>{plan.phase.kind === "habit_foundation" ? (t("home.4WeekHabitFoundation")) : plan.phase.kind === "hypertrophy_build" ? (t("home.6WeekHypertrophyBuild")) : (t("home.4WeekFoundation"))}</h3><p>{plan.phase.weeklyFocus.map((item, index) => `${index + 1}. ${item[lang]}`).join("  ·  ")}</p></div><aside><small>{t("home.start")}</small><b>{scheduleDateLabel(startDate, 0, lang)}</b><small>{t("home.dataCompleteness")}</small><b>{plan.confidence === "high" ? (t("home.high")) : (t("home.someGaps"))}</b></aside></div>}
        <div className="nutrition-grid">
          <article className="nutrition-main">
            <div className="card-kicker">{t("home.nutrition")}</div>
            <div className="calorie-number"><b>{plan.calories.toLocaleString()}</b><span>{t("home.kcal")}<br />/ DAY</span></div>
            <div className="balance-chip">{plan.calorieDelta > 0 ? "+" : ""}{plan.calorieDelta} {t("home.kcal")} · {profile.goal === "fat_loss" ? (t("home.moderateDeficit")) : (t("home.goalBalance"))}</div>
            <div className="energy-rail"><span style={{ width: Math.min(88, Math.max(28, (plan.calories / plan.tdee) * 74)) + "%" }} /></div>
            <div className="energy-labels"><span>{t("home.bmr")}<b>{plan.bmr}</b></span><span>{t("home.tdee")}<b>{plan.tdee}</b></span><span>BMI<b>{plan.bmi}</b></span></div>
          </article>
          <article className="macro-card protein"><span>PRO</span><b>{plan.protein}g</b><p>{t("home.protein")}</p><small>{Math.round((plan.protein * 4 / plan.calories) * 100)}% kcal</small></article>
          <article className="macro-card carbs"><span>CARB</span><b>{plan.carbs}g</b><p>{t("home.carbs")}</p><small>{Math.round((plan.carbs * 4 / plan.calories) * 100)}% kcal</small></article>
          <article className="macro-card fat"><span>FAT</span><b>{plan.fat}g</b><p>{t("home.fat")}</p><small>{Math.round((plan.fat * 9 / plan.calories) * 100)}% kcal</small></article>
        </div>

        <div className="week-layout" id="library">
          <div className="week-main">
            <div className="week-heading"><div><span>03 / TRAINING</span><h3>{t("home.weekPlan")}</h3></div><button onClick={() => document.getElementById("coach")?.scrollIntoView({ behavior: "smooth" })}>{t("home.update")} ↗</button></div>
            <div className="day-tabs" role="tablist" aria-label={t("home.weekPlan")}>
              {plan.schedule.map((day, index) => <button key={index} id={`day-tab-${index}`} role="tab" aria-selected={activeDay === index} aria-controls="day-panel" tabIndex={activeDay === index ? 0 : -1} className={activeDay === index ? "active" : ""} onClick={() => setActiveDay(index)}><span>{scheduleDateLabel(startDate, index, lang)}</span><b>{day.restDay ? "REST" : day.duration + "M"}</b></button>)}
            </div>
            {/* The tabs previously controlled nothing: role="tablist" without a
                matching tabpanel leaves the relationship broken for AT. */}
            <div id="day-panel" role="tabpanel" aria-labelledby={`day-tab-${activeDay}`} tabIndex={-1}>
            <div className="workout-head"><div><p>{currentDay.focus[lang]}</p><h3>{currentDay.title[lang]}</h3></div><div><span>{currentDay.restDay ? "—" : currentDay.exercises.length}</span><small>{currentDay.restDay ? t("home.recovery") : t("home.exercises")}</small></div></div>
            {currentDay.restDay ? (
              <div className="recovery-panel"><span>↻</span><div><h4>{currentDay.focus[lang]}</h4><p>{t("home.recoveryIsWhereAdaptation")}</p></div></div>
            ) : (
              <div className="exercise-list">
                {currentDay.exercises.map((exercise, index) => {
                  const key = activeDay + "-" + exercise.id;
                  const isDone = completed.has(key);
                  const isExpanded = expandedExercise === key;
                  return <article className={"exercise-row " + (isExpanded ? "expanded" : "")} key={key}>
                    <button className="exercise-media" onClick={() => setExpandedExercise(isExpanded ? null : key)} aria-label={exercise.name[lang] + " demo"}>
                      <img src={"/exercises/" + exercise.asset + (isExpanded ? ".gif" : ".jpg")} alt={exercise.name[lang]} /><span>{isExpanded ? "×" : "▶"}</span>
                    </button>
                    <div className="exercise-index">{String(index + 1).padStart(2, "0")}</div>
                    <div className="exercise-copy"><h4>{exercise.name[lang]}</h4><p>{exercise.target[lang]}</p><small>{exercise.cue[lang]}</small></div>
                    <div className="prescription"><span><b>{exercise.sets}</b>{t("home.sets")}</span><span><b>{exercise.reps}</b>REPS</span><span><b>{exercise.rest}</b>REST</span></div>
                    <button className={"complete-button " + (isDone ? "done" : "")} onClick={() => void completeExercise(key, activeDay, exercise.id)} disabled={isDone}>{isDone ? "✓" : "+"}<span>{isDone ? t("home.completed") : t("home.complete")}</span></button>
                  </article>;
                })}
              </div>
            )}
            </div>
          </div>
          <aside className="coach-sidebar">
            {planRationale.length > 0 && <article className="rationale-card"><div className="card-kicker">{t("home.whyThisPlanFits")}</div>{planRationale.map((reason, index) => <div key={reason}><span>{String(index + 1).padStart(2, "0")}</span><p>{reason}</p></div>)}</article>}
            <article className="notes-card"><div className="card-kicker">{t("home.coachNotes")}</div>{coachNotes.map((note, index) => <div key={note}><span>{index + 1}</span><p>{note}</p></div>)}</article>
            <article className="diet-card"><div className="card-kicker">{t("home.dietTitle")}</div><ul>{dietGuidance.map((item) => <li key={item}>{item}</li>)}</ul></article>
          </aside>
        </div>
      </section>}

      <section className="edition-section" id="editions">
        <div className="section-heading"><p>04 / YOUR WAY</p><div><h2>{t("home.editions")}</h2><span>{t("home.yourControlLongTerm")}</span></div></div>
        <div className="edition-grid">
          <article className="open-edition"><div className="edition-tag">{t("home.openCore")}</div><h3>{t("home.openTitle")}</h3><p>{t("home.openText")}</p><div className="feature-cloud"><span>{t("home.selfHost")}</span><span>{t("home.localAi")}</span><span>{t("home.transparentCore")}</span><span>{t("home.zhEn")}</span></div><a href="https://github.com/hcao10/personal-fitness-coach" target="_blank" rel="noreferrer">{t("home.viewSource")} <b>↗</b></a></article>
          <article className="pro-edition"><div className="edition-tag">{t("home.proEdition")}</div><h3>{t("home.proTitle")}</h3><p>{t("home.proText")}</p>
            <div className="pro-diagram"><div><span>01</span><b>{t("home.trainingRecord")}</b><small>CONTINUITY</small></div><i>→</i><div><span>02</span><b>{t("home.smartPlanning")}</b><small>PERSONALIZATION</small></div><i>→</i><div><span>03</span><b>{t("home.ongoingRefinement")}</b><small>PROGRESS</small></div></div>
            <a className="edition-link" href="/pricing">{t("home.upgrade")} <b>→</b></a>
          </article>
        </div>
      </section>

      <footer><a className="brand" href="#top"><span className="brand-mark">C</span><span>CMINE <b>FIT</b></span></a><p>{t("home.footerNote")}</p><span>© 2026 Cmine Fit · Exercise media © Gym visual · <a className="admin-link" href="/admin">{t("home.navAdmin")}</a></span></footer>

      {user && accepted === false && <div ref={consentDialogRef} className="modal-backdrop safety-backdrop" role="dialog" aria-modal="true" aria-labelledby="disclaimer-title">
        <div className="safety-modal">
          <div className="modal-stripe"><span>SAFETY FIRST</span><b>01 / 03</b></div><h2 id="disclaimer-title">{t("home.disclaimerTitle")}</h2><p className="disclaimer-intro">{t("home.disclaimerIntro")}</p>
          <label className={healthCheck ? "checked" : ""}><input type="checkbox" checked={healthCheck} onChange={(e) => setHealthCheck(e.target.checked)} /><span>{healthCheck ? "✓" : ""}</span><p>{t("home.disclaimerHealth")}</p></label>
          <label className={estimateCheck ? "checked" : ""}><input type="checkbox" checked={estimateCheck} onChange={(e) => setEstimateCheck(e.target.checked)} /><span>{estimateCheck ? "✓" : ""}</span><p>{t("home.disclaimerEstimate")}</p></label>
          <button className="primary-cta" disabled={!healthCheck || !estimateCheck} onClick={() => { localStorage.setItem(CONSENT_STORAGE_KEY, consentStamp(consentVersions.disclaimer, consentVersions.privacy)); setAccepted(true); void fetch("/api/consents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ locale: lang, timezone, productVersion: PRODUCT_VERSION }) }); }}><span>{t("home.accept")}</span><b>→</b></button>
          <small>{lang === "zh" ? <>继续即表示你已阅读并接受<a href="/disclaimer" target="_blank" rel="noreferrer">《健康免责声明》</a>与<a href="/privacy" target="_blank" rel="noreferrer">《隐私说明》</a>。</> : <>Continuing means you accept the <a href="/disclaimer" target="_blank" rel="noreferrer">health disclaimer</a> and <a href="/privacy" target="_blank" rel="noreferrer">privacy notice</a>.</>}</small>
        </div>
      </div>}

      {loginOpen && <div ref={loginDialogRef} className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setLoginOpen(false)} role="dialog" aria-modal="true" aria-labelledby="signin-title">
        <div className="small-modal"><button className="modal-close" aria-label={t("home.close")} onClick={() => setLoginOpen(false)}>×</button><span className="modal-icon" aria-hidden="true">↗</span><h2 id="signin-title">{t("home.signinTitle")}</h2><p>{t("home.signinText")}</p>
          <div className="provider-list">{AUTH_PROVIDERS.map((provider) => <button key={provider.id} onClick={() => void signIn(anonymousPreview)}><span>C</span>{provider.label}<em>→</em></button>)}</div>
        </div>
      </div>}

      {adOpen && <div ref={adDialogRef} className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setAdOpen(false)} role="dialog" aria-modal="true" aria-labelledby="ad-title">
        <div className="small-modal ad-modal"><button className="modal-close" aria-label={t("home.close")} onClick={() => setAdOpen(false)}>×</button><span className="modal-icon" aria-hidden="true">◆</span><h2 id="ad-title">{t("home.adTitle")}</h2><p>{t("home.adText")}</p><div className="ad-reward"><b>+10</b><span>{t("home.points")}</span></div>
          <button className="primary-cta" disabled={adClaimed} onClick={async () => { const response = await fetch("/api/points/claim-ad", { method: "POST" }); const result = await response.json() as { message?: string }; setAdClaimed(response.ok); setToast(result.message || (t("home.rewardAdsAreNot"))); window.setTimeout(() => setAdOpen(false), 900); }}><span>{adClaimed ? t("home.completed") : t("home.playAd")}</span><b>▶</b></button>
        </div>
      </div>}
      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    </main>
  );
}

