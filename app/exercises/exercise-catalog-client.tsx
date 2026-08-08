/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import ProductShell from "../components/product-shell";
import { beginCmineLogin } from "../lib/auth";

type Exercise = { id: string; name: string; bodyPart: string; target: string; muscleGroup: string; secondaryMuscles: string[]; equipment: string; instructions: { zh?: string[]; en?: string[] }; asset: string | null; attribution?: string };

export default function ExerciseCatalogClient() {
  const [query, setQuery] = useState(""); const [equipment, setEquipment] = useState(""); const [items, setItems] = useState<Exercise[]>([]);
  const [total, setTotal] = useState(0); const [selected, setSelected] = useState<Exercise | null>(null); const [loading, setLoading] = useState(true);
  const search = async (nextQuery = query, nextEquipment = equipment) => {
    setLoading(true); const params = new URLSearchParams({ q: nextQuery, equipment: nextEquipment, limit: "36" });
    const response = await fetch(`/api/v1/exercises/search?${params}`, { cache: "no-store" });
    if (response.status === 401) { await beginCmineLogin("/exercises"); return; }
    if (response.ok) { const body = await response.json() as { total: number; exercises: Exercise[] }; setTotal(body.total); setItems(body.exercises); }
    setLoading(false);
  };
  useEffect(() => {
    let active = true;
    void fetch("/api/v1/exercises/search?q=&equipment=&limit=36", { cache: "no-store" }).then(async (response) => {
      if (response.status === 401) { await beginCmineLogin("/exercises"); return; }
      if (response.ok && active) { const body = await response.json() as { total: number; exercises: Exercise[] }; setTotal(body.total); setItems(body.exercises); setLoading(false); }
    });
    return () => { active = false; };
  }, []);
  return <ProductShell active="" eyebrow="EXERCISE CATALOG / 动作目录" title="看懂动作，再开始训练" action={<a className="header-chip" href="/today">返回今日训练</a>}>
    <section className="exercise-catalog-tools"><div><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void search()} placeholder="搜索动作、肌群或部位" /><select value={equipment} onChange={(event) => { setEquipment(event.target.value); void search(query, event.target.value); }}><option value="">全部器械</option><option value="body weight">徒手</option><option value="dumbbell">哑铃</option><option value="barbell">杠铃</option><option value="cable">绳索</option><option value="band">弹力带</option><option value="leverage machine">固定器械</option></select><button onClick={() => void search()}>搜索</button></div><p>目录收录 {total || "—"} 个动作可供浏览；AI 训练计划当前使用其中经过安全审核的动作子集。目录中的动作不会未经确认直接替换你的计划。</p></section>
    {loading ? <div className="account-empty">正在加载动作目录…</div> : <section className="exercise-catalog-grid">{items.map((exercise) => <button key={exercise.id} onClick={() => setSelected(exercise)}><div>{exercise.asset ? <img src={`/exercises/${exercise.asset}.jpg`} alt="" /> : <span>{exercise.target.slice(0, 1).toUpperCase()}</span>}</div><small>{exercise.equipment} · {exercise.bodyPart}</small><b>{exercise.name}</b><p>{exercise.target}{exercise.muscleGroup ? ` · ${exercise.muscleGroup}` : ""}</p></button>)}</section>}
    {selected && <div className="exercise-detail-backdrop" role="presentation" onClick={() => setSelected(null)}><section className="exercise-detail" role="dialog" aria-modal="true" aria-label={selected.name} onClick={(event) => event.stopPropagation()}><button className="exercise-detail-close" onClick={() => setSelected(null)}>关闭</button>{selected.asset && <img src={`/exercises/${selected.asset}.gif`} alt={`${selected.name} 动作示范`} />}<span>{selected.equipment} · {selected.bodyPart}</span><h2>{selected.name}</h2><p>主要目标：{selected.target}<br />协同肌群：{[selected.muscleGroup, ...(selected.secondaryMuscles || [])].filter(Boolean).join("、") || "未标注"}</p><ol>{(selected.instructions.zh?.length ? selected.instructions.zh : selected.instructions.en || []).map((step, index) => <li key={`${index}:${step}`}>{step}</li>)}</ol>{selected.attribution && <small>{selected.attribution}</small>}<a href={`/coach?prompt=${encodeURIComponent(`我想把当前动作替换为 ${selected.name}，请根据我的计划、器械和动作限制判断是否适合。`)}`}>请 Coach 判断能否替换 →</a></section></div>}
  </ProductShell>;
}
