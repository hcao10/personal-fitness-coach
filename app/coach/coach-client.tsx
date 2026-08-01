"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ProductShell from "../components/product-shell";
import { beginCmineLogin } from "../lib/auth";

type Evidence = { label: string; value: string; observedAt?: string | null; source?: string | null };
type Source = { id: string; title: string; publisher: string; url: string };
type Action = { id: string; type: string; status: string; expiresAt?: string | null; payload: { title?: string; description?: string; before?: string; after?: string; reason?: string; impact?: string[]; reversible?: boolean } };
type Message = { id: string; role: "user" | "assistant"; content: string; createdAt: string; actions?: Action[]; intent?: string; basis?: Evidence[]; limitations?: string[]; sources?: Source[] };
type Conversation = { id: string; title: string; updatedAt: string };
type Home = {
  brief: { headline: string; summary: string; priorities: string[]; primaryAction: { label: string; href: string }; basis: Evidence[]; dataState: string };
  phase: { kind: string; lengthWeeks: number; currentWeek: number; progressPct: number; weeklyFocus: Array<{ zh: string }> } | null;
  today: { occurrenceId: string | null; scheduledDate: string; status: string; mode: string; workout: { title: { zh: string }; duration: number; restDay?: boolean } } | null;
  pendingActions: Action[]; memoryCount: number; product: { membership: { tier: string }; usage: { capabilities: Record<string, { remaining: number }> } };
  nutritionToday: { calories: number; protein: number; calorieTarget: number | null; proteinTarget: number | null };
};

const prompts = ["今天状态不好，要不要减量？", "帮我替换一个更适合当前器械的动作", "为什么这样安排我的训练？", "我最近几周为什么没有进展？"];
const actionNames: Record<string, string> = { replace_exercise: "替换动作", shorten_session: "缩短训练", adjust_load: "调整负荷", reschedule_workout: "训练改期", plan_adjustment: "生成计划调整", log_workout: "创建训练草稿", log_measurement: "创建测量草稿", create_meal_draft: "创建餐食草稿", schedule_review: "发起复盘" };

export default function CoachClient() {
  const [home, setHome] = useState<Home | null>(null); const [conversations, setConversations] = useState<Conversation[]>([]); const [active, setActive] = useState<string | null>(null); const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState(""); const [sending, setSending] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const endRef = useRef<HTMLDivElement>(null); const abortRef = useRef<AbortController | null>(null);
  const loadHome = async () => { const response = await fetch("/api/v1/coach/home", { cache: "no-store" }); if (response.ok) setHome(await response.json() as Home); };
  const loadMessages = async (id: string) => { const response = await fetch(`/api/v1/coach/conversations/${id}/messages`, { cache: "no-store" }); if (response.ok) setMessages((await response.json() as { messages: Message[] }).messages); };
  useEffect(() => { void (async () => { const response = await fetch("/api/v1/coach/conversations", { cache: "no-store" }); if (response.status === 401) { await beginCmineLogin("/coach"); return; } if (!response.ok) return;
    let list = (await response.json() as { conversations: Conversation[] }).conversations; if (!list.length) { const created = await fetch("/api/v1/coach/conversations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "新的对话" }) }); if (created.ok) list = [(await created.json() as { conversation: Conversation }).conversation]; }
    setConversations(list); if (list[0]) { setActive(list[0].id); await loadMessages(list[0].id); } await loadHome();
    const prompt = new URLSearchParams(window.location.search).get("prompt"); if (prompt) setText(prompt.slice(0, 1000));
    const draft = sessionStorage.getItem("cmine_fit_coach_draft"); if (draft) setText((current) => current || draft.slice(0, 2000));
  })(); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { sessionStorage.setItem("cmine_fit_coach_draft", text); }, [text]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(""), 4000); return () => window.clearTimeout(timer); }, [notice]);

  const create = async () => { const response = await fetch("/api/v1/coach/conversations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "新的对话" }) }); if (!response.ok) return; const conversation = (await response.json() as { conversation: Conversation }).conversation; setConversations((current) => [conversation, ...current]); setActive(conversation.id); setMessages([]); };
  const send = async (override?: string) => {
    const content = (override || text).trim(); if (!active || !content || sending) return; const tempId = crypto.randomUUID(); setText(""); sessionStorage.removeItem("cmine_fit_coach_draft"); setError(""); setSending(true);
    setMessages((current) => [...current, { id: tempId, role: "user", content, createdAt: new Date().toISOString() }, { id: `${tempId}:assistant`, role: "assistant", content: "", createdAt: new Date().toISOString(), actions: [] }]);
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const response = await fetch(`/api/v1/coach/conversations/${active}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: content, clientMutationId: tempId }), signal: controller.signal });
      if (!response.ok || !response.body) throw new Error("Coach 暂时无法回复。");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const blocks = buffer.split("\n\n"); buffer = blocks.pop() || "";
        for (const block of blocks) { const event = block.match(/^event: (.+)$/m)?.[1]; const raw = block.match(/^data: (.+)$/m)?.[1]; if (!event || !raw) continue; const data = JSON.parse(raw) as Record<string, unknown>;
          if (event === "message.delta") setMessages((current) => current.map((item) => item.id === `${tempId}:assistant` ? { ...item, content: item.content + String(data.delta || "") } : item));
          if (event === "message.metadata") setMessages((current) => current.map((item) => item.id === `${tempId}:assistant` ? { ...item, intent: String(data.intent || ""), basis: data.basis as Evidence[] || [], limitations: data.limitations as string[] || [], sources: data.sources as Source[] || [] } : item));
          if (event === "action.proposed") setMessages((current) => current.map((item) => item.id === `${tempId}:assistant` ? { ...item, actions: [...(item.actions || []), data as unknown as Action] } : item));
          if (event === "message.error") setError(String(data.message || "Coach 暂时无法回复。"));
        }
      }
      await loadMessages(active); await loadHome();
    } catch (caught) { if ((caught as Error).name !== "AbortError") setError(caught instanceof Error ? caught.message : "发送失败"); }
    finally { abortRef.current = null; setSending(false); }
  };
  const decide = async (action: Action, decision: "accept" | "reject") => { const response = await fetch(`/api/v1/coach/actions/${action.id}/${decision}`, { method: "POST" }); const body = await response.json().catch(() => null); if (!response.ok) return setNotice(body?.message || "这条建议暂时无法执行。");
    setMessages((current) => current.map((message) => ({ ...message, actions: message.actions?.map((item) => item.id === action.id ? { ...item, status: String(body.status || (decision === "accept" ? "accepted" : "rejected")) } : item) })));
    setNotice(body.status === "expired" ? "这条建议已过期，请让 Coach 根据最新计划重新判断。" : decision === "accept" ? "建议已处理；正式计划仍需在版本页面确认。" : "已保留当前安排。"); await loadHome(); };
  const feedback = async (messageId: string, rating: 1 | -1) => { await fetch(`/api/v1/coach/messages/${messageId}/feedback`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rating }) }); setNotice(rating === 1 ? "谢谢，你的反馈会帮助我们改进 Coach。" : "已记录。后续建议会优先做到更清楚、更可执行。"); };

  const remaining = home?.product.usage.capabilities["coach.chat"]?.remaining;
  return <ProductShell active="/coach" eyebrow="COACH / 长期陪伴" title="根据现实状态，决定下一步" action={<div className="header-actions-inline"><Link className="header-chip" href="/coach/memory">Coach 对我的了解 · {home?.memoryCount ?? 0}</Link><button className="header-chip" onClick={() => void create()}>＋ 新对话</button></div>}>
    {home && <section className="coach-command-center">
      <article className="coach-brief-card"><div className="coach-card-kicker"><span>DAILY BRIEF / 今日简报</span><b>{home.brief.dataState === "plan_only" ? "主要根据当前计划" : home.brief.dataState === "personalized" ? "结合最近记录" : "部分个性化"}</b></div><h2>{home.brief.headline}</h2><p>{home.brief.summary}</p><ol>{home.brief.priorities.map((item) => <li key={item}>{item}</li>)}</ol><div className="coach-evidence-row">{home.brief.basis.map((item) => <span key={`${item.label}-${item.value}`}><small>{item.label}</small><b>{item.value}</b></span>)}</div><Link href={home.brief.primaryAction.href}>{home.brief.primaryAction.label} →</Link></article>
      <aside className="coach-phase-card"><span>当前阶段</span>{home.phase ? <><h3>第 {home.phase.currentWeek}/{home.phase.lengthWeeks} 周</h3><div className="phase-progress"><i style={{ width: `${home.phase.progressPct}%` }} /></div><p>{home.phase.weeklyFocus[Math.max(0, home.phase.currentWeek - 1)]?.zh}</p><small>{home.today?.scheduledDate} · {home.today?.workout.title.zh || "恢复日"}</small></> : <><h3>还没有生效计划</h3><p>先完成建档，Coach 才能结合目标和现实条件陪你执行。</p></>}<div className="coach-quota"><span>本周期 Coach 消息</span><b>{remaining ?? 0} 条可用</b></div></aside>
    </section>}
    <section className="coach-quick-actions"><div><span>现在可以问</span><p>Coach 会结合你的计划与最近记录，不会编造不存在的数据。</p></div>{prompts.map((prompt) => <button key={prompt} onClick={() => { setText(prompt); document.querySelector<HTMLTextAreaElement>(".coach-composer textarea")?.focus(); }}>{prompt}</button>)}</section>
    <div className="coach-chat-layout"><aside className="conversation-list"><span>连续对话</span>{conversations.map((conversation) => <button key={conversation.id} className={active === conversation.id ? "active" : ""} onClick={() => { setActive(conversation.id); void loadMessages(conversation.id); }}><b>{conversation.title}</b><small>{new Date(conversation.updatedAt).toLocaleDateString()}</small></button>)}</aside>
      <section className="coach-chat"><div className="coach-message-list">{!messages.length && <div className="coach-empty"><span>C</span><h2>不是搜索答案，是一起决定下一步</h2><p>问计划原因、动作替代、恢复、饮食或停滞。任何修改都会先给你看，再由你确认。</p></div>}
        {messages.map((message) => <article key={message.id} className={`coach-message ${message.role}`}><span>{message.role === "assistant" ? "C" : "你"}</span><div><p>{message.content || (sending ? "正在结合你的计划和记录…" : "")}</p>{message.basis?.length ? <div className="message-basis"><small>与你有关的依据</small>{message.basis.map((item) => <span key={`${item.label}-${item.value}`}><b>{item.label}</b>{item.value}{item.observedAt ? <em>{new Date(item.observedAt).toLocaleDateString()}</em> : null}</span>)}</div> : null}{message.sources?.length ? <div className="message-sources"><small>参考资料</small>{message.sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer"><b>{source.title}</b><span>{source.publisher} ↗</span></a>)}</div> : null}{message.limitations?.map((item) => <p className="message-limitation" key={item}>{item}</p>)}
          {message.actions?.map((action) => <div className="coach-action-card" key={action.id}><small>{actionNames[action.type] || action.type}</small><b>{action.payload.title}</b><p>{action.payload.description}</p>{action.payload.before || action.payload.after ? <div className="action-diff"><span><small>当前</small>{action.payload.before || "—"}</span><i>→</i><span><small>建议</small>{action.payload.after || "—"}</span></div> : null}<p className="action-reason">{action.payload.reason}</p>{action.payload.impact?.length ? <ul>{action.payload.impact.map((item) => <li key={item}>{item}</li>)}</ul> : null}{action.status === "pending" ? <div className="action-buttons"><button onClick={() => void decide(action, "reject")}>保持当前</button><button onClick={() => void decide(action, "accept")}>接受并继续</button></div> : <em>{action.status === "accepted" ? "已接受" : action.status === "rejected" ? "已保持当前" : action.status === "expired" ? "已过期" : "执行失败"}</em>}</div>)}
          {message.role === "assistant" && message.content ? <div className="message-feedback"><span>这条建议有帮助吗？</span><button onClick={() => void feedback(message.id, 1)}>有帮助</button><button onClick={() => void feedback(message.id, -1)}>需改进</button></div> : null}</div></article>)}<div ref={endRef} /></div>
        <div className="coach-composer"><textarea value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="告诉 Coach 你今天的状态，或问一个训练问题…" />{sending ? <button className="stop" onClick={() => abortRef.current?.abort()}>停止</button> : <button disabled={!text.trim()} onClick={() => void send()}>发送 ↑</button>}</div>{error && <p className="chat-error">{error} <button onClick={() => void send(messages.filter((item) => item.role === "user").at(-1)?.content)}>重试</button> <Link href="/pricing">查看权益</Link></p>}
      </section>
    </div>{notice && <div className="toast account-toast">{notice}</div>}
  </ProductShell>;
}
