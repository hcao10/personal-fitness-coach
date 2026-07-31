"use client";

import { useEffect, useMemo, useState } from "react";
import ProductShell from "../components/product-shell";
import { defaultProfile, generatePlan, type Activity, type Equipment, type Experience, type Goal, type Profile, type Sex } from "../lib/coach";
import { beginCmineLogin, getCmineSession } from "../lib/auth";

const steps = ["开始", "目标", "身体资料", "训练条件", "安全与限制", "饮食偏好", "确认"];
type Draft = Profile & { sessionMinutes: number; dietaryPreference: string; exclusions: string };
const initial: Draft = { ...defaultProfile, sessionMinutes: 50, dietaryPreference: "balanced", exclusions: "" };

export default function OnboardingClient() {
  const [step, setStep] = useState(0); const [draft, setDraft] = useState<Draft>(initial);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [consent, setConsent] = useState(false); const [message, setMessage] = useState("");
  const estimate = useMemo(() => generatePlan(draft), [draft]);
  const patch = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  useEffect(() => { void (async () => {
    const session = await getCmineSession();
    if (!session.user) { await beginCmineLogin("/onboarding"); return; }
    const response = await fetch("/api/v1/onboarding", { cache: "no-store" });
    const state = response.ok ? await response.json() as { step?: number; draft?: Partial<Draft> } : {};
    let merged = { ...initial, ...(state.draft || {}) };
    const local = sessionStorage.getItem("cmine_fit_intake_draft");
    if (local) {
      try { merged = { ...merged, ...JSON.parse(local) as Partial<Draft> }; } catch { /* ignore an invalid local draft */ }
      await fetch("/api/v1/onboarding/import-intake", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ step: 6, data: merged, source: "homepage_intake" }) });
      setStep(6);
    } else setStep(Math.max(0, Math.min(6, Number(state.step || 0))));
    setDraft(merged); setLoading(false);
  })(); }, []);

  const saveAndMove = async (next: number) => {
    setSaving(true); setMessage("");
    const response = await fetch("/api/v1/onboarding", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ step: next, data: draft }) });
    setSaving(false); if (!response.ok) { setMessage("暂时无法保存，请重试。"); return; } setStep(next);
  };
  const skip = async () => { await fetch("/api/v1/onboarding/skip", { method: "POST" }); window.location.assign("/"); };
  const complete = async () => {
    if (!consent) { setMessage("请先确认健康免责声明和数据处理说明。"); return; }
    setSaving(true); setMessage("");
    const completed = await fetch("/api/v1/onboarding/complete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile: draft, consent: true, locale: "zh" }) });
    if (!completed.ok) { const error = await completed.json().catch(() => null) as { message?: string } | null; setMessage(error?.message || "资料确认失败，请重试。"); setSaving(false); return; }
    sessionStorage.removeItem("cmine_fit_intake_draft");
    const generated = await fetch("/api/v1/plans", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile: draft, consent: true }) });
    setSaving(false);
    if (!generated.ok) { setMessage("资料已经保存。AI 暂时无法生成计划，你可以稍后从“今日”重试。"); return; }
    window.location.assign("/today");
  };
  if (loading) return <div className="onboarding-loading">正在恢复你的训练资料…</div>;

  return <ProductShell active="" eyebrow="WELCOME / 建立训练档案" title="先了解你，再规划训练" action={<button className="text-action" onClick={() => void skip()}>稍后再说</button>}>
    <section className="onboarding-layout">
      <div className="onboarding-steps">{steps.map((name, index) => <button key={name} className={index === step ? "active" : index < step ? "done" : ""} onClick={() => index <= step && setStep(index)}><b>{index < step ? "✓" : index + 1}</b><span>{name}</span></button>)}</div>
      <div className="onboarding-card">
        {step === 0 && <div className="onboarding-welcome"><span>2–3 MINUTES</span><h2>让计划适合你的生活，而不是让生活迁就计划。</h2><p>你可以逐步填写，也可以稍后继续。只有在最后确认后，我们才会生成完整计划。</p><button className="primary-cta" onClick={() => void saveAndMove(1)}>开始建立计划 <b>→</b></button></div>}
        {step === 1 && <Step title="你最想改变什么？" note="先确定主要目标，后续可以随训练进度调整。">
          <div className="choice-grid">{([['fat_loss','减脂'],['muscle','增肌'],['recomp','塑形'],['arms','手臂线条'],['strength','力量']] as [Goal,string][]).map(([value,label]) => <button className={draft.goal === value ? "active" : ""} onClick={() => patch("goal", value)} key={value}>{label}</button>)}</div>
          <Nav step={step} saving={saving} back={() => setStep(0)} next={() => void saveAndMove(2)} />
        </Step>}
        {step === 2 && <Step title="身体基础资料" note="用于计算基础代谢、训练强度和安全范围。">
          <div className="choice-grid compact">{([['female','女性'],['male','男性']] as [Sex,string][]).map(([value,label]) => <button className={draft.sex === value ? "active" : ""} onClick={() => patch("sex", value)} key={value}>{label}</button>)}</div>
          <div className="onboarding-fields"><label>年龄<input type="number" value={draft.age} onChange={(event) => patch("age", Number(event.target.value))} /></label><label>身高 cm<input type="number" value={draft.height} onChange={(event) => patch("height", Number(event.target.value))} /></label><label>体重 kg<input type="number" value={draft.weight} onChange={(event) => patch("weight", Number(event.target.value))} /></label><label>目标体重 kg<input type="number" value={draft.targetWeight} onChange={(event) => patch("targetWeight", Number(event.target.value))} /></label></div>
          <Nav step={step} saving={saving} back={() => setStep(1)} next={() => void saveAndMove(3)} />
        </Step>}
        {step === 3 && <Step title="你的训练条件" note="真实可执行，比理想化计划更重要。">
          <div className="onboarding-fields"><label>训练经验<select value={draft.experience} onChange={(event) => patch("experience", event.target.value as Experience)}><option value="beginner">新手</option><option value="intermediate">进阶</option><option value="advanced">高级</option></select></label><label>可用器械<select value={draft.equipment} onChange={(event) => patch("equipment", event.target.value as Equipment)}><option value="bodyweight">徒手 / 居家</option><option value="dumbbell">哑铃</option><option value="gym">完整健身房</option></select></label><label>日常活动<select value={draft.activity} onChange={(event) => patch("activity", event.target.value as Activity)}><option value="sedentary">久坐</option><option value="light">轻度活动</option><option value="moderate">中等活动</option><option value="active">高活动量</option></select></label><label>单次时长<input type="number" value={draft.sessionMinutes} onChange={(event) => patch("sessionMinutes", Number(event.target.value))} /></label></div>
          <div className="day-picker"><span>每周训练天数</span>{[2,3,4,5,6].map((day) => <button key={day} className={draft.days === day ? "active" : ""} onClick={() => patch("days", day)}>{day}</button>)}</div>
          <Nav step={step} saving={saving} back={() => setStep(2)} next={() => void saveAndMove(4)} />
        </Step>}
        {step === 4 && <Step title="安全与动作限制" note="这不是诊断信息；它帮助系统避开不适合的动作。">
          <label className="wide-field">伤病、疼痛或需要避开的动作<textarea value={draft.limitations} onChange={(event) => patch("limitations", event.target.value)} placeholder="例如：右膝旧伤，避免跳跃。没有可留空。" /></label>
          <div className="safety-note">若出现胸痛、晕厥、呼吸困难、无法承重或持续加重的疼痛，请暂停训练并及时寻求专业医疗帮助。</div>
          <Nav step={step} saving={saving} back={() => setStep(3)} next={() => void saveAndMove(5)} />
        </Step>}
        {step === 5 && <Step title="饮食偏好" note="可选信息，用于让建议更贴近日常生活。">
          <div className="choice-grid">{[['balanced','均衡饮食'],['vegetarian','素食'],['high_protein','高蛋白'],['none','暂不设置']].map(([value,label]) => <button className={draft.dietaryPreference === value ? "active" : ""} onClick={() => patch("dietaryPreference", value as Draft["dietaryPreference"])} key={value}>{label}</button>)}</div>
          <label className="wide-field">忌口或不吃的食物<input value={draft.exclusions} onChange={(event) => patch("exclusions", event.target.value)} placeholder="可留空" /></label>
          <Nav step={step} saving={saving} back={() => setStep(4)} next={() => void saveAndMove(6)} />
        </Step>}
        {step === 6 && <Step title="确认后生成专属计划" note="这些指标由确定性规则计算，完整训练安排由 AI 编排并再次通过安全校验。">
          <div className="onboarding-summary"><article><span>每日热量</span><b>{estimate.calories}</b><small>kcal</small></article><article><span>蛋白质</span><b>{estimate.protein}</b><small>g</small></article><article><span>每周训练</span><b>{draft.days}</b><small>天</small></article><article><span>建议周期</span><b>{estimate.weeks}</b><small>周</small></article></div>
          <label className="consent-row"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>我理解 Cmine Fit 提供一般训练与营养信息，不替代医疗诊断；出现异常疼痛时会停止相关训练。</span></label>
          <Nav step={step} saving={saving} back={() => setStep(5)} next={() => void complete()} final />
        </Step>}
        {message && <p className="form-message">{message}</p>}
      </div>
    </section>
  </ProductShell>;
}

function Step({ title, note, children }: { title: string; note: string; children: React.ReactNode }) { return <div className="onboarding-step"><p>CMINE FIT INTAKE</p><h2>{title}</h2><span>{note}</span>{children}</div>; }
function Nav({ saving, back, next, final = false }: { step: number; saving: boolean; back: () => void; next: () => void; final?: boolean }) { return <div className="onboarding-nav"><button onClick={back}>← 返回</button><button className="primary-cta" disabled={saving} onClick={next}>{saving ? "正在保存…" : final ? "确认并生成完整计划" : "保存并继续"}<b>→</b></button></div>; }
