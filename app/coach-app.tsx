/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import { defaultProfile, generatePlan, type Activity, type CoachPlan, type Equipment, type Experience, type Goal, type Profile, type TrainingTrack } from "./lib/coach";
import { AUTH_PROVIDERS, beginCmineLogin, getCmineSession, type CmineUser } from "./lib/auth";
import { copy, languageOptions, type DisplayLanguage, type Locale } from "./lib/i18n";

const goalOptions: { value: Goal; zh: string; en: string }[] = [
  { value: "arms", zh: "手臂线条", en: "Defined arms" },
  { value: "fat_loss", zh: "减脂", en: "Fat loss" },
  { value: "muscle", zh: "增肌", en: "Build muscle" },
  { value: "recomp", zh: "塑形", en: "Recomposition" },
  { value: "strength", zh: "提升力量", en: "Strength" },
];
const dayNames = { zh: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"], en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] };

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="field-label">{children}</span>;
}

export default function CoachApp() {
  const [locale, setLocale] = useState<Locale>("zh");
  const lang: DisplayLanguage = locale === "zh" ? "zh" : "en";
  const t = copy[lang];
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [plan, setPlan] = useState<CoachPlan>(() => generatePlan(defaultProfile));
  const [generating, setGenerating] = useState(false);
  const [planReady, setPlanReady] = useState(false);
  const [anonymousPreview, setAnonymousPreview] = useState(false);
  const [planId, setPlanId] = useState<string | null>(null);
  const [planStatus, setPlanStatus] = useState<"active" | "draft">("active");
  const [services, setServices] = useState({ ai: false, rewardAds: false });
  const [announcement, setAnnouncement] = useState("");
  const [activeDay, setActiveDay] = useState(0);
  const [accepted, setAccepted] = useState<boolean | null>(null);
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
  const planRef = useRef<HTMLElement>(null);

  useEffect(() => {
    queueMicrotask(() => {
      setAccepted(localStorage.getItem("cmine_fit_disclaimer_health_v2") === "accepted");
      void getCmineSession().then(async (session) => {
        setUser(session.user);
        setPoints(session.points);
        if (!session.user) return;
        const response = await fetch("/api/v1/me", { cache: "no-store" }).catch(() => null);
        if (!response?.ok) return;
        const account = await response.json() as {
          profile?: Profile | null;
          latestPlan?: { id: string; profile: Profile | null; plan: CoachPlan | null } | null;
        };
        if (account.profile) setProfile(account.profile);
        if (account.latestPlan?.plan) {
          setPlan(account.latestPlan.plan);
          setPlanId(account.latestPlan.id);
          setPlanStatus("active");
          setPlanReady(true);
          const today = (new Date().getDay() + 6) % 7;
          setActiveDay(account.latestPlan.plan.schedule[today]?.restDay
            ? Math.max(0, account.latestPlan.plan.schedule.findIndex((day) => !day.restDay))
            : today);
        } else if (account.profile) {
          setPlan(generatePlan(account.profile));
        }
      });
      void fetch("/api/health", { cache: "no-store" }).then((response) => response.json()).then((status: { llm?: boolean; rewardAds?: boolean }) => setServices({ ai: Boolean(status.llm), rewardAds: Boolean(status.rewardAds) })).catch(() => undefined);
      void fetch("/api/v1/site", { cache: "no-store" }).then((response) => response.json()).then((site: { announcement?: string }) => setAnnouncement(site.announcement || "")).catch(() => undefined);
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
    setPlanId(null);
    setCompleted(new Set());
  };
  const selectTrack = (track: TrainingTrack) => {
    const next: Profile = track === "intermediate_hypertrophy"
      ? { ...profile, trainingTrack: track, goal: "muscle", experience: "intermediate", days: Math.max(3, profile.days), sessionMinutes: Math.max(45, Number(profile.sessionMinutes || 45)), equipment: profile.equipment === "bodyweight" ? "dumbbell" : profile.equipment }
      : { ...profile, trainingTrack: "beginner_fat_loss", goal: "fat_loss", experience: "beginner", days: Math.min(4, profile.days), sessionMinutes: [20, 30, 45].includes(Number(profile.sessionMinutes)) ? profile.sessionMinutes : 30 };
    setProfile(next); setPlan(generatePlan(next)); setPlanReady(false); setPlanId(null); setCompleted(new Set());
  };
  const buildPlan = async () => {
    if (!user) {
      sessionStorage.setItem("cmine_fit_intake_draft", JSON.stringify(profile));
      setPlan(generatePlan(profile));
      setAnonymousPreview(true);
      setToast(lang === "zh" ? "已生成不消耗 AI 的个性化预览；登录后解锁完整计划" : "Your private rules-based preview is ready; sign in to unlock the full plan");
      return;
    }
    setGenerating(true);
    let revealPlan = false;
    try {
      const response = await fetch("/api/plans", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile, consent: accepted === true }) });
      const result = await response.json() as { plan?: CoachPlan; planId?: string | null; planStatus?: "active" | "draft"; source?: "llm"; message?: string };
      if (response.ok && result.plan) {
        setPlan(result.plan);
        setPlanId(result.planId || null);
        setPlanStatus(result.planStatus || "active");
        setCompleted(new Set());
        setPlanReady(true);
        revealPlan = true;
        const firstTrainingDay = result.plan.schedule.findIndex((day) => !day.restDay);
        setActiveDay(Math.max(0, firstTrainingDay));
        setToast(result.planStatus === "draft" ? (lang === "zh" ? "新计划已生成草案；确认后才会替换当前计划" : "Your new plan is a draft until you confirm it") : (lang === "zh" ? "AI 已完成个性化计划，并通过规则校验" : "Your AI plan passed the safety checks"));
      } else {
        setPlanReady(false);
        setToast(result.message || (lang === "zh" ? "AI 教练暂时离线，计划没有生成，请稍后重试" : "The AI coach is temporarily offline; please try again"));
      }
    } catch {
      setPlanReady(false);
      setToast(lang === "zh" ? "无法连接 AI 教练，计划没有生成，请稍后重试" : "Could not reach the AI coach; please try again");
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
      if (!response.ok) { setToast(result.message || (lang === "zh" ? "训练记录同步失败，请重试" : "Could not sync this completion")); return; }
      if (typeof result.points === "number") setPoints(result.points);
    }
    setCompleted((current) => new Set(current).add(key));
  };
  const activateDraft = async () => {
    if (!planId) return;
    const response = await fetch(`/api/v1/plans/${encodeURIComponent(planId)}/activate`, { method: "POST" });
    if (!response.ok) { setToast(lang === "zh" ? "计划草案启用失败，请重试" : "Could not activate this plan"); return; }
    setPlanStatus("active"); setToast(lang === "zh" ? "新计划已经启用，旧版本仍保留在历史中" : "The new plan is active; the previous version remains in history");
  };
  const signIn = async (resumeIntake = false) => {
    const result = await beginCmineLogin(resumeIntake ? "/onboarding?resume=intake" : "/");
    if (!result.ok) { setLoginOpen(false); setToast(result.message || "登录暂不可用。"); }
  };
  const currentDay = plan.schedule[activeDay] || plan.schedule[0];
  const goalLabel = goalOptions.find((goal) => goal.value === profile.goal)?.[lang] || "";
  const coachNotes = plan.insights?.coachNotes[lang] || [t.note1, t.note2, t.note3];
  const dietGuidance = plan.insights?.dietGuidance[lang] || [t.diet1, t.diet2, t.diet3];
  const planRationale = plan.insights?.planRationale[lang] || [];

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Cmine Fit home"><span className="brand-mark">C</span><span>CMINE <b>FIT</b></span></a>
        <nav className="topnav" aria-label="Primary navigation"><a href="#coach">{t.navCoach}</a><a href="/nutrition">{lang === "zh" ? "饮食记录" : "Nutrition"}</a><a href="#editions">{t.navAbout}</a><a href="/pricing">{t.navPricing}</a><a href="/admin">{t.navAdmin}</a></nav>
        <div className="header-actions">
          <label className="language-select"><span className="sr-only">Language</span>
            <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
              {languageOptions.map((language) => <option key={language.value} value={language.value}>{language.label}</option>)}
            </select>
          </label>
          {user && services.rewardAds && <button className="points-pill" onClick={() => setAdOpen(true)} aria-label={t.watchAd}><span>◆</span> {points}</button>}
          {user ? (
            <a className="avatar-button" href="/account"><span>{(user.name || user.email || "C").slice(0, 1).toUpperCase()}</span><em>{lang === "zh" ? "我的训练" : "My training"}</em></a>
          ) : <button className="login-button" onClick={() => setLoginOpen(true)}>{t.login} <span>↗</span></button>}
        </div>
      </header>
      {announcement && <div className="site-announcement" role="status"><span>CMINE FIT</span><p>{announcement}</p></div>}

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="edition-pills"><span>{t.aspiration}</span><i>+</i><span>{t.expertPlan}</span></div>
          <p className="eyebrow"><span /> {t.eyebrow}</p>
          <h1><s>{t.titleA}</s><br /><em>{t.titleB}</em></h1>
          <p className="hero-subtitle">{t.subtitle}</p>
          <div className="trust-row">
            <div className="face-stack" aria-hidden="true"><span>J</span><span>M</span><span>A</span></div>
            <div><b>1:1</b><span>{lang === "zh" ? "贴合你" : "PERSONAL"}</span><small>{t.socialProof}</small></div>
          </div>
        </div>
        <div className="signal-card" aria-label={t.estimate}>
          <div className="signal-top"><span>{t.estimate}</span><i>{planReady ? "LLM COACHED" : services.ai ? "READY FOR AI" : "PROFILE ESTIMATE"}</i></div>
          <div className="calorie-orbit"><div><b>{plan.calories.toLocaleString()}</b><span>{t.kcal} / day</span></div></div>
          <div className="signal-stats">
            <div><b>{plan.protein}g</b><span>{t.protein}</span></div><div><b>{profile.days}×</b><span>{t.weekPlan}</span></div><div><b>{plan.weeks}</b><span>{t.daysUnit}</span></div>
          </div>
          <p><span>{planReady ? "AI" : "B"}</span>{planReady ? (lang === "zh" ? "AI 已完成动作编排、饮食建议与注意事项" : "AI completed your sessions, nutrition guidance, and coaching notes") : (lang === "zh" ? "这里先计算基础指标；完整计划只在 AI 生成成功后出现" : "Base metrics first; the full plan appears only after AI generation succeeds")}</p>
        </div>
      </section>

      <section className="coach-studio" id="coach">
        <div className="section-heading"><p>01 / INTAKE</p><div><h2>{t.profileTitle}</h2><span>{t.profileHint}</span></div></div>
        <div className="intake-grid">
          <div className="form-card">
            <div className="homepage-track-selector"><button className={profile.trainingTrack !== "intermediate_hypertrophy" ? "active" : ""} onClick={() => selectTrack("beginner_fat_loss")}><span>{lang === "zh" ? "核心路径" : "START HERE"}</span><b>{lang === "zh" ? "新手日常减脂" : "Beginner fat loss"}</b><small>{lang === "zh" ? "20–45 分钟，从坚持和日常饮食开始。" : "20–45 minute sessions built for consistency."}</small></button><button className={profile.trainingTrack === "intermediate_hypertrophy" ? "active" : ""} onClick={() => selectTrack("intermediate_hypertrophy")}><span>{lang === "zh" ? "专业路径" : "PROGRESSIVE"}</span><b>{lang === "zh" ? "中级系统增肌" : "Intermediate hypertrophy"}</b><small>{lang === "zh" ? "组次、RIR、渐进负荷与周期复盘。" : "Sets, RIR, progression and training reviews."}</small></button></div>
            <div className="form-section">
              <div className="form-section-title"><span>01</span><h3>{t.basics}</h3></div>
              <div className="segmented">
                {(["female", "male"] as const).map((sex) => <button key={sex} className={profile.sex === sex ? "active" : ""} onClick={() => patchProfile("sex", sex)}>{lang === "zh" ? (sex === "female" ? "女性" : "男性") : sex === "female" ? "Female" : "Male"}</button>)}
              </div>
              <div className="field-grid three">
                <label><FieldLabel>{lang === "zh" ? "年龄" : "Age"}</FieldLabel><span className="input-unit"><input aria-label={lang === "zh" ? "年龄" : "Age"} type="number" min="16" max="85" value={profile.age} onChange={(e) => patchProfile("age", Number(e.target.value))} /><em>{lang === "zh" ? "岁" : "yr"}</em></span></label>
                <label><FieldLabel>{lang === "zh" ? "身高" : "Height"}</FieldLabel><span className="input-unit"><input aria-label={lang === "zh" ? "身高" : "Height"} type="number" min="130" max="220" value={profile.height} onChange={(e) => patchProfile("height", Number(e.target.value))} /><em>cm</em></span></label>
                <label><FieldLabel>{lang === "zh" ? "体重" : "Weight"}</FieldLabel><span className="input-unit"><input aria-label={lang === "zh" ? "体重" : "Weight"} type="number" min="35" max="250" value={profile.weight} onChange={(e) => patchProfile("weight", Number(e.target.value))} /><em>kg</em></span></label>
              </div>
            </div>
            <div className="form-section">
              <div className="form-section-title"><span>02</span><h3>{t.goal}</h3></div>
              <div className="goal-grid">
                {goalOptions.map((goal) => <button key={goal.value} className={profile.goal === goal.value ? "active" : ""} onClick={() => patchProfile("goal", goal.value)}><span>{goal.value === "arms" ? "◎" : goal.value === "fat_loss" ? "↘" : goal.value === "muscle" ? "＋" : goal.value === "recomp" ? "◇" : "↑"}</span>{goal[lang]}</button>)}
              </div>
              {profile.trainingTrack === "intermediate_hypertrophy" ? <div className="track-detail-fields"><label><FieldLabel>{lang === "zh" ? "系统训练月数" : "Training months"}</FieldLabel><input type="number" min="3" max="600" value={profile.trainingAgeMonths || 0} onChange={(event) => patchProfile("trainingAgeMonths", Number(event.target.value))} /></label><label><FieldLabel>{lang === "zh" ? "优先提升部位" : "Priority muscles"}</FieldLabel><input value={profile.weakPoints || ""} onChange={(event) => patchProfile("weakPoints", event.target.value)} placeholder={lang === "zh" ? "例如：背阔肌、三角肌中束" : "e.g. lats, side delts"} /></label></div> : <div className="track-detail-fields"><label><FieldLabel>{lang === "zh" ? "最主要的困难" : "Main barrier"}</FieldLabel><select value={profile.beginnerBarrier || "confidence"} onChange={(event) => patchProfile("beginnerBarrier", event.target.value as Profile["beginnerBarrier"])}><option value="confidence">{lang === "zh" ? "不知道怎么开始" : "Not sure how to start"}</option><option value="time">{lang === "zh" ? "时间不完整" : "Limited time"}</option><option value="consistency">{lang === "zh" ? "难以坚持" : "Consistency"}</option><option value="food">{lang === "zh" ? "饮食容易失控" : "Food choices"}</option><option value="feedback">{lang === "zh" ? "缺少反馈" : "Lack of feedback"}</option></select></label><label><FieldLabel>{lang === "zh" ? "偏好时长" : "Preferred duration"}</FieldLabel><select value={profile.sessionMinutes || 30} onChange={(event) => patchProfile("sessionMinutes", Number(event.target.value))}><option value="20">20 min</option><option value="30">30 min</option><option value="45">45 min</option></select></label></div>}
              <div className="field-grid two">
                <label><FieldLabel>{lang === "zh" ? "目标体重" : "Target weight"}</FieldLabel><span className="input-unit"><input aria-label={lang === "zh" ? "目标体重" : "Target weight"} type="number" min="35" max="250" value={profile.targetWeight} onChange={(e) => patchProfile("targetWeight", Number(e.target.value))} /><em>kg</em></span></label>
                <label><FieldLabel>{lang === "zh" ? "日常活动量" : "Daily activity"}</FieldLabel>
                  <select value={profile.activity} onChange={(e) => patchProfile("activity", e.target.value as Activity)}>
                    <option value="sedentary">{lang === "zh" ? "久坐为主" : "Mostly seated"}</option><option value="light">{lang === "zh" ? "轻度活动" : "Light activity"}</option>
                    <option value="moderate">{lang === "zh" ? "中等活动" : "Moderate activity"}</option><option value="active">{lang === "zh" ? "高活动量" : "Very active"}</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="form-section">
              <div className="form-section-title"><span>03</span><h3>{t.routine}</h3></div>
              <div className="field-grid two">
                <label><FieldLabel>{lang === "zh" ? "训练经验" : "Experience"}</FieldLabel>
                  <select value={profile.experience} onChange={(e) => patchProfile("experience", e.target.value as Experience)}>
                    <option value="beginner">{lang === "zh" ? "新手（0–6 个月）" : "Beginner (0–6 months)"}</option><option value="intermediate">{lang === "zh" ? "进阶（6–24 个月）" : "Intermediate"}</option><option value="advanced">{lang === "zh" ? "高级（2 年以上）" : "Advanced"}</option>
                  </select>
                </label>
                <label><FieldLabel>{lang === "zh" ? "可用器械" : "Equipment"}</FieldLabel>
                  <select value={profile.equipment} onChange={(e) => patchProfile("equipment", e.target.value as Equipment)}>
                    <option value="bodyweight">{lang === "zh" ? "徒手 / 居家" : "Bodyweight / home"}</option><option value="dumbbell">{lang === "zh" ? "哑铃" : "Dumbbells"}</option><option value="gym">{lang === "zh" ? "完整健身房" : "Full gym"}</option>
                  </select>
                </label>
              </div>
              <div className="field-grid two">
                <label><FieldLabel>{lang === "zh" ? "单次训练时长" : "Session duration"}</FieldLabel><span className="input-unit"><input type="number" min="20" max="180" value={profile.sessionMinutes || 50} onChange={(e) => patchProfile("sessionMinutes", Number(e.target.value))} /><em>{lang === "zh" ? "分钟" : "min"}</em></span></label>
                <label><FieldLabel>{lang === "zh" ? "训练地点" : "Training location"}</FieldLabel>
                  <select value={profile.trainingLocation || "mixed"} onChange={(e) => patchProfile("trainingLocation", e.target.value as NonNullable<Profile["trainingLocation"]>)}>
                    <option value="home">{lang === "zh" ? "居家" : "Home"}</option><option value="gym">{lang === "zh" ? "健身房" : "Gym"}</option><option value="outdoors">{lang === "zh" ? "户外" : "Outdoors"}</option><option value="mixed">{lang === "zh" ? "多个地点" : "Mixed"}</option>
                  </select>
                </label>
              </div>
              <div className="days-control"><FieldLabel>{lang === "zh" ? "每周训练几天" : "Training days per week"}</FieldLabel><div>{[2, 3, 4, 5, 6].map((day) => <button key={day} className={profile.days === day ? "active" : ""} onClick={() => patchProfile("days", day)}>{day}</button>)}</div></div>
              <label className="full-field"><FieldLabel>{lang === "zh" ? "伤病、疼痛或需要避开的动作（选填）" : "Injuries, pain or movements to avoid (optional)"}</FieldLabel><input value={profile.limitations} onChange={(e) => patchProfile("limitations", e.target.value)} placeholder={lang === "zh" ? "例如：右膝旧伤，避免跳跃" : "e.g. old right knee injury; avoid jumping"} /></label>
            </div>
            <div className="form-section">
              <div className="form-section-title"><span>04</span><h3>{lang === "zh" ? "饮食偏好" : "Food preferences"}</h3></div>
              <div className="field-grid two">
                <label><FieldLabel>{lang === "zh" ? "日常饮食方式" : "Eating style"}</FieldLabel>
                  <select value={profile.dietaryPreference || "balanced"} onChange={(e) => patchProfile("dietaryPreference", e.target.value as NonNullable<Profile["dietaryPreference"]>)}>
                    <option value="balanced">{lang === "zh" ? "均衡饮食" : "Balanced"}</option><option value="vegetarian">{lang === "zh" ? "素食" : "Vegetarian"}</option><option value="high_protein">{lang === "zh" ? "高蛋白" : "High protein"}</option><option value="none">{lang === "zh" ? "暂不设置" : "No preference"}</option>
                  </select>
                </label>
                <label><FieldLabel>{lang === "zh" ? "忌口、过敏或不吃的食物" : "Exclusions or allergies"}</FieldLabel><input value={profile.exclusions || ""} onChange={(e) => patchProfile("exclusions", e.target.value)} placeholder={lang === "zh" ? "例如：乳糖不耐、花生过敏" : "e.g. lactose, peanut allergy"} /></label>
              </div>
            </div>
            <button className="primary-cta" onClick={buildPlan} disabled={generating}><span>{generating ? (lang === "zh" ? "AI 正在规划…" : "AI is planning…") : !user ? (lang === "zh" ? "查看我的计划预览" : "Preview my plan") : t.generate}</span><b>{generating ? "···" : "→"}</b></button>
            <p className="privacy-line">◉ {!user ? (lang === "zh" ? "预览只在当前浏览器计算，不上传身体或伤病资料" : "Preview calculations stay in this browser; body and injury data are not uploaded") : (lang === "zh" ? "生成时会安全提交训练资料并保存计划历史" : "Generation securely submits this profile and saves plan history")}</p>
          </div>

          <aside className="preview-card">
            <div className="preview-header"><span>{t.preview}</span><i>LIVE</i></div>
            <div className="preview-hero"><p>{goalLabel}</p><h3>{plan.weeks} <span>{t.daysUnit}</span></h3><small>{lang === "zh" ? "安全、可持续的建议周期" : "A safe, sustainable cycle"}</small></div>
            <div className="metric-stack">
              <div><span>{t.calories}<small>{t.bmr} {plan.bmr}</small></span><b>{plan.calories}<em> kcal</em></b></div>
              <div><span>{t.protein}<small>{lang === "zh" ? "约" : "About"} {(plan.protein / profile.weight).toFixed(1)}g/kg</small></span><b>{plan.protein}<em> g</em></b></div>
              <div><span>{t.weekPlan}<small>{profile.days} {lang === "zh" ? "个训练日" : "training days"}</small></span><b>{Math.round(plan.schedule.reduce((sum, day) => sum + day.duration, 0) / 60)}<em> h</em></b></div>
            </div>
            <div className="week-strip">{plan.schedule.map((day, index) => <div key={index} className={day.restDay ? "" : "training"}><span>{dayNames[lang][index]}</span><b>{day.restDay ? "·" : "●"}</b></div>)}</div>
            <div className="preview-note"><span>↗</span><p>{plan.insights?.summary[lang] || (lang === "zh" ? "完成生成后，AI 会围绕「" + goalLabel + "」安排训练日、动作、组次和恢复。" : "After generation, AI will arrange your days, exercises, volume, and recovery around this goal.")}</p></div>
            {anonymousPreview && !user && <div className="anonymous-plan-preview">
              <div className="preview-day-sample">
                <span>{lang === "zh" ? "第一天 · 部分预览" : "Day one · partial preview"}</span>
                <b>{plan.schedule.find((day) => !day.restDay)?.title[lang]}</b>
                <p>{plan.schedule.find((day) => !day.restDay)?.exercises.slice(0, 2).map((exercise) => exercise.name[lang]).join(" · ")}</p>
              </div>
              <div className="locked-plan-sections" aria-label={lang === "zh" ? "登录后解锁的完整计划" : "Full plan unlocked after sign in"}>
                <span>完整 7 天安排</span><span>组数、次数与休息</span><span>渐进负荷</span><span>完整饮食建议</span><span>为什么这样安排</span><span>Coach 长期调整</span>
              </div>
              <p>{lang === "zh" ? "登录后，根据您刚刚填写的资料生成完整专属计划。" : "Sign in to generate the full personalized plan from the information you just entered."}</p>
              <button onClick={() => void signIn(true)}>{lang === "zh" ? "保存资料并生成完整计划" : "Save details and generate full plan"}<b>→</b></button>
            </div>}
          </aside>
        </div>
      </section>

      {planReady && <section className="plan-section" id="plan" ref={planRef}>
        <div className="section-heading light"><p>02 / YOUR PLAN</p><div><h2>{t.planTitle}</h2><span>{t.planSub}</span></div></div><div className="plan-source-pill llm">{lang === "zh" ? "AI 个性化计划 · 已通过安全校验" : "AI PERSONALIZED · SAFETY CHECKED"}</div>
        {planStatus === "draft" && <div className="plan-draft-banner"><div><span>DRAFT / 待确认</span><p>{lang === "zh" ? "这是新计划草案。启用前，你当前正在执行的计划不会改变。" : "This is a draft. Your active plan will not change until you confirm."}</p></div><button onClick={() => void activateDraft()}>{lang === "zh" ? "确认并启用新计划" : "Confirm and activate"} →</button></div>}
        <div className="nutrition-grid">
          <article className="nutrition-main">
            <div className="card-kicker">{t.nutrition}</div>
            <div className="calorie-number"><b>{plan.calories.toLocaleString()}</b><span>{t.kcal}<br />/ DAY</span></div>
            <div className="balance-chip">{plan.calorieDelta > 0 ? "+" : ""}{plan.calorieDelta} {t.kcal} · {profile.goal === "fat_loss" ? (lang === "zh" ? "温和热量缺口" : "moderate deficit") : (lang === "zh" ? "目标平衡" : "goal balance")}</div>
            <div className="energy-rail"><span style={{ width: Math.min(88, Math.max(28, (plan.calories / plan.tdee) * 74)) + "%" }} /></div>
            <div className="energy-labels"><span>{t.bmr}<b>{plan.bmr}</b></span><span>{t.tdee}<b>{plan.tdee}</b></span><span>BMI<b>{plan.bmi}</b></span></div>
          </article>
          <article className="macro-card protein"><span>PRO</span><b>{plan.protein}g</b><p>{t.protein}</p><small>{Math.round((plan.protein * 4 / plan.calories) * 100)}% kcal</small></article>
          <article className="macro-card carbs"><span>CARB</span><b>{plan.carbs}g</b><p>{t.carbs}</p><small>{Math.round((plan.carbs * 4 / plan.calories) * 100)}% kcal</small></article>
          <article className="macro-card fat"><span>FAT</span><b>{plan.fat}g</b><p>{t.fat}</p><small>{Math.round((plan.fat * 9 / plan.calories) * 100)}% kcal</small></article>
        </div>

        <div className="week-layout" id="library">
          <div className="week-main">
            <div className="week-heading"><div><span>03 / TRAINING</span><h3>{t.weekPlan}</h3></div><button onClick={() => document.getElementById("coach")?.scrollIntoView({ behavior: "smooth" })}>{t.update} ↗</button></div>
            <div className="day-tabs" role="tablist">
              {plan.schedule.map((day, index) => <button key={index} role="tab" aria-selected={activeDay === index} className={activeDay === index ? "active" : ""} onClick={() => setActiveDay(index)}><span>{dayNames[lang][index]}</span><b>{day.restDay ? "REST" : day.duration + "M"}</b></button>)}
            </div>
            <div className="workout-head"><div><p>{currentDay.focus[lang]}</p><h3>{currentDay.title[lang]}</h3></div><div><span>{currentDay.restDay ? "—" : currentDay.exercises.length}</span><small>{currentDay.restDay ? t.recovery : lang === "zh" ? "个动作" : "exercises"}</small></div></div>
            {currentDay.restDay ? (
              <div className="recovery-panel"><span>↻</span><div><h4>{currentDay.focus[lang]}</h4><p>{lang === "zh" ? "恢复不是偷懒，是让下一次训练真正发生适应。保持轻松活动，并优先保证睡眠。" : "Recovery is where adaptation happens. Keep movement easy and prioritize sleep."}</p></div></div>
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
                    <div className="prescription"><span><b>{exercise.sets}</b>{t.sets}</span><span><b>{exercise.reps}</b>REPS</span><span><b>{exercise.rest}</b>REST</span></div>
                    <button className={"complete-button " + (isDone ? "done" : "")} onClick={() => void completeExercise(key, activeDay, exercise.id)} disabled={isDone}>{isDone ? "✓" : "+"}<span>{isDone ? t.completed : t.complete}</span></button>
                  </article>;
                })}
              </div>
            )}
          </div>
          <aside className="coach-sidebar">
            {planRationale.length > 0 && <article className="rationale-card"><div className="card-kicker">{lang === "zh" ? "为什么这样安排" : "Why this plan fits"}</div>{planRationale.map((reason, index) => <div key={reason}><span>{String(index + 1).padStart(2, "0")}</span><p>{reason}</p></div>)}</article>}
            <article className="notes-card"><div className="card-kicker">{t.coachNotes}</div>{coachNotes.map((note, index) => <div key={note}><span>{index + 1}</span><p>{note}</p></div>)}</article>
            <article className="diet-card"><div className="card-kicker">{t.dietTitle}</div><ul>{dietGuidance.map((item) => <li key={item}>{item}</li>)}</ul></article>
          </aside>
        </div>
      </section>}

      <section className="edition-section" id="editions">
        <div className="section-heading"><p>04 / YOUR WAY</p><div><h2>{t.editions}</h2><span>{lang === "zh" ? "自主掌控 → 长期专业陪伴" : "YOUR CONTROL → LONG-TERM GUIDANCE"}</span></div></div>
        <div className="edition-grid">
          <article className="open-edition"><div className="edition-tag">{t.openCore}</div><h3>{t.openTitle}</h3><p>{t.openText}</p><div className="feature-cloud"><span>{lang === "zh" ? "自由部署" : "Self-host"}</span><span>{lang === "zh" ? "本地模型" : "Local AI"}</span><span>{lang === "zh" ? "透明可控" : "Transparent core"}</span><span>{lang === "zh" ? "9 种语言" : "9 languages"}</span></div><a href="https://github.com/hcao10/personal-fitness-coach" target="_blank" rel="noreferrer">{t.viewSource} <b>↗</b></a></article>
          <article className="pro-edition"><div className="edition-tag">{t.proEdition}</div><h3>{t.proTitle}</h3><p>{t.proText}</p>
            <div className="pro-diagram"><div><span>01</span><b>{lang === "zh" ? "训练档案" : "Training record"}</b><small>CONTINUITY</small></div><i>→</i><div><span>02</span><b>{lang === "zh" ? "智能规划" : "Smart planning"}</b><small>PERSONALIZATION</small></div><i>→</i><div><span>03</span><b>{lang === "zh" ? "持续调整" : "Ongoing refinement"}</b><small>PROGRESS</small></div></div>
            <a className="edition-link" href="/pricing">{t.upgrade} <b>→</b></a>
          </article>
        </div>
      </section>

      <footer><a className="brand" href="#top"><span className="brand-mark">C</span><span>CMINE <b>FIT</b></span></a><p>{t.footerNote}</p><span>© 2026 Cmine Fit · Exercise media © Gym visual · <a className="admin-link" href="/admin">{t.navAdmin}</a></span></footer>

      {user && accepted === false && <div className="modal-backdrop safety-backdrop" role="dialog" aria-modal="true" aria-labelledby="disclaimer-title">
        <div className="safety-modal">
          <div className="modal-stripe"><span>SAFETY FIRST</span><b>01 / 03</b></div><h2 id="disclaimer-title">{t.disclaimerTitle}</h2><p className="disclaimer-intro">{t.disclaimerIntro}</p>
          <label className={healthCheck ? "checked" : ""}><input type="checkbox" checked={healthCheck} onChange={(e) => setHealthCheck(e.target.checked)} /><span>{healthCheck ? "✓" : ""}</span><p>{t.disclaimerHealth}</p></label>
          <label className={estimateCheck ? "checked" : ""}><input type="checkbox" checked={estimateCheck} onChange={(e) => setEstimateCheck(e.target.checked)} /><span>{estimateCheck ? "✓" : ""}</span><p>{t.disclaimerEstimate}</p></label>
          <button className="primary-cta" disabled={!healthCheck || !estimateCheck} onClick={() => { localStorage.setItem("cmine_fit_disclaimer_health_v2", "accepted"); setAccepted(true); void fetch("/api/consents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ locale: lang }) }); }}><span>{t.accept}</span><b>→</b></button>
          <small>{lang === "zh" ? "继续即表示你已阅读并接受《健康免责声明》与《隐私说明》。" : "Continuing means you accept the health disclaimer and privacy notice."}</small>
        </div>
      </div>}

      {loginOpen && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setLoginOpen(false)} role="dialog" aria-modal="true">
        <div className="small-modal"><button className="modal-close" onClick={() => setLoginOpen(false)}>×</button><span className="modal-icon">↗</span><h2>{t.signinTitle}</h2><p>{t.signinText}</p>
          <div className="provider-list">{AUTH_PROVIDERS.map((provider) => <button key={provider.id} onClick={() => void signIn(anonymousPreview)}><span>C</span>{provider.label}<em>→</em></button>)}</div>
        </div>
      </div>}

      {adOpen && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setAdOpen(false)} role="dialog" aria-modal="true">
        <div className="small-modal ad-modal"><button className="modal-close" onClick={() => setAdOpen(false)}>×</button><span className="modal-icon">◆</span><h2>{t.adTitle}</h2><p>{t.adText}</p><div className="ad-reward"><b>+10</b><span>{t.points}</span></div>
          <button className="primary-cta" disabled={adClaimed} onClick={async () => { const response = await fetch("/api/points/claim-ad", { method: "POST" }); const result = await response.json() as { message?: string }; setAdClaimed(response.ok); setToast(result.message || (lang === "zh" ? "奖励广告暂不可用" : "Reward ads are not available yet")); window.setTimeout(() => setAdOpen(false), 900); }}><span>{adClaimed ? t.completed : t.playAd}</span><b>▶</b></button>
        </div>
      </div>}
      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    </main>
  );
}

