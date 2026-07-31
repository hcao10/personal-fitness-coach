"use client";

import { useEffect, useState } from "react";
import ProductShell from "../components/product-shell";
import type { CoachPlan } from "../lib/coach";
import { beginCmineLogin } from "../lib/auth";

type Account = { user: { name?: string | null }; latestPlan: { id: string; plan: CoachPlan } | null; progress: { completedWorkouts: number }; product: { membership: { tier: string }; usage: { capabilities: Record<string, { remaining: number }> } } };

export default function TodayClient() {
  const [account, setAccount] = useState<Account | null>(null); const [loading, setLoading] = useState(true); const [message, setMessage] = useState("");
  const [rpe, setRpe] = useState(7); const [pain, setPain] = useState(0); const [duration, setDuration] = useState(50);
  useEffect(() => { void fetch("/api/v1/me", { cache: "no-store" }).then(async (response) => {
    if (response.status === 401) { await beginCmineLogin("/today"); return; }
    if (response.ok) setAccount(await response.json() as Account); setLoading(false);
  }); }, []);
  if (loading) return <div className="product-loading">正在准备今天的训练…</div>;
  const plan = account?.latestPlan; const index = (new Date().getDay() + 6) % 7; const day = plan?.plan.schedule[index];
  const complete = async () => {
    if (!plan) return; const response = await fetch(`/api/v1/workouts/${plan.id}/complete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dayIndex: index, durationMinutes: duration, rpe, pain: pain >= 1, notes: pain >= 4 ? `疼痛 ${pain}/10` : "" }) });
    setMessage(response.ok ? "今天的训练已记录。Coach 会在周度复盘中使用这条反馈。" : "记录失败，请重试。");
  };
  return <ProductShell active="/today" eyebrow="TODAY / 今日训练" title={`${account?.user.name || "你好"}，今天按自己的节奏来`} action={<a className="header-chip" href="/plans/new">调整计划 ↗</a>}>
    {!plan ? <section className="empty-product"><span>NO ACTIVE PLAN</span><h2>先建立一份真正适合你的计划</h2><p>完成 2–3 分钟建档后，系统会计算基础指标并由 AI 编排完整训练周。</p><a href="/onboarding">开始建档 →</a></section> : <div className="today-grid">
      <section className="today-workout"><div className="today-kicker"><span>DAY {index + 1}</span><b>{day?.duration || 0} MIN</b></div><h2>{day?.title.zh}</h2><p>{day?.focus.zh}</p>
        {day?.restDay ? <div className="rest-day-card"><b>恢复日</b><p>轻松步行、活动度练习和充足睡眠，就是今天的计划。</p></div> : <div className="today-exercises">{day?.exercises.map((exercise, exerciseIndex) => <article key={exercise.id}><span>{String(exerciseIndex + 1).padStart(2, "0")}</span><div><b>{exercise.name.zh}</b><small>{exercise.target.zh}</small></div><p>{exercise.sets} 组 · {exercise.reps} 次 · {exercise.rest}</p></article>)}</div>}
      </section>
      <aside className="today-feedback"><span>训练后反馈</span><h3>今天感觉怎么样？</h3><label>训练时长<b>{duration} 分钟</b><input type="range" min="10" max="120" step="5" value={duration} onChange={(event) => setDuration(Number(event.target.value))} /></label><label>主观强度 RPE<b>{rpe}/10</b><input type="range" min="1" max="10" value={rpe} onChange={(event) => setRpe(Number(event.target.value))} /></label><label>疼痛程度<b>{pain}/10</b><input type="range" min="0" max="10" value={pain} onChange={(event) => setPain(Number(event.target.value))} /></label>{pain >= 4 && <div className="pain-warning">请停止引发疼痛的动作。若疼痛持续或加重，请咨询专业人员。</div>}<button onClick={() => void complete()}>完成并记录训练 →</button>{message && <p>{message}</p>}</aside>
    </div>}
  </ProductShell>;
}
