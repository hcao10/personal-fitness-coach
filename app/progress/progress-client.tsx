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
  </ProductShell>;
}
