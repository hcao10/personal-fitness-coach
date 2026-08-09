/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ProductShell from "../components/product-shell";
import type { CoachPlan, PlannedExercise, Profile, WorkoutDay } from "../lib/coach";
import { beginCmineLogin } from "../lib/auth";
import { useDialog } from "../lib/use-dialog";

type StoredSet = { id?: string; exerciseId: string; setIndex: number; setType: string; targetReps?: string | null; weightKg: number | null; reps: number | null; rir: number | null; rpe: number | null; completed: boolean };
type Account = { user: { name?: string | null }; latestPlan: { id: string; plan: CoachPlan; profile: Profile } | null };
type Mode = "standard" | "short" | "recovery";
type CoachHome = {
  brief: { headline: string; summary: string; priorities: string[]; dataState: string };
  phase: { kind: string; lengthWeeks: number; currentWeek: number; progressPct: number; weeklyFocus: Array<{ zh: string }> } | null;
  today: { occurrenceId: string | null; scheduledDate: string; dayIndex: number; status: string; mode: Mode; workout: WorkoutDay } | null;
};
type Checkin = { recommendation: { mode: Mode | "reschedule"; title: string; explanation: string; stopConditions: string[] } };

const setKey = (exerciseId: string, setIndex: number) => `${exerciseId}:${setIndex}`;
const parseRepTarget = (value: string) => Number((value.match(/\d+/) || ["10"])[0]);
const defaultSet = (exercise: PlannedExercise, setIndex: number, intermediate: boolean): StoredSet => ({
  exerciseId: exercise.id, setIndex, setType: setIndex === 0 && intermediate ? "warmup" : "working",
  targetReps: exercise.reps, weightKg: null, reps: parseRepTarget(exercise.reps), rir: intermediate ? exercise.targetRir ?? 2 : null, rpe: null, completed: false,
});
const addDays = (date: string, days: number) => { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + days); return value.toISOString().slice(0, 10); };

export default function TodayClient() {
  const [account, setAccount] = useState<Account | null>(null);
  const [home, setHome] = useState<CoachHome | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [rpe, setRpe] = useState(7);
  const [pain, setPain] = useState(0);
  const [duration, setDuration] = useState(30);
  const [mode, setMode] = useState<Mode>("standard");
  const [sets, setSets] = useState<Record<string, StoredSet>>({});
  const [savingSet, setSavingSet] = useState<string | null>(null);
  const [timer, setTimer] = useState(0);
  const [energy, setEnergy] = useState(3);
  const [soreness, setSoreness] = useState(2);
  const [availableMinutes, setAvailableMinutes] = useState(45);
  const [checkin, setCheckin] = useState<Checkin | null>(null);
  const [checking, setChecking] = useState(false);
  const [mediaExercise, setMediaExercise] = useState<PlannedExercise | null>(null);
  const mediaDialogRef = useDialog(Boolean(mediaExercise), () => setMediaExercise(null));
  const [rescheduleDate, setRescheduleDate] = useState("");

  const plan = account?.latestPlan;
  const planId = plan?.id;
  const occurrence = home?.today;
  const dayIndex = occurrence?.dayIndex ?? 0;
  const day = occurrence?.workout || plan?.plan.schedule[dayIndex];
  const occurrenceId = occurrence?.occurrenceId || null;
  const intermediate = plan?.profile.trainingTrack === "intermediate_hypertrophy" || plan?.profile.experience === "intermediate" || plan?.profile.experience === "advanced";

  const load = async () => {
    const [accountResponse, homeResponse] = await Promise.all([
      fetch("/api/v1/me", { cache: "no-store" }), fetch("/api/v1/coach/home", { cache: "no-store" }),
    ]);
    if (accountResponse.status === 401 || homeResponse.status === 401) { await beginCmineLogin("/today"); return; }
    if (accountResponse.ok) setAccount(await accountResponse.json() as Account);
    if (homeResponse.ok) {
      const value = await homeResponse.json() as CoachHome;
      setHome(value); setMode(value.today?.mode || "standard"); setDuration(value.today?.workout.duration || 30);
      if (value.today?.scheduledDate) setRescheduleDate(addDays(value.today.scheduledDate, 1));
    }
    setLoading(false);
  };

  useEffect(() => { const task = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(task); }, []);

  useEffect(() => {
    if (!planId || !occurrence) return;
    let active = true;
    const query = occurrenceId ? `&occurrenceId=${encodeURIComponent(occurrenceId)}` : "";
    void fetch(`/api/v1/workouts/${planId}/sets?dayIndex=${dayIndex}${query}`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const body = await response.json() as { sets?: StoredSet[] };
      if (active) setSets(Object.fromEntries((body.sets || []).map((item) => [setKey(item.exerciseId, item.setIndex), item])));
    });
    return () => { active = false; };
  }, [planId, dayIndex, occurrenceId, occurrence]);

  useEffect(() => {
    if (timer <= 0) return;
    const interval = window.setInterval(() => setTimer((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(interval);
  }, [timer]);

  const visibleExercises = useMemo(() => {
    if (!day) return [];
    if (mode === "standard") return day.exercises;
    const ids = mode === "short" ? day.variants?.short.exerciseIds : day.variants?.recovery.exerciseIds;
    return ids?.length ? day.exercises.filter((exercise) => ids.includes(exercise.id)) : day.exercises.slice(0, Math.max(1, Math.ceil(day.exercises.length * (mode === "short" ? .6 : .4))));
  }, [day, mode]);
  const completedSets = Object.values(sets).filter((item) => item.completed).length;
  const requiredSets = visibleExercises.reduce((sum, exercise) => sum + exercise.sets, 0);
  const displayDuration = mode === "short" ? day?.variants?.short.duration : mode === "recovery" ? day?.variants?.recovery.duration : day?.duration;

  const saveSet = async (exercise: PlannedExercise, setIndex: number, patch: Partial<StoredSet> = {}) => {
    if (!plan) return;
    const key = setKey(exercise.id, setIndex);
    const next = { ...defaultSet(exercise, setIndex, intermediate), ...sets[key], ...patch } as StoredSet;
    setSets((current) => ({ ...current, [key]: next })); setSavingSet(key);
    const response = await fetch(`/api/v1/workouts/${plan.id}/sets`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...next, occurrenceId, dayIndex, targetReps: exercise.reps, clientMutationId: `${occurrenceId || plan.id}:${key}` }),
    });
    setSavingSet(null);
    if (!response.ok) setMessage("这组暂时没有保存成功，请再试一次。");
    if (patch.completed) setTimer(exercise.restSeconds || Number.parseInt(exercise.rest) || 60);
  };

  const submitCheckin = async () => {
    setChecking(true); setMessage("");
    const response = await fetch("/api/v1/coach/check-ins", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ occurrenceId, energy, soreness, pain, availableMinutes }) });
    setChecking(false);
    if (!response.ok) return setMessage("状态检查暂时没有保存，请重试。");
    const value = (await response.json() as { checkin: Checkin }).checkin;
    setCheckin(value);
    if (value.recommendation.mode !== "reschedule") {
      setMode(value.recommendation.mode);
      const recommended = value.recommendation.mode === "short" ? day?.variants?.short.duration : value.recommendation.mode === "recovery" ? day?.variants?.recovery.duration : day?.duration;
      if (recommended) setDuration(recommended);
    }
  };

  const complete = async () => {
    if (!plan) return;
    if (!day?.restDay && requiredSets > 0 && completedSets === 0) return setMessage("请先至少记录一组训练，再完成今天的训练。");
    const response = await fetch(`/api/v1/workouts/${plan.id}/complete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ occurrenceId, dayIndex, durationMinutes: duration, rpe, pain, notes: `${mode === "short" ? "完成缩短版。" : mode === "recovery" ? "完成恢复版。" : ""}${pain >= 4 ? ` 疼痛 ${pain}/10。` : ""}`.trim() }) });
    setMessage(response.ok ? "今天的训练已记录。Coach 会在周度复盘中使用组次和恢复反馈。" : "记录失败，请重试。");
    if (response.ok) await load();
  };

  const reschedule = async () => {
    if (!occurrenceId || !rescheduleDate) return setMessage("请选择新的训练日期。");
    const response = await fetch(`/api/v1/workouts/occurrences/${encodeURIComponent(occurrenceId)}/reschedule`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scheduledDate: rescheduleDate }) });
    const body = await response.json().catch(() => null);
    if (!response.ok) return setMessage(body?.message || "暂时无法修改训练日期。");
    setMessage(`已改到 ${new Date(`${rescheduleDate}T12:00:00`).toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" })}。本周其他安排保持不变。`);
    await load();
  };

  if (loading) return <div className="product-loading">正在准备今天的训练…</div>;

  return <ProductShell active="/today" eyebrow="TODAY / 今日训练" title={`${account?.user.name || "你好"}，今天按自己的节奏来`} action={<div className="header-actions-inline"><Link className="header-chip" href="/exercises">动作目录</Link><Link className="header-chip" href="/coach">询问 Coach ↗</Link></div>}>
    {!plan || !day ? <section className="empty-product"><span>NO ACTIVE PLAN</span><h2>先建立一份真正适合你的计划</h2><p>完成 2–3 分钟建档后，系统会计算基础指标并由 AI 编排完整训练周期。</p><Link href="/onboarding">开始建档 →</Link></section> : <>
      <section className="daily-brief-strip"><div><span>{home?.brief.dataState === "plan_only" ? "根据当前计划" : "结合最近记录"}</span><h2>{home?.brief.headline}</h2><p>{home?.brief.summary}</p></div><ol>{home?.brief.priorities.map((item) => <li key={item}>{item}</li>)}</ol><aside><small>当前阶段</small><b>第 {home?.phase?.currentWeek || 1}/{home?.phase?.lengthWeeks || plan.plan.phase?.lengthWeeks || 4} 周</b><span>{occurrence?.scheduledDate ? new Date(`${occurrence.scheduledDate}T12:00:00`).toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" }) : "今天"}</span></aside></section>

      {!checkin && !day.restDay ? <section className="prework-check"><div><span>TRAINING CHECK / 30 秒状态检查</span><h2>先决定今天用哪个版本</h2><p>普通情况由安全规则即时处理，不消耗 Coach 消息额度。</p></div><label>精力<b aria-hidden="true">{energy}/5</b><input type="range" aria-label="精力" aria-valuetext={`${energy} / 5`} min="1" max="5" value={energy} onChange={(event) => setEnergy(Number(event.target.value))} /></label><label>酸痛<b aria-hidden="true">{soreness}/10</b><input type="range" aria-label="酸痛" aria-valuetext={`${soreness} / 10`} min="0" max="10" value={soreness} onChange={(event) => setSoreness(Number(event.target.value))} /></label><label>明显疼痛<b aria-hidden="true">{pain}/10</b><input type="range" aria-label="明显疼痛" aria-valuetext={`${pain} / 10`} min="0" max="10" value={pain} onChange={(event) => setPain(Number(event.target.value))} /></label><label>可用时间<b aria-hidden="true">{availableMinutes} 分钟</b><input type="range" aria-label="可用时间（分钟）" aria-valuetext={`${availableMinutes} 分钟`} min="10" max="120" step="5" value={availableMinutes} onChange={(event) => setAvailableMinutes(Number(event.target.value))} /></label><button disabled={checking} onClick={() => void submitCheckin()}>{checking ? "判断中…" : "查看今天的建议 →"}</button></section> : null}
      {checkin && <section className={`checkin-result ${checkin.recommendation.mode}`}><div><span>今日建议</span><h3>{checkin.recommendation.title}</h3><p>{checkin.recommendation.explanation}</p></div><ul>{checkin.recommendation.stopConditions.map((item) => <li key={item}>{item}</li>)}</ul><button onClick={() => setCheckin(null)}>重新检查</button></section>}

      <div className="workout-options" aria-label="今日训练版本"><button className={mode === "standard" ? "active" : ""} onClick={() => setMode("standard")}><b>标准版</b><span>{day.duration} 分钟</span></button><button className={mode === "short" ? "active" : ""} onClick={() => setMode("short")}><b>20 分钟缩短版</b><span>保留关键动作</span></button><button className={mode === "recovery" ? "active" : ""} onClick={() => setMode("recovery")}><b>恢复版</b><span>降低总量与强度</span></button><div className="reschedule-control"><label>改日完成<input type="date" min={occurrence?.scheduledDate} value={rescheduleDate} onChange={(event) => setRescheduleDate(event.target.value)} /></label><button onClick={() => void reschedule()}>确认改期</button></div></div>

      <div className="today-grid"><section className="today-workout"><div className="today-kicker"><span>DAY {dayIndex + 1} · {intermediate ? "中级增肌" : "新手减脂"}</span><b>{displayDuration || 0} MIN</b></div><h2>{day.title.zh}</h2><p>{day.focus.zh}</p>
        {day.restDay ? <div className="rest-day-card"><b>恢复日</b><p>轻松步行、活动度练习和充足睡眠，就是今天的计划。</p></div> : <div className="workout-player">{visibleExercises.map((exercise, exerciseIndex) => <article className="exercise-player" key={exercise.id}>
          <header><button className="exercise-media-button" type="button" onClick={() => setMediaExercise(exercise)} aria-label={`放大查看 ${exercise.name.zh}`}><img src={`/exercises/${exercise.asset}.jpg`} alt={`${exercise.name.zh} 动作示范`} onError={(event) => { event.currentTarget.style.display = "none"; }} /><span>放大</span></button><div><span>{String(exerciseIndex + 1).padStart(2, "0")} · {exercise.target.zh}</span><h3>{exercise.name.zh}</h3><p>{exercise.cue.zh}</p></div><Link href={`/coach?prompt=${encodeURIComponent(`${exercise.name.zh} 这个动作现在应该怎么做？`)}`}>动作不舒服或器械占用？</Link></header>
          <details className="exercise-safety"><summary>动作要点与注意事项</summary><div><p><b>现在怎么做：</b>{exercise.cue.zh}</p><p><b>呼吸：</b>动作困难阶段呼气，返回时吸气；全程保持躯干稳定，不憋气硬撑。</p><p><b>常见错误：</b>不要借助惯性追求次数，也不要为了达到目标次数牺牲关节位置和动作范围。</p><p><b>停止条件：</b>出现锐痛、麻木、眩晕、胸痛或无法稳定承重时立即停止。</p></div></details>
          <div className={`set-table ${intermediate ? "advanced" : "simple"}`}><div className="set-row set-head"><span>组</span><span>类型</span><span>重量 kg</span><span>次数</span>{intermediate && <span>RIR</span>}<span>完成</span></div>{Array.from({ length: exercise.sets }, (_, setIndex) => { const key = setKey(exercise.id, setIndex); const value = sets[key] || defaultSet(exercise, setIndex, intermediate); return <div className={`set-row ${value.completed ? "done" : ""}`} key={key}><b>{setIndex + 1}</b><select aria-label={`第 ${setIndex + 1} 组类型`} value={value.setType} onChange={(event) => setSets((current) => ({ ...current, [key]: { ...value, setType: event.target.value } }))} disabled={!intermediate}><option value="warmup">热身</option><option value="working">正式</option><option value="dropset">递减</option><option value="failure">力竭</option></select><input aria-label={`第 ${setIndex + 1} 组重量`} inputMode="decimal" type="number" min="0" step=".5" value={value.weightKg ?? ""} placeholder={intermediate ? "上次" : "可选"} onChange={(event) => setSets((current) => ({ ...current, [key]: { ...value, weightKg: event.target.value === "" ? null : Number(event.target.value) } }))} /><input aria-label={`第 ${setIndex + 1} 组次数`} inputMode="numeric" type="number" min="0" value={value.reps ?? ""} onChange={(event) => setSets((current) => ({ ...current, [key]: { ...value, reps: event.target.value === "" ? null : Number(event.target.value) } }))} />{intermediate && <input aria-label={`第 ${setIndex + 1} 组剩余次数`} inputMode="decimal" type="number" min="0" max="10" step=".5" value={value.rir ?? ""} onChange={(event) => setSets((current) => ({ ...current, [key]: { ...value, rir: event.target.value === "" ? null : Number(event.target.value) } }))} />}<button className="set-complete" disabled={savingSet === key} onClick={() => void saveSet(exercise, setIndex, { completed: !value.completed })}>{savingSet === key ? "…" : value.completed ? "✓" : "完成"}</button></div>; })}</div>
          <footer><span>{exercise.sets} 组 · {exercise.reps} 次 · 休息 {exercise.rest}</span>{intermediate && exercise.progression && <small>{exercise.progression.zh}</small>}</footer>
        </article>)}</div>}
      </section><aside className="today-feedback"><span>训练进度</span><h3>{completedSets}/{requiredSets || 0} 组完成</h3>{timer > 0 && <div className="rest-timer"><span>休息计时</span><b>{Math.floor(timer / 60)}:{String(timer % 60).padStart(2, "0")}</b><button onClick={() => setTimer(0)}>跳过</button></div>}<label>训练时长<b aria-hidden="true">{duration} 分钟</b><input type="range" aria-label="训练时长（分钟）" aria-valuetext={`${duration} 分钟`} min="10" max="120" step="5" value={duration} onChange={(event) => setDuration(Number(event.target.value))} /></label><label>主观强度 RPE<b aria-hidden="true">{rpe}/10</b><input type="range" aria-label="主观强度 RPE" aria-valuetext={`${rpe} / 10`} min="1" max="10" value={rpe} onChange={(event) => setRpe(Number(event.target.value))} /></label><label>疼痛程度<b aria-hidden="true">{pain}/10</b><input type="range" aria-label="疼痛程度" aria-valuetext={`${pain} / 10`} min="0" max="10" value={pain} onChange={(event) => setPain(Number(event.target.value))} /></label>{pain >= 4 && <div className="pain-warning">请停止引发疼痛的动作。若疼痛持续或加重，请咨询专业人员。</div>}<button onClick={() => void complete()}>{occurrence?.status === "completed" ? "更新训练记录 →" : "完成并记录训练 →"}</button>{message && <p>{message}</p>}</aside></div>
    </>}

    {mediaExercise && <div ref={mediaDialogRef} className="exercise-media-modal" role="dialog" aria-modal="true" aria-label={`${mediaExercise.name.zh} 动作示范`} onClick={() => setMediaExercise(null)}><article onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setMediaExercise(null)}>关闭 ×</button><div className="exercise-media-stage"><img src={`/exercises/${mediaExercise.asset}.gif`} alt={`${mediaExercise.name.zh} 动作动态示范`} onError={(event) => { event.currentTarget.style.display = "none"; }} /></div><div className="exercise-media-copy"><span>{mediaExercise.target.zh}</span><h2>{mediaExercise.name.zh}</h2><p>{mediaExercise.cue.zh}</p><ul><li>先用可稳定控制的重量熟悉动作。</li><li>动作困难阶段呼气，返回时吸气。</li><li>出现锐痛、麻木或关节不稳定时立即停止。</li></ul><Link href={`/coach?prompt=${encodeURIComponent(`请结合我的计划，讲解 ${mediaExercise.name.zh} 的动作要点和替代动作。`)}`}>让 Coach 结合我的情况讲解 →</Link></div></article></div>}
  </ProductShell>;
}
