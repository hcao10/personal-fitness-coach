"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { beginCmineLogin, signOutCmine } from "../lib/auth";
import { defaultProfile, type CoachPlan, type Profile } from "../lib/coach";

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

const goals: { value: Profile["goal"]; label: string }[] = [
  { value: "fat_loss", label: "减脂" },
  { value: "muscle", label: "增肌" },
  { value: "recomp", label: "塑形" },
  { value: "arms", label: "手臂线条" },
  { value: "strength", label: "提升力量" },
];

function dateText(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

export default function AccountDashboard() {
  const [data, setData] = useState<AccountData | null>(null);
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
    const [response, catalogResponse] = await Promise.all([
      fetch("/api/v1/me", { cache: "no-store" }).catch(() => null),
      fetch("/api/v1/billing/catalog", { cache: "no-store" }).catch(() => null),
    ]);
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

  const today = (new Date().getDay() + 6) % 7;
  const todayPlan = data?.latestPlan?.plan?.schedule[today] || null;
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
      setNotice((await response.json().catch(() => null))?.message || "训练档案保存失败。");
      return;
    }
    setNotice("训练档案已保存，下一份计划会使用这些资料。");
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
      setNotice((await response.json().catch(() => null))?.message || "身体记录保存失败。");
      return;
    }
    setMeasurement({ weightKg: "", bodyFatPct: "", waistCm: "", armCm: "", note: "" });
    setNotice("新的身体记录已经保存。");
    await loadAccount();
  };

  const removeAccount = async () => {
    const phrase = window.prompt("此操作将永久删除 Cmine Fit 内的训练、计划和进度数据，无法撤销（不影响你的 Cmine ID）。\n\n请输入 DELETE 以确认：");
    if (phrase !== "DELETE") { if (phrase !== null) setNotice("确认短语不匹配，未执行删除。"); return; }
    const response = await fetch("/api/v1/me", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: "DELETE" }) });
    if (response.ok) window.location.assign("/");
    else setNotice("暂时无法删除账号数据，请稍后重试。");
  };

  const saveFeedback = async () => {
    if (!data?.latestPlan?.id) return setNotice("还没有可以记录反馈的训练计划。");
    setSavingFeedback(true);
    const response = await fetch(`/api/v1/workouts/${encodeURIComponent(data.latestPlan.id)}/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dayIndex: today, ...feedback }),
    });
    setSavingFeedback(false);
    if (!response.ok) return setNotice((await response.json().catch(() => null))?.message || "训练反馈保存失败。");
    setNotice("训练反馈已经保存，会用于下一周期的调整。");
    await loadAccount();
  };

  const openBillingPortal = async () => {
    const response = await fetch("/api/v1/billing/portal", { method: "POST" });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.url) return setNotice(body?.message || "暂时无法打开订阅管理。");
    window.location.assign(body.url);
  };

  const redeem = async (reward: "meal_scan" | "plan_refresh") => {
    const response = await fetch("/api/v1/points/redeem", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reward }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) return setNotice(body?.message || "积分兑换失败。");
    setNotice(reward === "meal_scan" ? "已兑换 1 次饭菜识别。" : "已兑换 1 次计划刷新。");
    await loadAccount();
  };

  if (loading) {
    return <main className="account-shell"><div className="account-loading"><span>C</span><p>正在整理你的训练记录…</p></div></main>;
  }

  if (signedOut || !data) {
    return <main className="account-shell">
      <header className="account-public-header"><Link className="brand" href="/"><span className="brand-mark">C</span><span>CMINE <b>FIT</b></span></Link></header>
      <section className="account-signin">
        <span>YOUR TRAINING, CONNECTED</span>
        <h1>让每一次训练<br />都接得上下一次。</h1>
        <p>使用 Cmine ID 登录后，你的计划、完成记录、身体变化和下一次调整会安全保存在同一个地方。</p>
        <button onClick={() => void beginCmineLogin("/account")}><b>C</b> 使用 Cmine ID 登录 <em>→</em></button>
        <Link href="/">先返回首页</Link>
      </section>
    </main>;
  }

  return <main className="account-shell">
    <aside className="account-rail">
      <Link className="brand account-brand" href="/"><span className="brand-mark">C</span><span>CMINE <b>FIT</b></span></Link>
      <nav>
        <Link href="/today"><span>01</span>今日训练</Link>
        <Link href="/coach"><span>02</span>Coach</Link>
        <Link href="/nutrition"><span>03</span>饮食记录</Link>
        <Link href="/progress"><span>04</span>身体进度</Link>
        <a href="#plans"><span>05</span>计划历史</a>
        <a href="#profile"><span>06</span>训练档案</a>
        <a href="#membership"><span>07</span>专业计划</a>
        <a href="#account"><span>08</span>账号与数据</a>
      </nav>
      <div className="account-user">
        <span>{(data.user.name || data.user.email || "C").slice(0, 1).toUpperCase()}</span>
        <div><b>{data.user.name || "Cmine Fit 用户"}</b><small>{data.user.email}</small></div>
      </div>
    </aside>

    <section className="account-main">
      <header className="account-topbar">
        <div><span>CMINE FIT / MY TRAINING</span><strong>我的训练</strong></div>
        <div><Link href="/nutrition">饮食记录</Link><Link href="/pricing">专业计划</Link><Link href="/">生成新计划 ↗</Link><button onClick={async () => { await signOutCmine(); window.location.assign("/"); }}>安全退出</button></div>
      </header>

      <section className="account-hero" id="today">
        <div>
          <span>欢迎回来，{data.user.name?.split(" ")[0] || "今天也在进步的你"}</span>
          <h1>{todayPlan?.restDay ? "今天，把恢复也认真完成。" : todayPlan ? todayPlan.title.zh : "从第一份专属计划开始。"}</h1>
          <p>{todayPlan?.focus.zh || "更新训练档案后，让 AI 根据你的目标和现实条件安排完整一周。"}</p>
          {data.latestPlan ? <Link href="/today">查看今日训练 <b>→</b></Link> : <Link href="/onboarding">生成第一份计划 <b>→</b></Link>}
        </div>
        <article>
          <small>TODAY</small>
          <b>{todayPlan?.restDay ? "恢复日" : todayPlan ? `${todayPlan.duration} min` : "—"}</b>
          <span>{todayPlan?.restDay ? "轻松活动 · 睡眠优先" : `${todayPlan?.exercises.length || 0} 个动作`}</span>
        </article>
      </section>

      <div className="account-metrics">
        <article><span>完成训练</span><b>{data.progress.completedWorkouts}</b><small>已保存的训练日</small></article>
        <article><span>完成动作</span><b>{data.progress.completedExercises}</b><small>逐项同步记录</small></article>
        <article><span>身体记录</span><b>{data.measurements.length}</b><small>用于观察长期趋势</small></article>
        <article><span>今日摄入</span><b>{data.nutritionToday.calories}</b><small>{data.nutritionToday.proteinG}g 蛋白质</small></article>
      </div>

      <section className="account-panel workout-feedback-panel" id="feedback">
        <div className="account-section-title"><div><span>03 / TRAINING FEEDBACK</span><h2>训练反馈</h2></div><p>记录强度、疼痛和完成情况，专业版会把这些变化用于下一周期。</p></div>
        <div className="feedback-grid">
          <label><span>训练时长</span><div><input type="number" min="1" max="240" value={feedback.durationMinutes} onChange={(event) => setFeedback({ ...feedback, durationMinutes: Number(event.target.value) })} /><em>min</em></div></label>
          <label><span>主观强度 RPE</span><input type="range" min="1" max="10" value={feedback.rpe} onChange={(event) => setFeedback({ ...feedback, rpe: Number(event.target.value) })} /><b>{feedback.rpe}/10</b></label>
          <label className="feedback-pain"><input type="checkbox" checked={feedback.pain} onChange={(event) => setFeedback({ ...feedback, pain: event.target.checked })} /><span>训练中出现疼痛或不适</span></label>
          <label className="feedback-notes"><span>备注</span><input value={feedback.notes} maxLength={500} onChange={(event) => setFeedback({ ...feedback, notes: event.target.value })} placeholder="例如：睡眠不足、右肩紧张、动作状态很好" /></label>
          <button onClick={() => void saveFeedback()} disabled={savingFeedback || !data.latestPlan}>{savingFeedback ? "正在保存…" : "保存今天的反馈 →"}</button>
        </div>
      </section>

      <section className="account-panel" id="plans">
        <div className="account-section-title"><div><span>04 / PLAN HISTORY</span><h2>计划历史</h2></div><p>每次生成都会保留当时的身体资料、模型版本和完整计划。</p></div>
        {data.plans.length ? <div className="plan-history">
          {data.plans.map((item, index) => <article key={item.id}>
            <div><span>{String(data.plans.length - index).padStart(2, "0")}</span><small>{dateText(item.createdAt)}</small></div>
            <h3>{item.plan?.schedule.find((day) => !day.restDay)?.title.zh || "专属训练计划"}</h3>
            <p>{item.plan?.insights?.summary.zh || `${item.profile?.days || "—"} 个训练日 · ${item.plan?.calories || "—"} kcal`}</p>
            <footer><span>{item.model}</span><b>{item.plan?.weeks || "—"} 周</b></footer>
          </article>)}
        </div> : <div className="account-empty"><p>还没有保存的计划。</p><Link href="/#coach">生成第一份计划 →</Link></div>}
      </section>

      <section className="account-panel" id="progress">
        <div className="account-section-title"><div><span>05 / PROGRESS</span><h2>身体进度</h2></div><p>看长期趋势，不被某一天的波动打乱节奏。</p></div>
        <div className="progress-layout">
          <div className="measurement-form">
            <h3>记录今天</h3>
            <div>
              <label><span>体重</span><div><input type="number" min="35" max="250" step="0.1" value={measurement.weightKg} onChange={(event) => setMeasurement({ ...measurement, weightKg: event.target.value })} /><em>kg</em></div></label>
              <label><span>体脂</span><div><input type="number" min="2" max="70" step="0.1" value={measurement.bodyFatPct} onChange={(event) => setMeasurement({ ...measurement, bodyFatPct: event.target.value })} /><em>%</em></div></label>
              <label><span>腰围</span><div><input type="number" min="40" max="220" step="0.1" value={measurement.waistCm} onChange={(event) => setMeasurement({ ...measurement, waistCm: event.target.value })} /><em>cm</em></div></label>
              <label><span>臂围</span><div><input type="number" min="15" max="80" step="0.1" value={measurement.armCm} onChange={(event) => setMeasurement({ ...measurement, armCm: event.target.value })} /><em>cm</em></div></label>
            </div>
            <label className="measurement-note"><span>备注</span><input value={measurement.note} onChange={(event) => setMeasurement({ ...measurement, note: event.target.value })} placeholder="例如：晨起、空腹测量" /></label>
            <button onClick={() => void addMeasurement()} disabled={savingMeasurement}>{savingMeasurement ? "正在保存…" : "保存身体记录 →"}</button>
          </div>
          <div className="progress-records">
            <div className="progress-summary"><span>体重趋势</span><b>{weightChange === null ? "记录两次后显示" : `${weightChange > 0 ? "+" : ""}${weightChange} kg`}</b></div>
            {data.measurements.length ? data.measurements.slice(0, 8).map((item) => <article key={item.id}>
              <time>{dateText(item.measuredAt)}</time>
              <div>{item.weightKg !== null && <span><b>{item.weightKg}</b> kg</span>}{item.waistCm !== null && <span><b>{item.waistCm}</b> 腰围</span>}{item.armCm !== null && <span><b>{item.armCm}</b> 臂围</span>}{item.bodyFatPct !== null && <span><b>{item.bodyFatPct}%</b> 体脂</span>}</div>
              {item.note && <p>{item.note}</p>}
            </article>) : <div className="account-empty"><p>第一次记录后，趋势会从这里开始。</p></div>}
          </div>
        </div>
      </section>

      <section className="account-panel" id="profile">
        <div className="account-section-title"><div><span>06 / TRAINING PROFILE</span><h2>训练档案</h2></div><p>更新后会用于下一次 AI 规划，不会改写已有计划。</p></div>
        <div className="profile-editor">
          <label><span>生理性别</span><select value={profile.sex} onChange={(event) => setProfile({ ...profile, sex: event.target.value as Profile["sex"] })}><option value="female">女性</option><option value="male">男性</option></select></label>
          <label><span>年龄</span><input type="number" value={profile.age} onChange={(event) => setProfile({ ...profile, age: Number(event.target.value) })} /></label>
          <label><span>身高 cm</span><input type="number" value={profile.height} onChange={(event) => setProfile({ ...profile, height: Number(event.target.value) })} /></label>
          <label><span>体重 kg</span><input type="number" value={profile.weight} onChange={(event) => setProfile({ ...profile, weight: Number(event.target.value) })} /></label>
          <label><span>目标体重 kg</span><input type="number" value={profile.targetWeight} onChange={(event) => setProfile({ ...profile, targetWeight: Number(event.target.value) })} /></label>
          <label><span>训练目标</span><select value={profile.goal} onChange={(event) => setProfile({ ...profile, goal: event.target.value as Profile["goal"] })}>{goals.map((goal) => <option key={goal.value} value={goal.value}>{goal.label}</option>)}</select></label>
          <label><span>日常活动</span><select value={profile.activity} onChange={(event) => setProfile({ ...profile, activity: event.target.value as Profile["activity"] })}><option value="sedentary">久坐为主</option><option value="light">轻度活动</option><option value="moderate">中等活动</option><option value="active">高活动量</option></select></label>
          <label><span>训练经验</span><select value={profile.experience} onChange={(event) => setProfile({ ...profile, experience: event.target.value as Profile["experience"] })}><option value="beginner">新手</option><option value="intermediate">进阶</option><option value="advanced">高级</option></select></label>
          <label><span>可用器械</span><select value={profile.equipment} onChange={(event) => setProfile({ ...profile, equipment: event.target.value as Profile["equipment"] })}><option value="bodyweight">徒手 / 居家</option><option value="dumbbell">哑铃</option><option value="gym">完整健身房</option></select></label>
          <label><span>每周训练</span><select value={profile.days} onChange={(event) => setProfile({ ...profile, days: Number(event.target.value) })}>{[2, 3, 4, 5, 6].map((day) => <option key={day} value={day}>{day} 天</option>)}</select></label>
          <label><span>单次训练时长</span><input type="number" min="20" max="180" value={profile.sessionMinutes || 50} onChange={(event) => setProfile({ ...profile, sessionMinutes: Number(event.target.value) })} /></label>
          <label><span>训练地点</span><select value={profile.trainingLocation || "mixed"} onChange={(event) => setProfile({ ...profile, trainingLocation: event.target.value as NonNullable<Profile["trainingLocation"]> })}><option value="home">居家</option><option value="gym">健身房</option><option value="outdoors">户外</option><option value="mixed">多个地点</option></select></label>
          <label><span>饮食偏好</span><select value={profile.dietaryPreference || "balanced"} onChange={(event) => setProfile({ ...profile, dietaryPreference: event.target.value as NonNullable<Profile["dietaryPreference"]> })}><option value="balanced">均衡饮食</option><option value="vegetarian">素食</option><option value="high_protein">高蛋白</option><option value="none">暂不设置</option></select></label>
          <label><span>忌口、过敏或不吃的食物</span><input value={profile.exclusions || ""} onChange={(event) => setProfile({ ...profile, exclusions: event.target.value })} placeholder="没有可留空" /></label>
          <label className="profile-limitations"><span>伤病、疼痛或需要避开的动作</span><input value={profile.limitations} onChange={(event) => setProfile({ ...profile, limitations: event.target.value })} placeholder="没有可留空" /></label>
          <button onClick={() => void saveProfile()} disabled={savingProfile}>{savingProfile ? "正在保存…" : "保存训练档案 →"}</button>
        </div>
      </section>

      <section className="account-panel membership-panel" id="membership">
        <div className="account-section-title"><div><span>07 / MEMBERSHIP</span><h2>专业计划</h2></div><p>当前状态、额度、续费和取消信息都来自真实权益与支付记录。</p></div>
        <div className="membership-current">
          <div><span>当前方案</span><h3>{data.product.membership.name}</h3><p>
            计划剩余 {data.product.usage.capabilities["plan.generate"]?.remaining ?? 0} 次 ·
            饭菜识别剩余 {data.product.usage.capabilities["meal.scan"]?.remaining ?? 0} 次
            {data.product.membership.currentPeriodEnd && ` · ${dateText(data.product.membership.currentPeriodEnd)} ${data.product.membership.cancelAtPeriodEnd ? "到期" : "续费"}`}
          </p></div>
          <b>{data.product.membership.status.toUpperCase()}</b>
        </div>
        {data.product.membership.tier === "pro" ? <div className="membership-preview">
          <div><span>CMINE FIT PRO</span><h3>{data.product.membership.status === "trial" ? "试用期内，全部专业能力已解锁。" : "你的长期 Coach 权益已经生效。"}</h3><p>训练计划、饭菜识别、长期趋势和 Coach 对话都按当前专业版额度提供。</p></div>
          <ul>
            <li>每月 {data.product.usage.capabilities["plan.generate"]?.limit ?? "—"} 次训练计划</li>
            <li>每月 {data.product.usage.capabilities["meal.scan"]?.limit ?? "—"} 次饭菜识别</li>
            <li>每月 {data.product.usage.capabilities["coach.chat"]?.limit ?? "—"} 条 Coach 消息</li>
            <li>阶段复盘与自适应调整</li>
          </ul>
          <div className="membership-price"><small>订阅管理</small><b>PRO</b><span>{data.product.membership.status === "trial" ? "试用结束后回到免费版；随时可在价格页订阅" : "付款方式、发票、续费与取消由 Stripe 安全管理"}</span>{catalogConfigured && (data.product.membership.status === "trial" ? <Link href="/pricing">查看订阅 →</Link> : <button onClick={() => void openBillingPortal()}>管理订阅 →</button>)}</div>
        </div> : <div className="membership-preview">
          <div><span>CMINE FIT PRO</span><h3>更细致地理解你的变化，再安排下一步。</h3><p>专业版把训练、营养、恢复与现实日程放在同一个长期档案里持续调整。</p></div>
          <ul><li>一键采纳教练引擎的完整调整方案</li><li>依据完成率、RPE 与疼痛反馈调整</li><li>更高的计划与饭菜识别额度</li><li>阶段趋势、停滞识别与复盘</li></ul>
          <div className="membership-price"><small>计划价格</small><b>见价格页</b><span>价格与额度以价格页实时显示为准</span>{catalogConfigured && <Link href="/pricing">选择专业版 →</Link>}</div>
        </div>}
        <div className="points-redemption">
          <div><span>积分余额</span><b>{data.points}</b><small>完成训练获得积分；广告积分仅在服务端验证后发放</small></div>
          <button disabled={data.points < 50} onClick={() => void redeem("meal_scan")}>50 积分 · 饭菜识别</button>
          <button disabled={data.points < 100} onClick={() => void redeem("plan_refresh")}>100 积分 · 计划刷新</button>
        </div>
      </section>

      <HabitCommitmentCard />
      <NotificationPreferencesCard />

      <section className="account-panel account-data-panel" id="account">
        <div className="account-section-title"><div><span>08 / ACCOUNT & DATA</span><h2>账号与数据</h2></div><p>Cmine Fit 数据与你的 Cmine ID 身份分开管理。</p></div>
        <div className="account-data-actions">
          <article><div><h3>导出我的数据</h3><p>下载计划、进度、训练记录和同意记录的 JSON 副本。</p></div><a href="/api/v1/export">开始导出 ↗</a></article>
          <article className="danger"><div><h3>删除 Cmine Fit 数据</h3><p>删除本站内的用户、计划和进度，不会删除 Cmine ID。</p></div><button onClick={() => void removeAccount()}>删除数据</button></article>
        </div>
      </section>

      <footer className="account-footer"><span>CMINE FIT · 懂训练，更懂你</span><p>健康与训练建议不替代医疗诊断、治疗或康复方案。</p></footer>
    </section>
    {notice && <div className="toast account-toast">{notice}</div>}
  </main>;
}

type NotificationPreferences = { training: boolean; coach: boolean; reviews: boolean; nutrition: boolean; billing: boolean; quietStart: string; quietEnd: string };

const NOTIFICATION_ROWS: Array<{ key: keyof NotificationPreferences; label: string; hint: string }> = [
  { key: "training", label: "训练日提醒", hint: "在你承诺的训练时间提醒当天的安排" },
  { key: "reviews", label: "每周教练信", hint: "周日晚发送本周复盘与下周聚焦" },
  { key: "coach", label: "Coach 主动跟进", hint: "教练发起的状态确认" },
  { key: "nutrition", label: "饮食记录提醒", hint: "默认关闭" },
  { key: "billing", label: "订阅与试用提醒", hint: "试用到期、扣款与退款通知" },
];

// The API and the scheduler have honored these settings since push shipped;
// this card is the missing entry point.
function NotificationPreferencesCard() {
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
    setMessage(response.ok ? "通知偏好已保存。" : "保存失败，请检查安静时段格式（HH:MM）。");
  };
  if (!preferences) return null;
  return <section className="account-panel" id="notifications">
    <div className="account-section-title"><div><span>07.6 / NOTIFICATIONS</span><h2>通知偏好</h2></div><p>推送只在你允许的类型与时段发送；安静时段内的提醒会被抑制。</p></div>
    <div className="account-data-actions">
      <article>
        <div>
          <h3>推送类型</h3>
          {NOTIFICATION_ROWS.map((row) => <p key={row.key}>
            <label>
              <input type="checkbox" checked={Boolean(preferences[row.key])} onChange={(event) => void save({ ...preferences, [row.key]: event.target.checked })} />
              {" "}{row.label}
            </label>
            <small> — {row.hint}</small>
          </p>)}
        </div>
      </article>
      <article>
        <div>
          <h3>安静时段</h3>
          <p>
            <label>从 <input type="time" value={preferences.quietStart} onChange={(event) => setPreferences({ ...preferences, quietStart: event.target.value })} /></label>
            {" "}
            <label>到 <input type="time" value={preferences.quietEnd} onChange={(event) => setPreferences({ ...preferences, quietEnd: event.target.value })} /></label>
          </p>
          <p>这段时间内不会收到任何推送（跨夜时段也支持）。</p>
          {message && <p>{message}</p>}
        </div>
        <button onClick={() => void save(preferences)}>保存安静时段</button>
      </article>
    </div>
  </section>;
}

type HabitData = {
  streak: { currentWeeks: number; longestWeeks: number; activeThisWeek: boolean; sessionsThisWeek: number };
  totalSessions: number;
  commitment: { cueTime: string; cuePlace: string | null } | null;
  milestones: Array<{ kind: string; title: { zh: string }; message: { zh: string }; achievedAt: string }>;
};

// Implementation intention: committing to a concrete time and place roughly
// doubles follow-through versus a vague "I'll train more" — and the committed
// cue time is exactly when the training reminder fires.
function HabitCommitmentCard() {
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
    setMessage(response.ok ? "已保存。训练日提醒会在这个时间发送（尊重你的安静时段）。" : body.message || "保存失败，请检查时间格式。");
  };
  return <section className="account-panel" id="habit">
    <div className="account-section-title"><div><span>07.5 / HABIT</span><h2>训练习惯</h2></div><p>把训练固定到具体的时间和地点，坚持会容易得多。</p></div>
    <div className="account-data-actions">
      <article>
        <div>
          <h3>我的训练承诺</h3>
          <p>
            <label>时间 <input type="time" value={cueTime} onChange={(event) => setCueTime(event.target.value)} /></label>
            {" "}
            <label>地点 <input type="text" maxLength={60} placeholder="如：小区健身房" value={cuePlace} onChange={(event) => setCuePlace(event.target.value)} /></label>
          </p>
          {message && <p>{message}</p>}
        </div>
        <button onClick={() => void save()}>保存承诺</button>
      </article>
      {habit && <article>
        <div>
          <h3>{habit.streak.currentWeeks > 0 ? `连续训练第 ${habit.streak.currentWeeks} 周` : "本周开始你的第一周"}</h3>
          <p>最长纪录 {habit.streak.longestWeeks} 周 · 累计 {habit.totalSessions} 次训练{habit.streak.activeThisWeek ? " · 本周已达标" : ""}。完成 20 分钟缩短版同样算数。</p>
          {habit.milestones.length > 0 && <p>{habit.milestones.at(-1)!.title.zh} — {habit.milestones.at(-1)!.message.zh}</p>}
        </div>
      </article>}
    </div>
  </section>;
}
