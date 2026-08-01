"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ProductShell from "../../components/product-shell";
import { beginCmineLogin } from "../../lib/auth";

type Memory = {
  id: string;
  type: "declared" | "profile" | "observed";
  key: string;
  value: string;
  source: "user" | "profile" | "system";
  confidence: number;
  updatedAt: string;
};

type Snapshot = {
  pro: boolean;
  memories: Memory[];
  preferences: {
    memoryEnabled: boolean;
    coachingMode: "personalized" | "education";
    tone: "supportive" | "direct" | "concise";
    proactiveEnabled: boolean;
  };
};

const labels: Record<string, string> = {
  goal: "当前目标",
  equipment: "可用器械",
  limitations: "伤病与动作限制",
  schedule: "日程偏好",
  training_preference: "训练偏好",
  food_preference: "饮食偏好",
};

export default function MemoryClient() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [key, setKey] = useState("schedule");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const load = async () => {
    const response = await fetch("/api/v1/coach/memory", { cache: "no-store" });
    if (response.status === 401) {
      await beginCmineLogin("/coach/memory");
      return;
    }
    if (response.ok) setSnapshot(await response.json() as Snapshot);
  };

  useEffect(() => { const task = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(task); }, []);

  const savePreference = async (patch: Partial<Snapshot["preferences"]>) => {
    if (!snapshot) return;
    const preferences = { ...snapshot.preferences, ...patch };
    setSnapshot({ ...snapshot, preferences });
    const response = await fetch("/api/v1/coach/memory", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "preferences", ...preferences }),
    });
    if (!response.ok) setNotice("设置暂时没有保存成功，请重试。");
    else setSnapshot(await response.json() as Snapshot);
  };

  const addMemory = async () => {
    if (!snapshot?.pro) return setNotice("保存长期 Coach 记忆需要 Cmine Fit Pro；训练档案和隐私控制仍然可用。");
    if (!value.trim()) return;
    setSaving(true);
    const response = await fetch("/api/v1/coach/memory", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, value: value.trim() }),
    });
    setSaving(false);
    if (!response.ok) return setNotice("这条信息暂时没有保存成功，请重试。");
    setSnapshot(await response.json() as Snapshot);
    setValue("");
    setNotice("Coach 已记住。你随时可以修改或删除。");
  };

  const remove = async (memory: Memory) => {
    const response = await fetch(`/api/v1/coach/memory?id=${encodeURIComponent(memory.id)}`, { method: "DELETE" });
    if (!response.ok) return setNotice("删除失败，请重试。");
    setSnapshot(await response.json() as Snapshot);
  };

  return <ProductShell
    active="/coach"
    eyebrow="COACH MEMORY / 个性化控制"
    title="你决定 Coach 可以了解什么"
    action={<Link className="header-chip" href="/coach">← 返回 Coach</Link>}
  >
    {!snapshot ? <div className="product-loading">正在读取个性化设置…</div> : <div className="memory-layout">
      <section className="memory-panel memory-preferences">
        <div className="section-heading"><span>01 / 个性化方式</span><h2>不是黑盒记忆，全部由你控制</h2><p>关闭记忆后，Coach 不再把稳定偏好加入后续对话。训练档案仍用于生成你主动请求的计划。</p></div>
        <label className="setting-switch"><span><b>使用 Coach 记忆</b><small>在后续咨询中使用你保存的日程、训练和饮食偏好。</small></span><input type="checkbox" checked={snapshot.preferences.memoryEnabled} onChange={(event) => void savePreference({ memoryEnabled: event.target.checked })} /></label>
        <label className="setting-switch"><span><b>主动建议</b><small>在今日简报和复盘中显示少量、可执行的提醒。</small></span><input type="checkbox" checked={snapshot.preferences.proactiveEnabled} onChange={(event) => void savePreference({ proactiveEnabled: event.target.checked })} /></label>
        <div className="preference-options"><span>回答方式</span><button className={snapshot.preferences.coachingMode === "personalized" ? "active" : ""} onClick={() => void savePreference({ coachingMode: "personalized" })}>结合个人数据</button><button className={snapshot.preferences.coachingMode === "education" ? "active" : ""} onClick={() => void savePreference({ coachingMode: "education" })}>仅通用教育支持</button></div>
        <div className="preference-options"><span>表达风格</span>{(["supportive", "direct", "concise"] as const).map((tone) => <button key={tone} className={snapshot.preferences.tone === tone ? "active" : ""} onClick={() => void savePreference({ tone })}>{tone === "supportive" ? "温和支持" : tone === "direct" ? "直接明确" : "简洁"}</button>)}</div>
      </section>

      <section className="memory-panel">
        <div className="section-heading"><span>02 / Coach 对我的了解</span><h2>可查看、可修正、可删除</h2><p>档案信息来自你的建档；主动提供的信息由你保存；系统观察必须标明来源和更新时间。</p></div>
        <div className="memory-groups">
          {snapshot.memories.length ? snapshot.memories.map((memory) => <article key={memory.id} className="memory-card"><div><span>{memory.type === "profile" ? "训练档案" : memory.type === "observed" ? "系统观察" : "你主动提供"}</span><small>{new Date(memory.updatedAt).toLocaleDateString("zh-CN")}</small></div><b>{labels[memory.key] || memory.key}</b><p>{memory.value}</p>{memory.type === "profile" ? <Link href="/account#profile">在训练档案中修改 ↗</Link> : <button onClick={() => void remove(memory)}>删除</button>}</article>) : <div className="memory-empty">Coach 还没有保存额外偏好。你可以从下面添加第一条。</div>}
        </div>
      </section>

      <section className={`memory-panel memory-add ${snapshot.pro ? "" : "locked"}`}>
        <div className="section-heading"><span>03 / 主动告诉 Coach</span><h2>保存一条长期有用的信息</h2></div>
        <select value={key} onChange={(event) => setKey(event.target.value)}><option value="schedule">日程偏好</option><option value="training_preference">训练偏好</option><option value="food_preference">饮食偏好</option><option value="travel">旅行与临时条件</option><option value="other">其他</option></select>
        <textarea value={value} onChange={(event) => setValue(event.target.value)} maxLength={500} placeholder="例如：工作日通常只能在晚上训练，最多 35 分钟。" />
        <button disabled={saving || !value.trim()} onClick={() => void addMemory()}>{saving ? "保存中…" : snapshot.pro ? "让 Coach 记住" : "Pro 解锁长期记忆"}</button>
        <small>{snapshot.pro ? "请不要保存密码、身份证号或医疗诊断等不必要的敏感信息。" : "免费版仍可管理训练档案和个性化开关；Pro 才会把日程与稳定偏好带入后续对话。"}</small>
      </section>
    </div>}
    {notice && <div className="toast account-toast">{notice}</div>}
  </ProductShell>;
}
