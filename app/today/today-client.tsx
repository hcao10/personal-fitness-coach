/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useState } from "react";
import ProductShell from "../components/product-shell";
import type { CoachPlan, PlannedExercise, Profile } from "../lib/coach";
import { beginCmineLogin } from "../lib/auth";

type StoredSet = { id?: string; exerciseId: string; setIndex: number; setType: string; targetReps?: string | null; weightKg: number | null; reps: number | null; rir: number | null; rpe: number | null; completed: boolean };
type Account = { user: { name?: string | null }; latestPlan: { id: string; plan: CoachPlan; profile: Profile } | null; progress: { completedWorkouts: number }; product: { membership: { tier: string }; usage: { capabilities: Record<string, { remaining: number }> } } };

const setKey = (exerciseId: string, setIndex: number) => `${exerciseId}:${setIndex}`;
const parseRepTarget = (value: string) => Number((value.match(/\d+/) || ["10"])[0]);
const defaultSet = (exercise: PlannedExercise, setIndex: number, intermediate: boolean): StoredSet => ({
  exerciseId: exercise.id,
  setIndex,
  setType: setIndex === 0 && intermediate ? "warmup" : "working",
  targetReps: exercise.reps,
  weightKg: null,
  reps: parseRepTarget(exercise.reps),
  rir: intermediate ? exercise.targetRir ?? 2 : null,
  rpe: null,
  completed: false,
});

export default function TodayClient() {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [rpe, setRpe] = useState(7);
  const [pain, setPain] = useState(0);
  const [duration, setDuration] = useState(30);
  const [mode, setMode] = useState<"standard" | "short">("standard");
  const [sets, setSets] = useState<Record<string, StoredSet>>({});
  const [savingSet, setSavingSet] = useState<string | null>(null);
  const [timer, setTimer] = useState(0);

  const dayIndex = (new Date().getDay() + 6) % 7;
  const plan = account?.latestPlan;
  const planId = plan?.id;
  const day = plan?.plan.schedule[dayIndex];
  const intermediate = plan?.profile.trainingTrack === "intermediate_hypertrophy" || plan?.profile.experience === "intermediate" || plan?.profile.experience === "advanced";

  useEffect(() => { void fetch("/api/v1/me", { cache: "no-store" }).then(async (response) => {
    if (response.status === 401) { await beginCmineLogin("/today"); return; }
    if (response.ok) {
      const value = await response.json() as Account;
      setAccount(value);
      const today = value.latestPlan?.plan.schedule[dayIndex];
      if (today) setDuration(today.duration);
    }
    setLoading(false);
  }); }, [dayIndex]);

  useEffect(() => {
    if (!planId) return;
    let active = true;
    void fetch(`/api/v1/workouts/${planId}/sets?dayIndex=${dayIndex}`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const body = await response.json() as { sets?: StoredSet[] };
      if (active) setSets((current) => ({ ...current, ...Object.fromEntries((body.sets || []).map((item) => [setKey(item.exerciseId, item.setIndex), item])) }));
    });
    return () => { active = false; };
  }, [planId, dayIndex]);

  useEffect(() => {
    if (timer <= 0) return;
    const interval = window.setInterval(() => setTimer((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(interval);
  }, [timer]);

  const visibleExercises = useMemo(() => {
    if (!day) return [];
    if (mode === "standard") return day.exercises;
    return day.exercises.slice(0, Math.max(2, Math.ceil(day.exercises.length * .6)));
  }, [day, mode]);
  const completedSets = Object.values(sets).filter((item) => item.completed).length;
  const requiredSets = visibleExercises.reduce((sum, exercise) => sum + exercise.sets, 0);

  const saveSet = async (exercise: PlannedExercise, setIndex: number, patch: Partial<StoredSet> = {}) => {
    if (!plan) return;
    const key = setKey(exercise.id, setIndex);
    const next = { ...defaultSet(exercise, setIndex, intermediate), ...sets[key], ...patch } as StoredSet;
    setSets((current) => ({ ...current, [key]: next }));
    setSavingSet(key);
    const response = await fetch(`/api/v1/workouts/${plan.id}/sets`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...next, dayIndex, targetReps: exercise.reps, clientMutationId: `${plan.id}:${dayIndex}:${key}` }) });
    setSavingSet(null);
    if (!response.ok) setMessage("这组暂时没有保存成功，请再试一次。");
    if (patch.completed) setTimer(exercise.restSeconds || Number.parseInt(exercise.rest) || 60);
  };

  const complete = async () => {
    if (!plan) return;
    if (!day?.restDay && requiredSets > 0 && completedSets === 0) { setMessage("请先至少记录一组训练，再完成今天的训练。"); return; }
    const response = await fetch(`/api/v1/workouts/${plan.id}/complete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dayIndex, durationMinutes: duration, rpe, pain, notes: `${mode === "short" ? "完成缩短版。" : ""}${pain >= 4 ? ` 疼痛 ${pain}/10。` : ""}`.trim() }) });
    setMessage(response.ok ? "今天的训练已记录。Coach 会在周度复盘中使用组次和恢复反馈。" : "记录失败，请重试。");
  };

  const reschedule = () => {
    const next = new Date(); next.setDate(next.getDate() + 1);
    setMessage(`已保留今天的记录草稿。建议改到 ${next.toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}，之后可让 Coach 调整本周安排。`);
  };

  if (loading) return <div className="product-loading">正在准备今天的训练…</div>;

  return <ProductShell active="/today" eyebrow="TODAY / 今日训练" title={`${account?.user.name || "你好"}，今天按自己的节奏来`} action={<div className="header-actions-inline"><a className="header-chip" href="/exercises">动作目录</a><a className="header-chip" href="/plans/new">调整计划 ↗</a></div>}>
    {!plan ? <section className="empty-product"><span>NO ACTIVE PLAN</span><h2>先建立一份真正适合你的计划</h2><p>完成 2–3 分钟建档后，系统会计算基础指标并由 AI 编排完整训练周。</p><a href="/onboarding">开始建档 →</a></section> : <>
      <div className="workout-options" aria-label="今日训练版本"><button className={mode === "standard" ? "active" : ""} onClick={() => setMode("standard")}><b>按计划完成</b><span>{day?.duration || 0} 分钟</span></button><button className={mode === "short" ? "active" : ""} onClick={() => setMode("short")}><b>缩短版</b><span>保留关键动作</span></button><button onClick={reschedule}><b>改日完成</b><span>保留草稿</span></button></div>
      <div className="today-grid">
        <section className="today-workout"><div className="today-kicker"><span>DAY {dayIndex + 1} · {intermediate ? "中级增肌" : "新手减脂"}</span><b>{mode === "short" ? Math.max(20, Math.round((day?.duration || 30) * .65)) : day?.duration || 0} MIN</b></div><h2>{day?.title.zh}</h2><p>{day?.focus.zh}</p>
          {day?.restDay ? <div className="rest-day-card"><b>恢复日</b><p>轻松步行、活动度练习和充足睡眠，就是今天的计划。</p></div> : <div className="workout-player">
            {visibleExercises.map((exercise, exerciseIndex) => <article className="exercise-player" key={exercise.id}>
              <header><img src={`/exercises/${exercise.asset}.jpg`} alt="" /><div><span>{String(exerciseIndex + 1).padStart(2, "0")} · {exercise.target.zh}</span><h3>{exercise.name.zh}</h3><p>{exercise.cue.zh}</p></div><button type="button" onClick={() => window.open(`/exercises/${exercise.asset}.gif`, "_blank", "noopener,noreferrer")}>动作示范 ↗</button></header>
              <div className={`set-table ${intermediate ? "advanced" : "simple"}`}><div className="set-row set-head"><span>组</span><span>类型</span><span>重量 kg</span><span>次数</span>{intermediate && <span>RIR</span>}<span>完成</span></div>
                {Array.from({ length: exercise.sets }, (_, setIndex) => {
                  const key = setKey(exercise.id, setIndex); const value = sets[key] || defaultSet(exercise, setIndex, intermediate);
                  return <div className={`set-row ${value.completed ? "done" : ""}`} key={key}><b>{setIndex + 1}</b><select aria-label={`第 ${setIndex + 1} 组类型`} value={value.setType} onChange={(event) => setSets((current) => ({ ...current, [key]: { ...value, setType: event.target.value } }))} disabled={!intermediate}><option value="warmup">热身</option><option value="working">正式</option><option value="dropset">递减</option><option value="failure">力竭</option></select><input aria-label={`第 ${setIndex + 1} 组重量`} inputMode="decimal" type="number" min="0" step=".5" value={value.weightKg ?? ""} placeholder={intermediate ? "上次" : "可选"} onChange={(event) => setSets((current) => ({ ...current, [key]: { ...value, weightKg: event.target.value === "" ? null : Number(event.target.value) } }))} /><input aria-label={`第 ${setIndex + 1} 组次数`} inputMode="numeric" type="number" min="0" value={value.reps ?? ""} onChange={(event) => setSets((current) => ({ ...current, [key]: { ...value, reps: event.target.value === "" ? null : Number(event.target.value) } }))} />{intermediate && <input aria-label={`第 ${setIndex + 1} 组剩余次数`} inputMode="decimal" type="number" min="0" max="10" step=".5" value={value.rir ?? ""} onChange={(event) => setSets((current) => ({ ...current, [key]: { ...value, rir: event.target.value === "" ? null : Number(event.target.value) } }))} />}<button className="set-complete" disabled={savingSet === key} onClick={() => void saveSet(exercise, setIndex, { completed: !value.completed })}>{savingSet === key ? "…" : value.completed ? "✓" : "完成"}</button></div>;
                })}
              </div><footer><span>{exercise.sets} 组 · {exercise.reps} 次 · 休息 {exercise.rest}</span>{intermediate && exercise.progression && <small>{exercise.progression.zh}</small>}</footer>
            </article>)}
          </div>}
        </section>
        <aside className="today-feedback"><span>训练进度</span><h3>{completedSets}/{requiredSets || 0} 组完成</h3>{timer > 0 && <div className="rest-timer"><span>休息计时</span><b>{Math.floor(timer / 60)}:{String(timer % 60).padStart(2, "0")}</b><button onClick={() => setTimer(0)}>跳过</button></div>}<label>训练时长<b>{duration} 分钟</b><input type="range" min="10" max="120" step="5" value={duration} onChange={(event) => setDuration(Number(event.target.value))} /></label><label>主观强度 RPE<b>{rpe}/10</b><input type="range" min="1" max="10" value={rpe} onChange={(event) => setRpe(Number(event.target.value))} /></label><label>疼痛程度<b>{pain}/10</b><input type="range" min="0" max="10" value={pain} onChange={(event) => setPain(Number(event.target.value))} /></label>{pain >= 4 && <div className="pain-warning">请停止引发疼痛的动作。若疼痛持续或加重，请咨询专业人员。</div>}<button onClick={() => void complete()}>完成并记录训练 →</button>{message && <p>{message}</p>}</aside>
      </div></>}
  </ProductShell>;
}
