/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { defaultProfile, generatePlan, type Activity, type Equipment, type Experience, type Goal, type Profile } from "./lib/coach";
import { AUTH_PROVIDERS, beginCmineLogin, getCmineUser, signOutCmine, type CmineUser } from "./lib/auth";
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
  const plan = useMemo(() => generatePlan(profile), [profile]);
  const [activeDay, setActiveDay] = useState(0);
  const [accepted, setAccepted] = useState<boolean | null>(null);
  const [healthCheck, setHealthCheck] = useState(false);
  const [estimateCheck, setEstimateCheck] = useState(false);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);
  const [points, setPoints] = useState(120);
  const [loginOpen, setLoginOpen] = useState(false);
  const [adOpen, setAdOpen] = useState(false);
  const [adClaimed, setAdClaimed] = useState(false);
  const [toast, setToast] = useState("");
  const [user, setUser] = useState<CmineUser | null>(null);
  const planRef = useRef<HTMLElement>(null);

  useEffect(() => {
    queueMicrotask(() => {
      setAccepted(localStorage.getItem("forma_disclaimer_v1") === "accepted");
      setUser(getCmineUser());
    });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 4200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const patchProfile = <K extends keyof Profile>(key: K, value: Profile[K]) => setProfile((current) => ({ ...current, [key]: value }));
  const buildPlan = () => {
    setActiveDay(Math.max(0, plan.schedule.findIndex((day) => !day.restDay)));
    window.setTimeout(() => planRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
  };
  const completeExercise = (key: string) => {
    if (completed.has(key)) return;
    setCompleted((current) => new Set(current).add(key));
    setPoints((current) => current + 5);
  };
  const signIn = async () => {
    const result = await beginCmineLogin();
    if (!result.ok) { setLoginOpen(false); setToast(result.message || "登录暂不可用。"); }
  };
  const currentDay = plan.schedule[activeDay] || plan.schedule[0];
  const goalLabel = goalOptions.find((goal) => goal.value === profile.goal)?.[lang] || "";

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="FORMA Coach home"><span className="brand-mark">F</span><span>FORMA <b>COACH</b></span></a>
        <nav className="topnav" aria-label="Primary navigation"><a href="#coach">{t.navCoach}</a><a href="#library">{t.navLibrary}</a><a href="#editions">{t.navAbout}</a></nav>
        <div className="header-actions">
          <label className="language-select"><span className="sr-only">Language</span>
            <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
              {languageOptions.map((language) => <option key={language.value} value={language.value}>{language.label}</option>)}
            </select>
          </label>
          <button className="points-pill" onClick={() => setAdOpen(true)} aria-label={t.watchAd}><span>◆</span> {points}</button>
          {user ? (
            <button className="avatar-button" onClick={() => { signOutCmine(); setUser(null); }}><span>{(user.name || user.email || "C").slice(0, 1).toUpperCase()}</span><em>{t.logout}</em></button>
          ) : <button className="login-button" onClick={() => setLoginOpen(true)}>{t.login} <span>↗</span></button>}
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="edition-pills"><span>{t.openCore}</span><i>+</i><span>{t.proEdition}</span></div>
          <p className="eyebrow"><span /> {t.eyebrow}</p>
          <h1>{t.titleA}<br /><em>{t.titleB}</em></h1>
          <p className="hero-subtitle">{t.subtitle}</p>
          <div className="trust-row">
            <div className="face-stack" aria-hidden="true"><span>J</span><span>M</span><span>A</span></div>
            <div><b>4.9</b><span>★★★★★</span><small>{t.socialProof}</small></div>
          </div>
        </div>
        <div className="signal-card" aria-label={t.estimate}>
          <div className="signal-top"><span>{t.estimate}</span><i>{plan.confidence === "high" ? "HIGH FIT" : "REVIEW"}</i></div>
          <div className="calorie-orbit"><div><b>{plan.calories.toLocaleString()}</b><span>{t.kcal} / day</span></div></div>
          <div className="signal-stats">
            <div><b>{plan.protein}g</b><span>{t.protein}</span></div><div><b>{profile.days}×</b><span>{t.weekPlan}</span></div><div><b>{plan.weeks}</b><span>{t.daysUnit}</span></div>
          </div>
          <p><span>AI</span>{lang === "zh" ? "已根据目标自动调整训练量与热量建议" : "Training volume and calories adapt to your goal"}</p>
        </div>
      </section>

      <section className="coach-studio" id="coach">
        <div className="section-heading"><p>01 / INTAKE</p><div><h2>{t.profileTitle}</h2><span>{t.profileHint}</span></div></div>
        <div className="intake-grid">
          <div className="form-card">
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
              <div className="days-control"><FieldLabel>{lang === "zh" ? "每周训练几天" : "Training days per week"}</FieldLabel><div>{[2, 3, 4, 5, 6].map((day) => <button key={day} className={profile.days === day ? "active" : ""} onClick={() => patchProfile("days", day)}>{day}</button>)}</div></div>
              <label className="full-field"><FieldLabel>{lang === "zh" ? "伤病、疼痛或需要避开的动作（选填）" : "Injuries, pain or movements to avoid (optional)"}</FieldLabel><input value={profile.limitations} onChange={(e) => patchProfile("limitations", e.target.value)} placeholder={lang === "zh" ? "例如：右膝旧伤，避免跳跃" : "e.g. old right knee injury; avoid jumping"} /></label>
            </div>
            <button className="primary-cta" onClick={buildPlan}><span>{t.generate}</span><b>→</b></button>
            <p className="privacy-line">◉ {lang === "zh" ? "当前演示仅在设备上计算，不上传身体数据" : "This demo calculates on-device and does not upload body data"}</p>
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
            <div className="preview-note"><span>↗</span><p>{lang === "zh" ? "为了「" + goalLabel + "」，计划优先安排复合动作，再补目标部位。" : "The plan leads with compound movements, then adds focused work for your goal."}</p></div>
          </aside>
        </div>
      </section>

      <section className="plan-section" id="plan" ref={planRef}>
        <div className="section-heading light"><p>02 / YOUR PLAN</p><div><h2>{t.planTitle}</h2><span>{t.planSub}</span></div></div>
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
                    <button className={"complete-button " + (isDone ? "done" : "")} onClick={() => completeExercise(key)} disabled={isDone}>{isDone ? "✓" : "+"}<span>{isDone ? t.completed : t.complete}</span></button>
                  </article>;
                })}
              </div>
            )}
          </div>
          <aside className="coach-sidebar">
            <article className="notes-card"><div className="card-kicker">{t.coachNotes}</div>{[t.note1, t.note2, t.note3].map((note, index) => <div key={note}><span>{index + 1}</span><p>{note}</p></div>)}</article>
            <article className="diet-card"><div className="card-kicker">{t.dietTitle}</div><ul><li>{t.diet1}</li><li>{t.diet2}</li><li>{t.diet3}</li></ul></article>
          </aside>
        </div>
      </section>

      <section className="edition-section" id="editions">
        <div className="section-heading"><p>04 / PRODUCT</p><div><h2>{t.editions}</h2><span>OPEN SOURCE → HOSTED PRO</span></div></div>
        <div className="edition-grid">
          <article className="open-edition"><div className="edition-tag">{t.openCore}</div><h3>{t.openTitle}</h3><p>{t.openText}</p><div className="feature-cloud"><span>Self-host</span><span>Local LLM</span><span>MIT core</span><span>9 languages</span></div><a href="https://github.com/hcao10/personal-fitness-coach" target="_blank" rel="noreferrer">{t.viewSource} <b>↗</b></a></article>
          <article className="pro-edition"><div className="edition-tag">{t.proEdition}</div><h3>{t.proTitle}</h3><p>{t.proText}</p>
            <div className="pro-diagram"><div><span>01</span><b>Cmine ID</b><small>IDENTITY</small></div><i>→</i><div><span>02</span><b>AI Coach</b><small>PERSONALIZATION</small></div><i>→</i><div><span>03</span><b>Points</b><small>RETENTION</small></div></div>
            <button onClick={() => setLoginOpen(true)}>{t.upgrade} <b>→</b></button>
          </article>
        </div>
      </section>

      <footer><a className="brand" href="#top"><span className="brand-mark">F</span><span>FORMA <b>COACH</b></span></a><p>{t.footerNote}</p><span>© 2026 FORMA · Exercise media © Gym visual</span></footer>

      {accepted === false && <div className="modal-backdrop safety-backdrop" role="dialog" aria-modal="true" aria-labelledby="disclaimer-title">
        <div className="safety-modal">
          <div className="modal-stripe"><span>SAFETY FIRST</span><b>01 / 03</b></div><h2 id="disclaimer-title">{t.disclaimerTitle}</h2><p className="disclaimer-intro">{t.disclaimerIntro}</p>
          <label className={healthCheck ? "checked" : ""}><input type="checkbox" checked={healthCheck} onChange={(e) => setHealthCheck(e.target.checked)} /><span>{healthCheck ? "✓" : ""}</span><p>{t.disclaimerHealth}</p></label>
          <label className={estimateCheck ? "checked" : ""}><input type="checkbox" checked={estimateCheck} onChange={(e) => setEstimateCheck(e.target.checked)} /><span>{estimateCheck ? "✓" : ""}</span><p>{t.disclaimerEstimate}</p></label>
          <button className="primary-cta" disabled={!healthCheck || !estimateCheck} onClick={() => { localStorage.setItem("forma_disclaimer_v1", "accepted"); setAccepted(true); }}><span>{t.accept}</span><b>→</b></button>
          <small>{lang === "zh" ? "继续即表示你已阅读并接受《健康免责声明》与《隐私说明》。" : "Continuing means you accept the health disclaimer and privacy notice."}</small>
        </div>
      </div>}

      {loginOpen && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setLoginOpen(false)} role="dialog" aria-modal="true">
        <div className="small-modal"><button className="modal-close" onClick={() => setLoginOpen(false)}>×</button><span className="modal-icon">↗</span><h2>{t.signinTitle}</h2><p>{t.signinText}</p>
          <div className="provider-list">{AUTH_PROVIDERS.map((provider) => <button key={provider.id} disabled={!provider.enabled} onClick={provider.id === "cmine" ? signIn : undefined}><span>{provider.id === "cmine" ? "C" : provider.id === "apple" ? "●" : provider.id === "google" ? "G" : "微"}</span>{provider.label}<em>{provider.enabled ? "→" : t.notReady}</em></button>)}</div>
        </div>
      </div>}

      {adOpen && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setAdOpen(false)} role="dialog" aria-modal="true">
        <div className="small-modal ad-modal"><button className="modal-close" onClick={() => setAdOpen(false)}>×</button><span className="modal-icon">◆</span><h2>{t.adTitle}</h2><p>{t.adText}</p><div className="ad-reward"><b>+20</b><span>{t.points}</span></div>
          <button className="primary-cta" disabled={adClaimed} onClick={() => { setPoints((value) => value + 20); setAdClaimed(true); setToast(lang === "zh" ? "20 积分已到账" : "20 points added"); window.setTimeout(() => setAdOpen(false), 650); }}><span>{adClaimed ? t.completed : t.playAd}</span><b>▶</b></button>
        </div>
      </div>}
      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    </main>
  );
}

