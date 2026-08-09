"use client";

import { useEffect, useState } from "react";
import ProductShell from "../components/product-shell";
import { beginCmineLogin } from "../lib/auth";

type ReviewEngine = { deloadRecommended?: boolean; deloadReason?: { zh: string } | null; adjustmentCount?: number; stagnationCount?: number; teaser?: { zh: string } | null };
type Review = { id: string; weekStart: string; status: string; plateau: boolean; metrics?: { completedSessions: number; adherencePct: number; averageRpe: number | null; maxPain: number; weightTrendKgPerWeek: number | null }; recommendation?: { title: string; explanation: string; changes: string[]; locked?: boolean; engine?: ReviewEngine } };
export default function ProgressClient() {
  const [reviews, setReviews] = useState<Review[]>([]); const [recovery, setRecovery] = useState(3); const [sleep, setSleep] = useState(3); const [pain, setPain] = useState(0); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const load = async () => { const response = await fetch("/api/v1/reviews", { cache: "no-store" }); if (response.status === 401) { await beginCmineLogin("/progress"); return; } if (response.ok) setReviews((await response.json() as { reviews: Review[] }).reviews); };
  useEffect(() => {
    void fetch("/api/v1/reviews", { cache: "no-store" }).then(async (response) => {
      if (response.status === 401) { await beginCmineLogin("/progress"); return; }
      if (response.ok) setReviews((await response.json() as { reviews: Review[] }).reviews);
    });
  }, []); const current = reviews[0];
  const generate = async () => { if (!current) return; setBusy(true); setMessage(""); const checked = await fetch(`/api/v1/reviews/${current.id}/check-in`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recovery, sleep, pain }) }); if (checked.ok) { const generated = await fetch(`/api/v1/reviews/${current.id}/generate`, { method: "POST" }); if (!generated.ok) setMessage((await generated.json().catch(() => null) as { message?: string } | null)?.message || "复盘生成失败。"); } await load(); setBusy(false); };
  const decide = async (decision: "accept" | "reject") => { if (!current) return; setBusy(true); const response = await fetch(`/api/v1/reviews/${current.id}/${decision}`, { method: "POST" }); setMessage(response.ok ? decision === "accept" ? "新计划版本已启用，旧版本仍可追溯。" : "已保留当前计划。" : "操作失败，请重试。"); await load(); setBusy(false); };
  return <ProductShell active="/progress" eyebrow="PROGRESS / 长期进度" title="看清变化，再决定下一步">
    <div className="progress-grid"><section className="review-card"><span>本周复盘</span><h2>{current?.recommendation?.title || "先告诉我们这一周的恢复情况"}</h2>{current?.recommendation ? <><p>{current.recommendation.explanation}</p><div className="review-metrics"><article><b>{current.metrics?.adherencePct || 0}%</b><span>完成率</span></article><article><b>{current.metrics?.completedSessions || 0}</b><span>有效训练</span></article><article><b>{current.metrics?.averageRpe ?? "—"}</b><span>平均 RPE</span></article><article><b>{current.metrics?.maxPain || 0}/10</b><span>最高疼痛</span></article></div>{current.recommendation.locked ? <>
        {current.recommendation.engine?.deloadRecommended && current.recommendation.engine.deloadReason && <p>{current.recommendation.engine.deloadReason.zh}</p>}
        <p>教练引擎在你的数据里找到了 {current.recommendation.engine?.adjustmentCount || 0} 条针对性调整{(current.recommendation.engine?.stagnationCount || 0) > 0 ? `，并检测到 ${current.recommendation.engine!.stagnationCount} 个停滞动作` : ""}。{current.recommendation.engine?.teaser?.zh || ""}</p>
        <div className="review-actions"><a className="review-generate" href="/pricing">升级 Pro，解锁并一键采纳完整调整方案 →</a></div>
      </> : <><ul>{current.recommendation.changes.map((change) => <li key={change}>{change}</li>)}</ul>{current.status === "generated" && <div className="review-actions"><button onClick={() => void decide("reject")}>保留当前计划</button><button onClick={() => void decide("accept")}>接受并启用调整</button></div>}</>}</> : <><div className="review-sliders"><label>恢复状态 <b>{recovery}/5</b><input type="range" min="1" max="5" value={recovery} onChange={(event) => setRecovery(Number(event.target.value))} /></label><label>睡眠质量 <b>{sleep}/5</b><input type="range" min="1" max="5" value={sleep} onChange={(event) => setSleep(Number(event.target.value))} /></label><label>疼痛程度 <b>{pain}/10</b><input type="range" min="0" max="10" value={pain} onChange={(event) => setPain(Number(event.target.value))} /></label></div><button className="review-generate" disabled={busy} onClick={() => void generate()}>{busy ? "正在分析…" : "生成本周复盘 →"}</button></>}{message && <p className="form-message">{message}</p>}</section>
      <aside className="review-history"><span>历史复盘</span>{reviews.slice(1).map((review) => <article key={review.id}><small>{review.weekStart}</small><b>{review.recommendation?.title || "记录收集中"}</b><em>{review.status}</em></article>)}{reviews.length <= 1 && <p>完成几周训练后，趋势和计划版本会显示在这里。</p>}</aside></div>
    <ProgressCharts />
  </ProductShell>;
}

type Series = {
  weeks: Array<{ weekStart: string; tonnageKg: number; sets: number; sessions: number }>;
  exercises: Array<{ exerciseId: string; name: { zh: string; en: string }; points: Array<{ date: string; e1rm: number }>; changePct: number | null }>;
  weight: Array<{ date: string; weightKg: number }>;
  planVersions: Array<{ date: string; versionNumber: number }>;
};

const shortDate = (value: string) => value.slice(5).replace("-", "/");

// Charts are plain inline SVG: no chart library, no external requests, and the
// same numbers are always available as text for screen readers.
function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 100;
    const y = 28 - ((value - min) / span) * 24;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
  return <svg viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label={label} style={{ width: "100%", height: 40 }}>
    <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
  </svg>;
}

function ProgressCharts() {
  const [series, setSeries] = useState<Series | null>(null);
  useEffect(() => {
    void fetch("/api/v1/progress/series", { cache: "no-store" }).then((response) => response.ok ? response.json() : null)
      .then((data: Series | null) => setSeries(data)).catch(() => undefined);
  }, []);
  if (!series) return null;
  const hasAnything = series.weeks.length > 0 || series.exercises.length > 0 || series.weight.length > 1;
  if (!hasAnything) {
    return <section className="review-card"><span>进步曲线</span><h2>还没有足够的训练记录</h2><p>完成并记录几次带重量的训练后，这里会显示每周训练量和主要动作的估算 1RM 趋势。</p></section>;
  }
  const maxTonnage = Math.max(1, ...series.weeks.map((week) => week.tonnageKg));
  const totalTonnage = series.weeks.reduce((sum, week) => sum + week.tonnageKg, 0);
  return <section className="review-card" id="charts">
    <span>进步曲线</span>
    <h2>看得见的变化</h2>
    <p>累计训练量 {Math.round(totalTonnage / 1000).toLocaleString()} 吨 · 共 {series.weeks.reduce((sum, week) => sum + week.sessions, 0)} 次训练记录。以下数据全部来自你实际记录的组数，未做平滑处理。</p>

    {series.weeks.length > 0 && <>
      <h3>每周训练量（kg）</h3>
      <div role="img" aria-label={`每周训练量：${series.weeks.map((week) => `${week.weekStart} ${week.tonnageKg} kg`).join("，")}`}
        style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 96, marginBottom: 8 }}>
        {series.weeks.map((week) => <div key={week.weekStart} title={`${week.weekStart}：${week.tonnageKg.toLocaleString()} kg · ${week.sessions} 次训练`}
          style={{ flex: 1, minWidth: 6, height: `${Math.max(3, (week.tonnageKg / maxTonnage) * 100)}%`, background: "currentColor", opacity: 0.75 }} />)}
      </div>
      <p><small>{shortDate(series.weeks[0].weekStart)} — {shortDate(series.weeks[series.weeks.length - 1].weekStart)}，峰值 {maxTonnage.toLocaleString()} kg</small></p>
    </>}

    {series.exercises.length > 0 && <>
      <h3>主要动作估算 1RM</h3>
      <div className="review-metrics">
        {series.exercises.map((exercise) => <article key={exercise.exerciseId}>
          <b>{exercise.points[exercise.points.length - 1].e1rm} kg</b>
          <span>{exercise.name.zh}{exercise.changePct !== null ? `　${exercise.changePct > 0 ? "+" : ""}${exercise.changePct}%` : ""}</span>
          <Sparkline values={exercise.points.map((point) => point.e1rm)}
            label={`${exercise.name.zh} 估算 1RM 从 ${exercise.points[0].e1rm} kg 到 ${exercise.points[exercise.points.length - 1].e1rm} kg`} />
        </article>)}
      </div>
      <p><small>估算 1RM 按 Epley 公式从你完成的组数换算，用于观察趋势，不建议直接当作实测最大重量。</small></p>
    </>}

    {series.weight.length > 1 && <>
      <h3>体重趋势</h3>
      <Sparkline values={series.weight.map((point) => point.weightKg)}
        label={`体重从 ${series.weight[0].weightKg} kg 到 ${series.weight[series.weight.length - 1].weightKg} kg`} />
      <p><small>{shortDate(series.weight[0].date)} {series.weight[0].weightKg} kg → {shortDate(series.weight[series.weight.length - 1].date)} {series.weight[series.weight.length - 1].weightKg} kg
        {series.planVersions.length > 0 ? `　·　期间计划调整 ${series.planVersions.length} 次（最近 ${shortDate(series.planVersions[series.planVersions.length - 1].date)}）` : ""}</small></p>
    </>}
  </section>;
}
