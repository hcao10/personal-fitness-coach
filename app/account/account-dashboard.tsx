"use client";

import { useEffect, useMemo, useState } from "react";
import { BrandMark } from "../shared/ui/brand-mark";
import Link from "next/link";
import ProductShell from "../components/product-shell";
import { beginCmineLogin, signOutCmine } from "../lib/auth";
import { useCapabilities } from "../shared/api/capability-provider";
import { defaultProfile, readPlanInsights, type CoachPlan, type Localized, type Profile } from "../lib/coach";
import { useLocale, useT, useLocaleRef } from "../lib/i18n-provider";
import { dateFormatter, pick, type Locale, type MessageKey } from "../../packages/i18n/src";
import { localizeApiError, type ApiErrorBody } from "../lib/api-error";

type StoredPlan = {
  id: string;
  profile: Profile | null;
  plan: CoachPlan | null;
  source: string;
  model: string;
  createdAt: string;
};
type Measurement = {
  id: string;
  weightKg: number | null;
  bodyFatPct: number | null;
  waistCm: number | null;
  armCm: number | null;
  note: string;
  measuredAt: string;
};
type AccountData = {
  user: { sub: string; email: string | null; name: string | null; picture: string | null };
  profile: Profile | null;
  latestPlan: StoredPlan | null;
  plans: StoredPlan[];
  measurements: Measurement[];
  progress: { completedExercises: number; completedWorkouts: number; latestMeasurement: Measurement | null };
  points: number;
  pointLedger: { id: string; delta: number; reason: string; createdAt: string }[];
  product: {
    membership: {
      tier: "free" | "pro";
      name: string;
      status: string;
      currentPeriodEnd: string | null;
      cancelAtPeriodEnd: boolean;
      provider: string | null;
    };
    capabilities: string[];
    usage: {
      period: string;
      tier: "free" | "pro";
      capabilities: Record<string, { used: number; bonus: number; limit: number; remaining: number }>;
    };
  };
  nutritionToday: { meals: number; calories: number; proteinG: number; carbsG: number; fatG: number };
  meals: { id: string; mealType: string; eatenAt: string; calories: number; items: { name: string }[] }[];
};

const goals = [
  { value: "fat_loss", labelKey: "account.goalFatLoss" },
  { value: "muscle", labelKey: "account.goalMuscle" },
  { value: "recomp", labelKey: "account.goalRecomp" },
  { value: "arms", labelKey: "account.goalArms" },
  { value: "strength", labelKey: "account.goalStrength" },
] as const satisfies ReadonlyArray<{ value: Profile["goal"]; labelKey: MessageKey }>;

// The tag used to be a hardcoded "zh-CN", so plan dates, measurement dates and
// the billing period rendered in Chinese for every reader regardless of the
// language they picked. It now comes from the locale registry.
function dateText(value: string, locale: Locale) {
  return dateFormatter(locale, { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

export default function AccountDashboard() {
  const { locale, t } = useLocale();
  const localeRef = useLocaleRef();
  // A sign-in button is only honest when signing in is configured.
  const accountsConfigured = Boolean(useCapabilities().capabilities?.accounts);
  const [data, setData] = useState<AccountData | null>(null);
  const [todaySession, setTodaySession] = useState<{ dayIndex: number; workout: CoachPlan["schedule"][number] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedOut, setSignedOut] = useState(false);
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [savingProfile, setSavingProfile] = useState(false);
  const [measurement, setMeasurement] = useState({ weightKg: "", bodyFatPct: "", waistCm: "", armCm: "", note: "" });
  const [savingMeasurement, setSavingMeasurement] = useState(false);
  const [catalogConfigured, setCatalogConfigured] = useState(false);
  const [feedback, setFeedback] = useState({ durationMinutes: 45, rpe: 7, pain: false, notes: "" });
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [notice, setNotice] = useState("");

  const loadAccount = async () => {
    setLoading(true);
    const [response, catalogResponse, todayResponse] = await Promise.all([
      fetch("/api/v1/me", { cache: "no-store" }).catch(() => null),
      fetch("/api/v1/billing/catalog", { cache: "no-store" }).catch(() => null),
      fetch("/api/v1/coach/home", { cache: "no-store" }).catch(() => null),
    ]);
    if (todayResponse?.ok) {
      const home = await todayResponse.json().catch(() => null) as { today?: { dayIndex: number; workout: CoachPlan["schedule"][number] } | null } | null;
      setTodaySession(home?.today ?? null);
    }
    if (catalogResponse?.ok) {
      const catalog = await catalogResponse.json().catch(() => null) as { configured?: boolean } | null;
      setCatalogConfigured(Boolean(catalog?.configured));
    }
    if (!response?.ok) {
      setSignedOut(true);
      setData(null);
      setLoading(false);
      return;
    }
    const account = await response.json() as AccountData;
    setData(account);
    if (account.profile) setProfile(account.profile);
    setSignedOut(false);
    setLoading(false);
  };

  useEffect(() => {
    const task = window.setTimeout(() => void loadAccount(), 0);
    return () => window.clearTimeout(task);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const today = todaySession?.dayIndex ?? (new Date().getDay() + 6) % 7;
  const todayPlan = todaySession?.workout ?? null;
  const weightChange = useMemo(() => {
    const values = (data?.measurements || []).filter((item) => item.weightKg !== null);
    if (values.length < 2) return null;
    return Number(((values[0].weightKg || 0) - (values[values.length - 1].weightKg || 0)).toFixed(1));
  }, [data?.measurements]);

  const saveProfile = async () => {
    setSavingProfile(true);
    const response = await fetch("/api/v1/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile }),
    });
    setSavingProfile(false);
    if (!response.ok) {
      setNotice(localizeApiError(await response.json().catch(() => null) as ApiErrorBody | null, locale, t("account.profileSaveFailed")));
      return;
    }
    setNotice(t("account.profileSaved"));
    await loadAccount();
  };

  const addMeasurement = async () => {
    setSavingMeasurement(true);
    const response = await fetch("/api/v1/measurements", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...measurement, measuredAt: new Date().toISOString() }),
    });
    setSavingMeasurement(false);
    if (!response.ok) {
      setNotice(localizeApiError(await response.json().catch(() => null) as ApiErrorBody | null, locale, t("account.measurementSaveFailed")));
      return;
    }
    setMeasurement({ weightKg: "", bodyFatPct: "", waistCm: "", armCm: "", note: "" });
    setNotice(t("account.measurementSaved"));
    await loadAccount();
  };

  const removeAccount = async () => {
    const phrase = window.prompt(t("account.deletePrompt"));
    if (phrase !== "DELETE") { if (phrase !== null) setNotice(t("account.deleteMismatch")); return; }
    const response = await fetch("/api/v1/me", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: "DELETE" }) });
    if (response.ok) window.location.assign("/");
    else setNotice(t("account.deleteFailed"));
  };

  const saveFeedback = async () => {
    if (!data?.latestPlan?.id) return setNotice(t("account.feedbackNoPlan"));
    setSavingFeedback(true);
    const response = await fetch(`/api/v1/workouts/${encodeURIComponent(data.latestPlan.id)}/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dayIndex: today, ...feedback }),
    });
    setSavingFeedback(false);
    if (!response.ok) return setNotice(localizeApiError(await response.json().catch(() => null) as ApiErrorBody | null, locale, t("account.feedbackSaveFailed")));
    setNotice(t("account.feedbackSaved"));
    await loadAccount();
  };

  const openBillingPortal = async () => {
    const response = await fetch("/api/v1/billing/portal", { method: "POST" });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.url) return setNotice(localizeApiError(body as ApiErrorBody | null, locale, t("account.billingPortalFailed")));
    window.location.assign(body.url);
  };

  const redeem = async (reward: "meal_scan" | "plan_refresh") => {
    const response = await fetch("/api/v1/points/redeem", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reward }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) return setNotice(localizeApiError(body as ApiErrorBody | null, locale, t("account.redeemFailed")));
    setNotice(reward === "meal_scan" ? t("account.redeemedMealScan") : t("account.redeemedPlanRefresh"));
    await loadAccount();
  };

  if (loading) {
    return <ProductShell active="/account" title={t("account.title")} eyebrow="CMINE FIT"><div className="account-loading" role="status"><BrandMark /><p>{t("account.loading")}</p></div></ProductShell>;
  }

  if (signedOut || !data) {
    return <ProductShell active="/account" title={t("account.title")} eyebrow="CMINE FIT">
      <section className="account-signin">
        <BrandMark size={44} /><span>{t("refresh.home.accountLabel")}</span>
        <h1>{t("account.signinTitleA")}<br />{t("account.signinTitleB")}</h1>
        <p>{t("account.signinText")}</p>
        {/* Only offered when signing in can actually happen. On a deployment
            with no Cmine ID this used to be a button whose only outcome was an
            error toast; the core training path needs no account, so the honest
            answer is to say so and point at it. */}
        {accountsConfigured
          ? <button onClick={() => void beginCmineLogin("/account", localeRef.current)}><b>C</b> {t("account.signinButton")} </button>
          : <p className="account-signin-unavailable">{t("product.entry.accountOnlyUnavailable")}</p>}
        <Link href={accountsConfigured ? "/" : "/plan"}>{accountsConfigured ? t("account.signinBackHome") : t("product.entry.backToPlan")}</Link>
      </section>
    </ProductShell>;
  }

  return <ProductShell active="/account" title={t("account.title")} eyebrow={data.user.email || "CMINE FIT"}
    action={<button className="header-chip" onClick={async () => { await signOutCmine(); window.location.assign("/"); }}>{t("account.signOut")}</button>}>
    <section className="account-content">
      <nav className="account-section-nav" aria-label={t("account.title")}>
        <a href="#plans">{t("account.planHistory")}</a><a href="#profile">{t("account.trainingProfile")}</a>
        <a href="#progress">{t("account.bodyProgress")}</a><Link href="/coach/memory">{t("product.design.preferences")}</Link>
        <a href="#notifications">{t("account.notificationsTitle")}</a><a href="#habit">{t("account.habitTitle")}</a>
        <a href="#membership">{t("account.membership")}</a><a href="#account">{t("account.accountAndData")}</a>
      </nav>

      <section className="account-hero" id="today">
        <div>
          {/* A stand-in *name* has to describe the reader in the third person,
              which is not what "Welcome back, …" is addressing — so the no-name
              case is its own complete greeting. */}
          <span>{data.user.name?.split(" ")[0]
            ? t("account.welcomeBack", { name: data.user.name.split(" ")[0] })
            : t("account.welcomeBackNoName")}</span>
          <h2>{todayPlan?.restDay ? t("account.heroRestTitle") : todayPlan ? (pick(todayPlan.title, locale) || t("account.planFallbackTitle")) : t("account.heroNoPlanTitle")}</h2>
          {/* A plan that exists but carries no focus must not fall back to the
              no-plan line, which would be untrue for someone who has one. */}
          <p>{todayPlan ? (pick(todayPlan.focus, locale) || t("account.heroFocusFallback")) : t("account.heroNoPlanFocus")}</p>
          {data.latestPlan ? <Link href="/today">{t("account.heroViewToday")}</Link> : <Link href="/onboarding">{t("account.createFirstPlan")}</Link>}
        </div>
        <article>
          <small>TODAY</small>
          <b>{todayPlan?.restDay ? t("account.restDay") : todayPlan ? `${todayPlan.duration} min` : "—"}</b>
          <span>{todayPlan?.restDay ? t("account.restDayFocus") : t.plural("account.exerciseCount", todayPlan?.exercises.length || 0)}</span>
        </article>
      </section>

      <div className="account-metrics">
        <article><span>{t("account.metricWorkouts")}</span><b>{data.progress.completedWorkouts}</b><small>{t("account.metricWorkoutsHint")}</small></article>
        <article><span>{t("account.metricExercises")}</span><b>{data.progress.completedExercises}</b><small>{t("account.metricExercisesHint")}</small></article>
        <article><span>{t("account.metricMeasurements")}</span><b>{data.measurements.length}</b><small>{t("account.metricMeasurementsHint")}</small></article>
        <article><span>{t("account.metricIntake")}</span><b>{data.nutritionToday.calories}</b><small>{t("account.metricProtein", { grams: data.nutritionToday.proteinG })}</small></article>
      </div>

      <section className="account-panel workout-feedback-panel" id="feedback">
        <div className="account-section-title"><div><h2>{t("account.feedbackTitle")}</h2></div><p>{t("account.feedbackIntro")}</p></div>
        <div className="feedback-grid">
          <label><span>{t("account.feedbackDuration")}</span><div><input type="number" min="1" max="240" value={feedback.durationMinutes} onChange={(event) => setFeedback({ ...feedback, durationMinutes: Number(event.target.value) })} /><em>min</em></div></label>
          <label><span>{t("account.feedbackRpe")}</span><input type="range" min="1" max="10" value={feedback.rpe} onChange={(event) => setFeedback({ ...feedback, rpe: Number(event.target.value) })} /><b>{feedback.rpe}/10</b></label>
          <label className="feedback-pain"><input type="checkbox" checked={feedback.pain} onChange={(event) => setFeedback({ ...feedback, pain: event.target.checked })} /><span>{t("account.feedbackPain")}</span></label>
          <label className="feedback-notes"><span>{t("account.notes")}</span><input value={feedback.notes} maxLength={500} onChange={(event) => setFeedback({ ...feedback, notes: event.target.value })} placeholder={t("account.feedbackNotesPlaceholder")} /></label>
          <button onClick={() => void saveFeedback()} disabled={savingFeedback || !data.latestPlan}>{savingFeedback ? t("account.saving") : `${t("account.saveFeedback")} `}</button>
        </div>
      </section>

      <section className="account-panel" id="plans">
        <div className="account-section-title"><div><h2>{t("account.planHistory")}</h2></div><p>{t("account.planHistoryIntro")}</p></div>
        {data.plans.length ? <div className="plan-history">
          {data.plans.map((item, index) => {
            const insights = readPlanInsights(item.plan?.insights, locale);
            const summary = insights?.contentLocale === locale ? insights.summary : null;
            return <article key={item.id}>
            <div><span>{String(data.plans.length - index).padStart(2, "0")}</span><small>{dateText(item.createdAt, locale)}</small></div>
            <h3>{pick(item.plan?.schedule.find((day) => !day.restDay)?.title, locale) || t("account.planFallbackTitle")}</h3>
            <p>{summary || t("account.planSummaryFallback", { days: item.profile?.days || "—", calories: item.plan?.calories || "—" })}</p>
            <footer><span>{item.model}</span><b>{t.plural("account.planWeeks", item.plan?.weeks || 0)}</b></footer>
          </article>; })}
        </div> : <div className="account-empty"><p>{t("account.planHistoryEmpty")}</p><Link href="/#coach">{t("account.createFirstPlan")} </Link></div>}
      </section>

      <section className="account-panel" id="progress">
        <div className="account-section-title"><div><h2>{t("account.bodyProgress")}</h2></div><p>{t("account.progressIntro")}</p></div>
        <div className="progress-layout">
          <div className="measurement-form">
            <h3>{t("account.measurementFormTitle")}</h3>
            <div>
              <label><span>{t("account.measureWeight")}</span><div><input type="number" min="35" max="250" step="0.1" value={measurement.weightKg} onChange={(event) => setMeasurement({ ...measurement, weightKg: event.target.value })} /><em>kg</em></div></label>
              <label><span>{t("account.measureBodyFat")}</span><div><input type="number" min="2" max="70" step="0.1" value={measurement.bodyFatPct} onChange={(event) => setMeasurement({ ...measurement, bodyFatPct: event.target.value })} /><em>%</em></div></label>
              <label><span>{t("account.measureWaist")}</span><div><input type="number" min="40" max="220" step="0.1" value={measurement.waistCm} onChange={(event) => setMeasurement({ ...measurement, waistCm: event.target.value })} /><em>cm</em></div></label>
              <label><span>{t("account.measureArm")}</span><div><input type="number" min="15" max="80" step="0.1" value={measurement.armCm} onChange={(event) => setMeasurement({ ...measurement, armCm: event.target.value })} /><em>cm</em></div></label>
            </div>
            <label className="measurement-note"><span>{t("account.notes")}</span><input value={measurement.note} onChange={(event) => setMeasurement({ ...measurement, note: event.target.value })} placeholder={t("account.measurementNotePlaceholder")} /></label>
            <button onClick={() => void addMeasurement()} disabled={savingMeasurement}>{savingMeasurement ? t("account.saving") : `${t("account.saveMeasurement")} `}</button>
          </div>
          <div className="progress-records">
            <div className="progress-summary"><span>{t("account.weightTrend")}</span><b>{weightChange === null ? t("account.weightTrendPending") : `${weightChange > 0 ? "+" : ""}${weightChange} kg`}</b></div>
            {data.measurements.length ? data.measurements.slice(0, 8).map((item) => <article key={item.id}>
              <time>{dateText(item.measuredAt, locale)}</time>
              <div>{item.weightKg !== null && <span><b>{item.weightKg}</b> kg</span>}{item.waistCm !== null && <span><b>{item.waistCm}</b> {t("account.measureWaist")}</span>}{item.armCm !== null && <span><b>{item.armCm}</b> {t("account.measureArm")}</span>}{item.bodyFatPct !== null && <span><b>{item.bodyFatPct}%</b> {t("account.measureBodyFat")}</span>}</div>
              {item.note && <p>{item.note}</p>}
            </article>) : <div className="account-empty"><p>{t("account.measurementsEmpty")}</p></div>}
          </div>
        </div>
      </section>

      <section className="account-panel" id="profile">
        <div className="account-section-title"><div><h2>{t("account.trainingProfile")}</h2></div><p>{t("account.profileIntro")}</p></div>
        <div className="profile-editor">
          <label><span>{t("account.profileSex")}</span><select value={profile.sex} onChange={(event) => setProfile({ ...profile, sex: event.target.value as Profile["sex"] })}><option value="female">{t("account.sexFemale")}</option><option value="male">{t("account.sexMale")}</option></select></label>
          <label><span>{t("account.profileAge")}</span><input type="number" value={profile.age} onChange={(event) => setProfile({ ...profile, age: Number(event.target.value) })} /></label>
          <label><span>{t("account.profileHeight")}</span><input type="number" value={profile.height} onChange={(event) => setProfile({ ...profile, height: Number(event.target.value) })} /></label>
          <label><span>{t("account.profileWeight")}</span><input type="number" value={profile.weight} onChange={(event) => setProfile({ ...profile, weight: Number(event.target.value) })} /></label>
          <label><span>{t("account.profileTargetWeight")}</span><input type="number" value={profile.targetWeight} onChange={(event) => setProfile({ ...profile, targetWeight: Number(event.target.value) })} /></label>
          <label><span>{t("account.profileGoal")}</span><select value={profile.goal} onChange={(event) => setProfile({ ...profile, goal: event.target.value as Profile["goal"] })}>{goals.map((goal) => <option key={goal.value} value={goal.value}>{t(goal.labelKey)}</option>)}</select></label>
          <label><span>{t("account.profileActivity")}</span><select value={profile.activity} onChange={(event) => setProfile({ ...profile, activity: event.target.value as Profile["activity"] })}><option value="sedentary">{t("account.activitySedentary")}</option><option value="light">{t("account.activityLight")}</option><option value="moderate">{t("account.activityModerate")}</option><option value="active">{t("account.activityActive")}</option></select></label>
          <label><span>{t("account.profileExperience")}</span><select value={profile.experience} onChange={(event) => setProfile({ ...profile, experience: event.target.value as Profile["experience"] })}><option value="beginner">{t("account.experienceBeginner")}</option><option value="intermediate">{t("account.experienceIntermediate")}</option><option value="advanced">{t("account.experienceAdvanced")}</option></select></label>
          <label><span>{t("account.profileEquipment")}</span><select value={profile.equipment} onChange={(event) => setProfile({ ...profile, equipment: event.target.value as Profile["equipment"] })}><option value="bodyweight">{t("account.equipmentBodyweight")}</option><option value="dumbbell">{t("account.equipmentDumbbell")}</option><option value="gym">{t("account.equipmentGym")}</option></select></label>
          <label><span>{t("account.profileDays")}</span><select value={profile.days} onChange={(event) => setProfile({ ...profile, days: Number(event.target.value) })}>{[2, 3, 4, 5, 6].map((day) => <option key={day} value={day}>{t("account.daysOption", { count: day })}</option>)}</select></label>
          <label><span>{t("account.profileSessionMinutes")}</span><input type="number" min="20" max="180" value={profile.sessionMinutes || 50} onChange={(event) => setProfile({ ...profile, sessionMinutes: Number(event.target.value) })} /></label>
          <label><span>{t("account.profileLocation")}</span><select value={profile.trainingLocation || "mixed"} onChange={(event) => setProfile({ ...profile, trainingLocation: event.target.value as NonNullable<Profile["trainingLocation"]> })}><option value="home">{t("account.locationHome")}</option><option value="gym">{t("account.locationGym")}</option><option value="outdoors">{t("account.locationOutdoors")}</option><option value="mixed">{t("account.locationMixed")}</option></select></label>
          <label><span>{t("account.profileDiet")}</span><select value={profile.dietaryPreference || "balanced"} onChange={(event) => setProfile({ ...profile, dietaryPreference: event.target.value as NonNullable<Profile["dietaryPreference"]> })}><option value="balanced">{t("account.dietBalanced")}</option><option value="vegetarian">{t("account.dietVegetarian")}</option><option value="high_protein">{t("account.dietHighProtein")}</option><option value="none">{t("account.dietNone")}</option></select></label>
          <label><span>{t("account.profileExclusions")}</span><input value={profile.exclusions || ""} onChange={(event) => setProfile({ ...profile, exclusions: event.target.value })} placeholder={t("account.optionalPlaceholder")} /></label>
          <label className="profile-limitations"><span>{t("account.profileLimitations")}</span><input value={profile.limitations} onChange={(event) => setProfile({ ...profile, limitations: event.target.value })} placeholder={t("account.optionalPlaceholder")} /></label>
          <button onClick={() => void saveProfile()} disabled={savingProfile}>{savingProfile ? t("account.saving") : `${t("account.saveProfile")} `}</button>
        </div>
      </section>

      <section className="account-panel membership-panel" id="membership">
        <div className="account-section-title"><div><h2>{t("account.membership")}</h2></div><p>{t("account.membershipIntro")}</p></div>
        <div className="membership-current">
          <div><span>{t("account.currentPlan")}</span><h3>{data.product.membership.name}</h3><p>
            {/* Two independent counts cannot share one plural form, so each is
                its own counted phrase and the join happens here. */}
            {`${t.plural("account.quotaRemaining.plans", data.product.usage.capabilities["plan.generate"]?.remaining ?? 0)} · ${t.plural("account.quotaRemaining.scans", data.product.usage.capabilities["meal.scan"]?.remaining ?? 0)}`}
            {data.product.membership.currentPeriodEnd && ` · ${data.product.membership.cancelAtPeriodEnd
              ? t("account.periodEnds", { date: dateText(data.product.membership.currentPeriodEnd, locale) })
              : t("account.periodRenews", { date: dateText(data.product.membership.currentPeriodEnd, locale) })}`}
          </p></div>
          <b>{data.product.membership.status.toUpperCase()}</b>
        </div>
        {data.product.membership.tier === "pro" ? <div className="membership-preview">
          <div><span>CMINE FIT PRO</span><h3>{data.product.membership.status === "trial" ? t("account.proTrialHeadline") : t("account.proActiveHeadline")}</h3><p>{t("account.proBody")}</p></div>
          <ul>
            <li>{t("account.proPlanQuota", { count: data.product.usage.capabilities["plan.generate"]?.limit ?? "—" })}</li>
            <li>{t("account.proScanQuota", { count: data.product.usage.capabilities["meal.scan"]?.limit ?? "—" })}</li>
            <li>{t("account.proCoachQuota", { count: data.product.usage.capabilities["coach.chat"]?.limit ?? "—" })}</li>
            <li>{t("account.proReviewFeature")}</li>
          </ul>
          <div className="membership-price"><small>{t("account.subscriptionManage")}</small><b>PRO</b><span>{data.product.membership.status === "trial" ? t("account.trialBillingNote") : t("account.stripeBillingNote")}</span>{catalogConfigured && (data.product.membership.status === "trial" ? <Link href="/pricing">{t("account.viewSubscription")} </Link> : <button onClick={() => void openBillingPortal()}>{t("account.manageSubscription")} </button>)}</div>
        </div> : <div className="membership-preview">
          <div><span>CMINE FIT PRO</span><h3>{t("account.freeHeadline")}</h3><p>{t("account.freeBody")}</p></div>
          <ul><li>{t("account.freeFeatureAdopt")}</li><li>{t("account.freeFeatureAdapt")}</li><li>{t("account.freeFeatureQuota")}</li><li>{t("account.freeFeatureTrends")}</li></ul>
          <div className="membership-price"><small>{t("account.planPriceLabel")}</small><b>{t("account.planPriceValue")}</b><span>{t("account.planPriceNote")}</span>{catalogConfigured && <Link href="/pricing">{t("account.choosePro")} </Link>}</div>
        </div>}
        <div className="points-redemption">
          <div><span>{t("account.pointsBalance")}</span><b>{data.points}</b><small>{t("account.pointsHint")}</small></div>
          <button disabled={data.points < 50} onClick={() => void redeem("meal_scan")}>{t("account.redeemMealScan")}</button>
          <button disabled={data.points < 100} onClick={() => void redeem("plan_refresh")}>{t("account.redeemPlanRefresh")}</button>
        </div>
      </section>

      <HabitCommitmentCard />
      <NotificationPreferencesCard />

      {/* Read-only by design. anyBite has planning documents and no deployed
          service, so a toggle here would be a control that cannot do anything —
          see docs/adr/0002. The adapter reports `unsupported`; this renders it. */}
      <section className="account-panel account-integrations-panel" id="integrations">
        <div className="account-section-title"><div><h2>{t("product.integrations.title")}</h2></div><p>{t("product.integrations.intro")}</p></div>
        <article className="integration-row">
          <div><h3>{t("product.integrations.anybiteName")}</h3><p>{t("product.integrations.anybiteBody")}</p></div>
          <span className="integration-status">{t("product.integrations.statusUnsupported")}</span>
        </article>
      </section>

      <section className="account-panel account-data-panel" id="account">
        <div className="account-section-title"><div><h2>{t("account.accountAndData")}</h2></div><p>{t("account.accountDataIntro")}</p></div>
        <div className="account-data-actions">
          <article><div><h3>{t("account.exportTitle")}</h3><p>{t("account.exportBody")}</p></div><a href="/api/v1/export">{t("account.exportStart")} </a></article>
          <article className="danger"><div><h3>{t("account.deleteTitle")}</h3><p>{t("account.deleteBody")}</p></div><button onClick={() => void removeAccount()}>{t("account.deleteAction")}</button></article>
        </div>
      </section>

      <footer className="account-footer"><span>{t("account.footerTagline")}</span><p>{t("account.footerDisclaimer")}</p></footer>
    </section>
    {notice && <div className="toast account-toast">{notice}</div>}
  </ProductShell>;
}

type NotificationPreferences = { training: boolean; coach: boolean; reviews: boolean; nutrition: boolean; billing: boolean; quietStart: string; quietEnd: string };

const NOTIFICATION_ROWS = [
  { key: "training", labelKey: "account.notifyTraining", hintKey: "account.notifyTrainingHint" },
  { key: "reviews", labelKey: "account.notifyReviews", hintKey: "account.notifyReviewsHint" },
  { key: "coach", labelKey: "account.notifyCoach", hintKey: "account.notifyCoachHint" },
  { key: "nutrition", labelKey: "account.notifyNutrition", hintKey: "account.notifyNutritionHint" },
  { key: "billing", labelKey: "account.notifyBilling", hintKey: "account.notifyBillingHint" },
] as const satisfies ReadonlyArray<{ key: keyof NotificationPreferences; labelKey: MessageKey; hintKey: MessageKey }>;

// The API and the scheduler have honored these settings since push shipped;
// this card is the missing entry point.
function NotificationPreferencesCard() {
  const t = useT();
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    void fetch("/api/v1/notification-preferences", { cache: "no-store" }).then((response) => response.ok ? response.json() : null)
      .then((body: { preferences?: Record<string, unknown> } | null) => {
        const stored = body?.preferences;
        if (!stored) return;
        setPreferences({
          training: stored.training !== 0 && stored.training !== false,
          coach: stored.coach !== 0 && stored.coach !== false,
          reviews: stored.reviews !== 0 && stored.reviews !== false,
          nutrition: stored.nutrition === 1 || stored.nutrition === true,
          billing: stored.billing !== 0 && stored.billing !== false,
          quietStart: String(stored.quiet_start || "22:00"),
          quietEnd: String(stored.quiet_end || "08:00"),
        });
      }).catch(() => undefined);
  }, []);
  const save = async (next: NotificationPreferences) => {
    setPreferences(next);
    const response = await fetch("/api/v1/notification-preferences", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(next) });
    setMessage(response.ok ? t("account.notificationsSaved") : t("account.notificationsSaveFailed"));
  };
  if (!preferences) return null;
  return <section className="account-panel" id="notifications">
    <div className="account-section-title"><div><h2>{t("account.notificationsTitle")}</h2></div><p>{t("account.notificationsIntro")}</p></div>
    <div className="account-data-actions">
      <article>
        <div>
          <h3>{t("account.pushTypes")}</h3>
          {NOTIFICATION_ROWS.map((row) => <p key={row.key}>
            <label>
              <input type="checkbox" checked={Boolean(preferences[row.key])} onChange={(event) => void save({ ...preferences, [row.key]: event.target.checked })} />
              {" "}{t(row.labelKey)}
            </label>
            <small> — {t(row.hintKey)}</small>
          </p>)}
        </div>
      </article>
      <article>
        <div>
          <h3>{t("account.quietHours")}</h3>
          <p>
            <label>{t("account.quietFrom")} <input type="time" value={preferences.quietStart} onChange={(event) => setPreferences({ ...preferences, quietStart: event.target.value })} /></label>
            {" "}
            <label>{t("account.quietTo")} <input type="time" value={preferences.quietEnd} onChange={(event) => setPreferences({ ...preferences, quietEnd: event.target.value })} /></label>
          </p>
          <p>{t("account.quietHoursNote")}</p>
          {message && <p>{message}</p>}
        </div>
        <button onClick={() => void save(preferences)}>{t("account.quietHoursSave")}</button>
      </article>
    </div>
  </section>;
}

type HabitData = {
  streak: { currentWeeks: number; longestWeeks: number; activeThisWeek: boolean; sessionsThisWeek: number };
  totalSessions: number;
  commitment: { cueTime: string; cuePlace: string | null } | null;
  // The endpoint returns every milestone in both languages; the type used to
  // declare only `zh`, which is why the card rendered Chinese to everyone.
  milestones: Array<{ kind: string; title: Localized; message: Localized; achievedAt: string }>;
};

// Implementation intention: committing to a concrete time and place roughly
// doubles follow-through versus a vague "I'll train more" — and the committed
// cue time is exactly when the training reminder fires.
function HabitCommitmentCard() {
  const { locale, t } = useLocale();
  const [habit, setHabit] = useState<HabitData | null>(null);
  const [cueTime, setCueTime] = useState("18:00");
  const [cuePlace, setCuePlace] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    void fetch("/api/v1/habits", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data: HabitData | null) => {
      if (!data) return;
      setHabit(data);
      if (data.commitment) { setCueTime(data.commitment.cueTime); setCuePlace(data.commitment.cuePlace || ""); }
    }).catch(() => undefined);
  }, []);
  const save = async () => {
    const response = await fetch("/api/v1/habits/commitment", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ cueTime, cuePlace }) });
    const body = await response.json().catch(() => ({})) as { message?: string };
    setMessage(response.ok ? t("account.habitSaved") : localizeApiError(body as ApiErrorBody | null, locale, t("account.habitSaveFailed")));
  };
  return <section className="account-panel" id="habit">
    <div className="account-section-title"><div><h2>{t("account.habitTitle")}</h2></div><p>{t("account.habitIntro")}</p></div>
    <div className="account-data-actions">
      <article>
        <div>
          <h3>{t("account.habitCommitmentTitle")}</h3>
          <p>
            <label>{t("account.habitTime")} <input type="time" value={cueTime} onChange={(event) => setCueTime(event.target.value)} /></label>
            {" "}
            <label>{t("account.habitPlace")} <input type="text" maxLength={60} placeholder={t("account.habitPlacePlaceholder")} value={cuePlace} onChange={(event) => setCuePlace(event.target.value)} /></label>
          </p>
          {message && <p>{message}</p>}
        </div>
        <button onClick={() => void save()}>{t("account.habitSave")}</button>
      </article>
      {habit && <article>
        <div>
          <h3>{habit.streak.currentWeeks > 0 ? t("account.habitStreakWeeks", { weeks: habit.streak.currentWeeks }) : t("account.habitFirstWeek")}</h3>
          {/* One complete sentence per case, rather than three fragments joined:
              the English pieces began with a bare period, and clause order is
              not something a language is obliged to share. */}
          <p>{t(habit.streak.activeThisWeek ? "account.habitStatsOnTrack" : "account.habitStats", {
            weeks: t.plural("account.habitLongestWeeks", habit.streak.longestWeeks),
            sessions: t.plural("account.habitTotalSessions", habit.totalSessions),
          })}</p>
          {habit.milestones.length > 0 && <p>{pick(habit.milestones.at(-1)!.title, locale) || t("account.milestoneFallbackTitle")} — {pick(habit.milestones.at(-1)!.message, locale) || t("account.milestoneFallbackMessage")}</p>}
        </div>
      </article>}
    </div>
  </section>;
}
