"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ProductShell from "../components/product-shell";
import { beginCmineLogin } from "../lib/auth";
import { useLocale } from "../lib/i18n-provider";
import { dateFormatter, pick, type Localized, type MessageKey } from "../../packages/i18n/src";

type Evidence = { label: string; value: string; observedAt?: string | null; source?: string | null };
type Source = { id: string; title: string; publisher: string; url: string };
type Action = { id: string; type: string; status: string; expiresAt?: string | null; payload: { title?: string; description?: string; before?: string; after?: string; reason?: string; impact?: string[]; reversible?: boolean } };
type Message = { id: string; role: "user" | "assistant"; content: string; createdAt: string; actions?: Action[]; intent?: string; basis?: Evidence[]; limitations?: string[]; sources?: Source[] };
type Conversation = { id: string; title: string; updatedAt: string };
type Home = {
  brief: { headline: string; summary: string; priorities: string[]; primaryAction: { label: string; href: string }; basis: Evidence[]; dataState: string };
  // The planner emits these as `Localized`; the old `{ zh: string }` narrowing
  // here is what forced the Chinese variant onto every reader.
  phase: { kind: string; lengthWeeks: number; currentWeek: number; progressPct: number; weeklyFocus: Array<Localized> } | null;
  today: { occurrenceId: string | null; scheduledDate: string; status: string; mode: string; workout: { title: Localized; duration: number; restDay?: boolean } } | null;
  pendingActions: Action[]; memoryCount: number; product: { membership: { tier: string }; usage: { capabilities: Record<string, { remaining: number }> } };
  nutritionToday: { calories: number; protein: number; calorieTarget: number | null; proteinTarget: number | null };
};

const prompts = ["coach.promptDeload", "coach.promptSwapExercise", "coach.promptWhyThisPlan", "coach.promptNoProgress"] as const;
const actionNames: Record<string, MessageKey> = { replace_exercise: "coach.actionReplaceExercise", shorten_session: "coach.actionShortenSession", adjust_load: "coach.actionAdjustLoad", reschedule_workout: "coach.actionRescheduleWorkout", plan_adjustment: "coach.actionPlanAdjustment", log_workout: "coach.actionLogWorkout", log_measurement: "coach.actionLogMeasurement", create_meal_draft: "coach.actionCreateMealDraft", schedule_review: "coach.actionScheduleReview" };

export default function CoachClient() {
  const { locale, t } = useLocale();
  const [home, setHome] = useState<Home | null>(null); const [conversations, setConversations] = useState<Conversation[]>([]); const [active, setActive] = useState<string | null>(null); const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState(""); const [sending, setSending] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const endRef = useRef<HTMLDivElement>(null); const abortRef = useRef<AbortController | null>(null);
  const loadHome = async () => { const response = await fetch("/api/v1/coach/home", { cache: "no-store" }); if (response.ok) setHome(await response.json() as Home); };
  const loadMessages = async (id: string) => { const response = await fetch(`/api/v1/coach/conversations/${id}/messages`, { cache: "no-store" }); if (response.ok) setMessages((await response.json() as { messages: Message[] }).messages); };
  useEffect(() => { void (async () => { const response = await fetch("/api/v1/coach/conversations", { cache: "no-store" }); if (response.status === 401) { await beginCmineLogin("/coach"); return; } if (!response.ok) return;
    let list = (await response.json() as { conversations: Conversation[] }).conversations; if (!list.length) { const created = await fetch("/api/v1/coach/conversations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: t("coach.newChatTitle") }) }); if (created.ok) list = [(await created.json() as { conversation: Conversation }).conversation]; }
    setConversations(list); if (list[0]) { setActive(list[0].id); await loadMessages(list[0].id); } await loadHome();
    const prompt = new URLSearchParams(window.location.search).get("prompt"); if (prompt) setText(prompt.slice(0, 1000));
    const draft = sessionStorage.getItem("cmine_fit_coach_draft"); if (draft) setText((current) => current || draft.slice(0, 2000));
  })(); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { sessionStorage.setItem("cmine_fit_coach_draft", text); }, [text]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(""), 4000); return () => window.clearTimeout(timer); }, [notice]);

  const create = async () => { const response = await fetch("/api/v1/coach/conversations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: t("coach.newChatTitle") }) }); if (!response.ok) return; const conversation = (await response.json() as { conversation: Conversation }).conversation; setConversations((current) => [conversation, ...current]); setActive(conversation.id); setMessages([]); };
  const send = async (override?: string) => {
    const content = (override || text).trim(); if (!active || !content || sending) return; const tempId = crypto.randomUUID(); setText(""); sessionStorage.removeItem("cmine_fit_coach_draft"); setError(""); setSending(true);
    setMessages((current) => [...current, { id: tempId, role: "user", content, createdAt: new Date().toISOString() }, { id: `${tempId}:assistant`, role: "assistant", content: "", createdAt: new Date().toISOString(), actions: [] }]);
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const response = await fetch(`/api/v1/coach/conversations/${active}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: content, clientMutationId: tempId }), signal: controller.signal });
      if (!response.ok || !response.body) throw new Error(t("coach.replyUnavailable"));
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const blocks = buffer.split("\n\n"); buffer = blocks.pop() || "";
        for (const block of blocks) { const event = block.match(/^event: (.+)$/m)?.[1]; const raw = block.match(/^data: (.+)$/m)?.[1]; if (!event || !raw) continue; const data = JSON.parse(raw) as Record<string, unknown>;
          if (event === "message.delta") setMessages((current) => current.map((item) => item.id === `${tempId}:assistant` ? { ...item, content: item.content + String(data.delta || "") } : item));
          if (event === "message.metadata") setMessages((current) => current.map((item) => item.id === `${tempId}:assistant` ? { ...item, intent: String(data.intent || ""), basis: data.basis as Evidence[] || [], limitations: data.limitations as string[] || [], sources: data.sources as Source[] || [] } : item));
          if (event === "action.proposed") setMessages((current) => current.map((item) => item.id === `${tempId}:assistant` ? { ...item, actions: [...(item.actions || []), data as unknown as Action] } : item));
          if (event === "message.error") setError(String(data.message || t("coach.replyUnavailable")));
        }
      }
      await loadMessages(active); await loadHome();
    } catch (caught) { if ((caught as Error).name !== "AbortError") setError(caught instanceof Error ? caught.message : t("coach.sendFailed")); }
    finally { abortRef.current = null; setSending(false); }
  };
  const decide = async (action: Action, decision: "accept" | "reject") => { const response = await fetch(`/api/v1/coach/actions/${action.id}/${decision}`, { method: "POST" }); const body = await response.json().catch(() => null); if (!response.ok) return setNotice(body?.message || t("coach.actionUnavailable"));
    setMessages((current) => current.map((message) => ({ ...message, actions: message.actions?.map((item) => item.id === action.id ? { ...item, status: String(body.status || (decision === "accept" ? "accepted" : "rejected")) } : item) })));
    setNotice(body.status === "expired" ? t("coach.actionExpiredNotice") : decision === "accept" ? t("coach.actionAcceptedNotice") : t("coach.actionRejectedNotice")); await loadHome(); };
  const feedback = async (messageId: string, rating: 1 | -1) => { await fetch(`/api/v1/coach/messages/${messageId}/feedback`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rating }) }); setNotice(rating === 1 ? t("coach.feedbackThanks") : t("coach.feedbackNoted")); };

  const remaining = home?.product.usage.capabilities["coach.chat"]?.remaining;
  return <ProductShell active="/coach" eyebrow={t("coach.eyebrow")} title={t("coach.title")} action={<div className="header-actions-inline"><Link className="header-chip" href="/coach/memory">{t("coach.memoryChip", { count: home?.memoryCount ?? 0 })}</Link><button className="header-chip" onClick={() => void create()}>{t("coach.newChatAction")}</button></div>}>
    {home && <section className="coach-command-center">
      <article className="coach-brief-card"><div className="coach-card-kicker"><span>{t("coach.dailyBriefKicker")}</span><b>{home.brief.dataState === "plan_only" ? t("coach.dataStatePlanOnly") : home.brief.dataState === "personalized" ? t("coach.dataStatePersonalized") : t("coach.dataStatePartial")}</b></div><h2>{home.brief.headline}</h2><p>{home.brief.summary}</p><ol>{home.brief.priorities.map((item) => <li key={item}>{item}</li>)}</ol><div className="coach-evidence-row">{home.brief.basis.map((item) => <span key={`${item.label}-${item.value}`}><small>{item.label}</small><b>{item.value}</b></span>)}</div><Link href={home.brief.primaryAction.href}>{home.brief.primaryAction.label} →</Link></article>
      <aside className="coach-phase-card"><span>{t("coach.currentPhase")}</span>{home.phase ? <><h3>{t("coach.weekProgress", { current: home.phase.currentWeek, total: home.phase.lengthWeeks })}</h3><div className="phase-progress"><i style={{ width: `${home.phase.progressPct}%` }} /></div><p>{pick(home.phase.weeklyFocus[Math.max(0, home.phase.currentWeek - 1)], locale)}</p><small>{home.today?.scheduledDate} · {pick(home.today?.workout.title, locale) || t("coach.restDay")}</small></> : <><h3>{t("coach.noActivePlan")}</h3><p>{t("coach.noActivePlanHint")}</p></>}<div className="coach-quota"><span>{t("coach.quotaLabel")}</span><b>{t("coach.quotaRemaining", { count: remaining ?? 0 })}</b></div></aside>
    </section>}
    <section className="coach-quick-actions"><div><span>{t("coach.quickAskTitle")}</span><p>{t("coach.quickAskHint")}</p></div>{prompts.map((prompt) => <button key={prompt} onClick={() => { setText(t(prompt)); document.querySelector<HTMLTextAreaElement>(".coach-composer textarea")?.focus(); }}>{t(prompt)}</button>)}</section>
    <div className="coach-chat-layout"><aside className="conversation-list"><span>{t("coach.conversationsTitle")}</span>{conversations.map((conversation) => <button key={conversation.id} className={active === conversation.id ? "active" : ""} onClick={() => { setActive(conversation.id); void loadMessages(conversation.id); }}><b>{conversation.title}</b><small>{dateFormatter(locale).format(new Date(conversation.updatedAt))}</small></button>)}</aside>
      <section className="coach-chat"><div className="coach-message-list">{!messages.length && <div className="coach-empty"><span>C</span><h2>{t("coach.emptyTitle")}</h2><p>{t("coach.emptyHint")}</p></div>}
        {messages.map((message) => <article key={message.id} className={`coach-message ${message.role}`}><span>{message.role === "assistant" ? "C" : t("coach.you")}</span><div><p>{message.content || (sending ? t("coach.thinking") : "")}</p>{message.basis?.length ? <div className="message-basis"><small>{t("coach.basisLabel")}</small>{message.basis.map((item) => <span key={`${item.label}-${item.value}`}><b>{item.label}</b>{item.value}{item.observedAt ? <em>{dateFormatter(locale).format(new Date(item.observedAt))}</em> : null}</span>)}</div> : null}{message.sources?.length ? <div className="message-sources"><small>{t("coach.sourcesLabel")}</small>{message.sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer"><b>{source.title}</b><span>{source.publisher} ↗</span></a>)}</div> : null}{message.limitations?.map((item) => <p className="message-limitation" key={item}>{item}</p>)}
          {message.actions?.map((action) => <div className="coach-action-card" key={action.id}><small>{actionNames[action.type] ? t(actionNames[action.type]) : action.type}</small><b>{action.payload.title}</b><p>{action.payload.description}</p>{action.payload.before || action.payload.after ? <div className="action-diff"><span><small>{t("coach.actionCurrent")}</small>{action.payload.before || "—"}</span><i>→</i><span><small>{t("coach.actionProposed")}</small>{action.payload.after || "—"}</span></div> : null}<p className="action-reason">{action.payload.reason}</p>{action.payload.impact?.length ? <ul>{action.payload.impact.map((item) => <li key={item}>{item}</li>)}</ul> : null}{action.status === "pending" ? <div className="action-buttons"><button onClick={() => void decide(action, "reject")}>{t("coach.actionKeep")}</button><button onClick={() => void decide(action, "accept")}>{t("coach.actionAccept")}</button></div> : <em>{action.status === "accepted" ? t("coach.actionAccepted") : action.status === "rejected" ? t("coach.actionRejected") : action.status === "expired" ? t("coach.actionExpired") : t("coach.actionFailed")}</em>}</div>)}
          {message.role === "assistant" && message.content ? <div className="message-feedback"><span>{t("coach.feedbackQuestion")}</span><button onClick={() => void feedback(message.id, 1)}>{t("coach.feedbackHelpful")}</button><button onClick={() => void feedback(message.id, -1)}>{t("coach.feedbackNeedsWork")}</button></div> : null}</div></article>)}<div ref={endRef} /></div>
        <div className="coach-composer"><textarea value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder={t("coach.composerPlaceholder")} />{sending ? <button className="stop" onClick={() => abortRef.current?.abort()}>{t("coach.stop")}</button> : <button disabled={!text.trim()} onClick={() => void send()}>{t("coach.send")}</button>}</div>{error && <p className="chat-error">{error} <button onClick={() => void send(messages.filter((item) => item.role === "user").at(-1)?.content)}>{t("coach.retry")}</button> <Link href="/pricing">{t("coach.viewEntitlements")}</Link></p>}
      </section>
    </div>{notice && <div className="toast account-toast">{notice}</div>}
  </ProductShell>;
}
