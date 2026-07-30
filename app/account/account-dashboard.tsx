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
  const [notice, setNotice] = useState("");

  const loadAccount = async () => {
    setLoading(true);
    const response = await fetch("/api/v1/me", { cache: "no-store" }).catch(() => null);
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
    if (!window.confirm("确定删除 Cmine Fit 内的训练、计划和进度数据吗？该操作无法撤销，也不会删除你的 Cmine ID。")) return;
    const response = await fetch("/api/v1/me", { method: "DELETE" });
    if (response.ok) window.location.assign("/");
    else setNotice("暂时无法删除账号数据，请稍后重试。");
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
        <a href="#today"><span>01</span>今日训练</a>
        <a href="#plans"><span>02</span>计划历史</a>
        <a href="#progress"><span>03</span>身体进度</a>
        <a href="#profile"><span>04</span>训练档案</a>
        <a href="#account"><span>05</span>账号与数据</a>
      </nav>
      <div className="account-user">
        <span>{(data.user.name || data.user.email || "C").slice(0, 1).toUpperCase()}</span>
        <div><b>{data.user.name || "Cmine Fit 用户"}</b><small>{data.user.email}</small></div>
      </div>
    </aside>

    <section className="account-main">
      <header className="account-topbar">
        <div><span>CMINE FIT / MY TRAINING</span><strong>我的训练</strong></div>
        <div><Link href="/">生成新计划 ↗</Link><button onClick={async () => { await signOutCmine(); window.location.assign("/"); }}>安全退出</button></div>
      </header>

      <section className="account-hero" id="today">
        <div>
          <span>欢迎回来，{data.user.name?.split(" ")[0] || "今天也在进步的你"}</span>
          <h1>{todayPlan?.restDay ? "今天，把恢复也认真完成。" : todayPlan ? todayPlan.title.zh : "从第一份专属计划开始。"}</h1>
          <p>{todayPlan?.focus.zh || "更新训练档案后，让 AI 根据你的目标和现实条件安排完整一周。"}</p>
          {data.latestPlan ? <Link href="/#plan">查看当前计划 <b>→</b></Link> : <Link href="/#coach">生成第一份计划 <b>→</b></Link>}
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
        <article><span>当前积分</span><b>{data.points}</b><small>只来自已验证事件</small></article>
      </div>

      <section className="account-panel" id="plans">
        <div className="account-section-title"><div><span>02 / PLAN HISTORY</span><h2>计划历史</h2></div><p>每次生成都会保留当时的身体资料、模型版本和完整计划。</p></div>
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
        <div className="account-section-title"><div><span>03 / PROGRESS</span><h2>身体进度</h2></div><p>看长期趋势，不被某一天的波动打乱节奏。</p></div>
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
        <div className="account-section-title"><div><span>04 / TRAINING PROFILE</span><h2>训练档案</h2></div><p>更新后会用于下一次 AI 规划，不会改写已有计划。</p></div>
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
          <label className="profile-limitations"><span>伤病、疼痛或需要避开的动作</span><input value={profile.limitations} onChange={(event) => setProfile({ ...profile, limitations: event.target.value })} placeholder="没有可留空" /></label>
          <button onClick={() => void saveProfile()} disabled={savingProfile}>{savingProfile ? "正在保存…" : "保存训练档案 →"}</button>
        </div>
      </section>

      <section className="account-panel account-data-panel" id="account">
        <div className="account-section-title"><div><span>05 / ACCOUNT & DATA</span><h2>账号与数据</h2></div><p>Cmine Fit 数据与你的 Cmine ID 身份分开管理。</p></div>
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
