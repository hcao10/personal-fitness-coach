"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ProductShell from "../../components/product-shell";
import { localizeApiError, type ApiErrorBody } from "../../lib/api-error";
import { useLocale } from "../../lib/i18n-provider";
import { beginCmineLogin } from "../../lib/auth";
import { useEntry } from "../../shared/api/capability-provider";
import { apiFetch, apiPost } from "../../shared/api/client";
import { emitProductEvent } from "../../shared/analytics/product-events";
import { planRepository } from "../plan/repository";
import type { PlanRecord } from "../plan/plan-imports";
import {
  coachRulesAnswer, composerReadiness, decodeCoachContext,
  type CoachContext, type CoachRulesResult, type CoachTurnState,
} from "../../../packages/product-state/src";
import { pick, type Localized, type MessageKey } from "../../../packages/i18n/src";
import { CoachMessage } from "./coach-message";
import { BrandMark } from "../../shared/ui/brand-mark";
import { Dialog } from "../../shared/ui/dialog";
import type { Action, Message, Evidence, Source, Conversation } from "./types";

/**
 * The full coach page.
 *
 * What changed: it no longer redirects to a sign-in that may not exist, and the
 * composer can no longer be enabled when sending would do nothing. Before, an
 * unauthenticated visitor got the chat shell with no conversation behind it, so
 * the send button rendered live and `send()` returned silently on its first line.
 *
 * The AI path — streaming, evidence, stated limitations, confirmable action
 * cards — is unchanged and still the only thing that answers free text. What is
 * new is that when there is no model or no account, the page is a working
 * deterministic coach rather than a broken chat window.
 */

type Home = {
  brief: { headline: string; summary: string; priorities: string[]; primaryAction: { label: string; href: string }; basis: Evidence[]; dataState: string };
  phase: { kind: string; lengthWeeks: number; currentWeek: number; progressPct: number; weeklyFocus: Array<Localized> } | null;
  today: { occurrenceId: string | null; scheduledDate: string; dayIndex: number; versionId?: string; status: string; mode: string; workout: { title: Localized; duration: number; restDay?: boolean } } | null;
  pendingActions: Action[]; memoryCount: number; product: { membership: { tier: string }; usage: { capabilities: Record<string, { remaining: number }> } };
  nutritionToday: { calories: number; protein: number; calorieTarget: number | null; proteinTarget: number | null };
};

const RULES_PROMPTS: Array<{ intent: CoachContext["intent"]; key: MessageKey }> = [
  { intent: "why_this_plan", key: "product.coach.quickWhyPlan" },
  { intent: "not_enough_time", key: "product.coach.quickShort" },
];
const AI_PROMPTS = ["coach.promptDeload", "coach.promptSwapExercise", "coach.promptWhyThisPlan", "coach.promptNoProgress"] as const;


export default function CoachPageClient() {
  const { locale, t } = useLocale();
  const probe = useEntry(true);
  const newChatTitleRef = useRef(t("coach.newChatTitle"));
  const [home, setHome] = useState<Home | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [turn, setTurn] = useState<CoachTurnState>({ status: "idle" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deciding, setDeciding] = useState<string | null>(null);
  const lastRequest = useRef<{ id: string; content: string; scene: CoachContext; conversationId: string } | null>(null);
  const [record, setRecord] = useState<PlanRecord | null>(null);
  const [context, setContext] = useState<CoachContext | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const signedIn = Boolean(probe.session?.signedIn);
  const aiAvailable = Boolean(probe.capabilities?.ai);
  const accountsConfigured = Boolean(probe.capabilities?.accounts);
  // AI mode needs both a model and an account. Anything else is rules mode,
  // which is a working coach rather than a disabled one.
  const chatMode: "ai" | "rules" = signedIn && aiAvailable ? "ai" : "rules";

  const loadHome = useCallback(async () => {
    const response = await apiFetch<Home>("/api/v1/coach/home");
    if (response.ok) setHome(response.data);
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    const response = await apiFetch<{ messages: Message[] }>(`/api/v1/coach/conversations/${id}/messages`);
    if (response.ok) setMessages(response.data.messages);
    try {
      const saved = window.sessionStorage.getItem(`cmine_fit_coach_retry:${id}`);
      lastRequest.current = saved ? JSON.parse(saved) : null;
      if (saved) setError(t('coach.retryPending'));
    } catch { lastRequest.current = null; }
  }, [t]);

  useEffect(() => {
    if (probe.entry.status === "loading") return;
    let active_ = true;
    void (async () => {
      // The plan is what the deterministic answers reason over, and it loads in
      // both modes — a signed-out reader gets the local one.
      const plan = await planRepository(signedIn ? "account" : "guest", locale).load();
      if (!active_) return;
      setRecord(plan.status === "active" || plan.status === "draft" ? plan.record : null);
      const parsed = decodeCoachContext(window.location.search);
      if (parsed) setContext(parsed);
      // Restore whatever the dock or a previous visit left in the box.
      try {
        const draft = window.sessionStorage.getItem("cmine_fit_coach_draft");
        if (draft) setText((current) => current || draft.slice(0, 2000));
      } catch { /* private window */ }
      if (chatMode !== "ai") return;
      const list = await apiFetch<{ conversations: Conversation[] }>("/api/v1/coach/conversations");
      if (!active_ || !list.ok) return;
      let conversationList = list.data.conversations;
      if (!conversationList.length) {
        const created = await apiPost<{ conversation: Conversation }>("/api/v1/coach/conversations", { title: newChatTitleRef.current });
        if (created.ok) conversationList = [created.data.conversation];
      }
      if (!active_) return;
      setConversations(conversationList);
      if (conversationList[0]) { setActive(conversationList[0].id); await loadMessages(conversationList[0].id); }
      await loadHome();
    })();
    return () => { active_ = false; };
  }, [probe.entry.status, chatMode, signedIn, locale, loadHome, loadMessages]);

  useEffect(() => {
    const end = endRef.current;
    const container = end?.parentElement;
    const latest = end?.previousElementSibling;
    if (!container || !latest) return;
    // Scroll inside the conversation; never drag the page header under the
    // sticky navigation. Anchor a new response at its beginning, not its footer.
    const top = container.scrollTop + latest.getBoundingClientRect().top - container.getBoundingClientRect().top - 16;
    container.scrollTo({ top: Math.max(0, top), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }, [messages]);
  useEffect(() => { try { window.sessionStorage.setItem("cmine_fit_coach_draft", text); } catch { /* private window */ } }, [text]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(""), 4000); return () => window.clearTimeout(timer); }, [notice]);

  const rulesAnswer: CoachRulesResult | null = useMemo(
    () => context ? coachRulesAnswer({ ...context, locale, plan: record }) : null,
    [context, locale, record],
  );

  const readiness = composerReadiness({
    text, turn, conversationId: active, mode: chatMode, signedIn, accountsConfigured,
  });

  const create = async () => {
    const response = await apiPost<{ conversation: Conversation }>("/api/v1/coach/conversations", { title: t("coach.newChatTitle") });
    if (!response.ok) return;
    setConversations((current) => [response.data.conversation, ...current]);
    setActive(response.data.conversation.id);
    setMessages([]);
  };

  const send = async (override?: string, retry = false) => {
    const content = (override || text).trim();
    if (!content || (!retry && !readiness.canSend) || turn.status === "sending" || turn.status === "streaming") return;
    if (chatMode === "rules") {
      // Free text is the one thing that genuinely needs a model. Rather than a
      // send button that quietly does nothing — which is what this page shipped
      // — the deterministic layer answers with what it *can* answer, and the
      // question stays in the box so it is not silently swallowed.
      setContext({ intent: "free_text", planId: record?.id, dayIndex: context?.dayIndex, exerciseId: context?.exerciseId });
      emitProductEvent({ name: "coach_question_sent", intent: "free_text", source: "rules", hasExerciseContext: Boolean(context?.exerciseId) });
      return;
    }
    if (!active) return;
    const request = retry ? lastRequest.current : { id: crypto.randomUUID(), content, conversationId: active,
      scene: { ...context, intent: context?.intent || "free_text", occurrenceId: context?.occurrenceId || home?.today?.occurrenceId || undefined,
        baseVersionId: context?.baseVersionId || home?.today?.versionId, dayIndex: context?.dayIndex ?? home?.today?.dayIndex } };
    if (!request || request.conversationId !== active) return;
    lastRequest.current = request;
    try { window.sessionStorage.setItem(`cmine_fit_coach_retry:${active}`, JSON.stringify(request)); } catch { /* private window */ }
    const tempId = request.id;
    setText("");
    try { window.sessionStorage.removeItem("cmine_fit_coach_draft"); } catch { /* private window */ }
    setError("");
    setTurn({ status: "sending" });
    setMessages((current) => [...current.filter(item => item.id !== `${tempId}:assistant`),
      ...(retry ? [] : [{ id: tempId, role: "user" as const, content, createdAt: new Date().toISOString() }]),
      { id: `${tempId}:assistant`, role: "assistant", content: "", createdAt: new Date().toISOString(), actions: [] }]);
    emitProductEvent({ name: "coach_question_sent", intent: context?.intent || "free_text", source: "ai", hasExerciseContext: Boolean(context?.exerciseId) });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch(`/api/v1/coach/conversations/${active}/messages`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: request.content, scene: request.scene, clientMutationId: tempId, retry }), signal: controller.signal,
      });
      // A refused turn answers with an error JSON instead of a stream, and its
      // code is the only thing that says which refusal it was.
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
        throw new Error(localizeApiError(body, locale, t("coach.replyUnavailable")));
      }
      setTurn({ status: "streaming", text: "" });
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";
        for (const block of blocks) {
          const event = block.match(/^event: (.+)$/m)?.[1];
          const raw = block.match(/^data: (.+)$/m)?.[1];
          if (!event || !raw) continue;
          const data = JSON.parse(raw) as Record<string, unknown>;
          if (event === "message.completed") completed = true;
          if (event === "message.delta") setMessages((current) => current.map((item) => item.id === `${tempId}:assistant` ? { ...item, content: item.content + String(data.delta || "") } : item));
          if (event === "message.metadata") setMessages((current) => current.map((item) => item.id === `${tempId}:assistant` ? { ...item, intent: String(data.intent || ""), safety: data.safety as Message["safety"], basis: data.basis as Evidence[] || [], limitations: data.limitations as string[] || [], sources: data.sources as Source[] || [] } : item));
          if (event === "action.proposed") setMessages((current) => current.map((item) => item.id === `${tempId}:assistant` ? { ...item, actions: [...(item.actions || []), data as unknown as Action] } : item));
          if (event === "message.error") throw new Error(localizeApiError(data as ApiErrorBody, locale, t("coach.replyUnavailable")));
        }
      }
      if (!completed) throw new Error(t("coach.replyUnavailable"));
      try { window.sessionStorage.removeItem(`cmine_fit_coach_retry:${active}`); } catch { /* private window */ }
      await Promise.all([loadMessages(active), loadHome()]);
    } catch (caught) {
      setError((caught as Error).name === "AbortError" ? t('coach.retryPending') : caught instanceof Error ? caught.message : t("coach.sendFailed"));
    } finally {
      abortRef.current = null;
      setTurn({ status: "idle" });
    }
  };

  const decide = async (action: Action, decision: "accept" | "reject") => {
    if (deciding) return;
    setDeciding(action.id);
    const response = await apiPost<{ status?: string; draftUrl?: string; result?: { scope?: string } }>(`/api/v1/coach/actions/${action.id}/${decision}`, {});
    setDeciding(null);
    if (!response.ok) { setNotice(localizeApiError({ error: response.code, message: response.serverMessage }, locale, t("coach.actionUnavailable"))); if (active) await loadMessages(active); return; }
    const status = String(response.data.status || (decision === "accept" ? "accepted" : "rejected"));
    setMessages((current) => current.map((message) => ({ ...message, actions: message.actions?.map((item) => item.id === action.id ? { ...item, status, draftUrl: response.data.draftUrl } : item) })));
    setNotice(status === "expired" ? t("coach.actionExpiredNotice") : decision === "accept"
      ? response.data.result?.scope === 'occurrence' ? t('coach.sessionAppliedNotice') : t("coach.actionAcceptedNotice")
      : t("coach.actionRejectedNotice"));
    emitProductEvent(decision === "accept" ? { name: "coach_action_accepted", actionType: action.type } : { name: "coach_action_rejected", actionType: action.type });
    await loadHome();
  };

  const feedback = async (messageId: string, rating: 1 | -1) => {
    await apiPost(`/api/v1/coach/messages/${messageId}/feedback`, { rating });
    setNotice(rating === 1 ? t("coach.feedbackThanks") : t("coach.feedbackNoted"));
  };

  const composerHint = readiness.canSend ? null
    : readiness.reason === "sign_in_required" ? t("product.coach.cannotSendSignIn")
    : readiness.reason === "not_configured" ? t("product.coach.cannotSendNotConfigured")
    : readiness.reason === "no_conversation" ? t("product.coach.cannotSendNoConversation")
    : null;

  const working = turn.status === "streaming" || turn.status === "sending";
  const chooseConversation = (id: string) => { setActive(id); setHistoryOpen(false); void loadMessages(id); };
  const history = <div className="coach-history-items">{conversations.map(conversation => <button type="button" key={conversation.id}
    className={active === conversation.id ? "selected" : ""} aria-pressed={active === conversation.id}
    disabled={working} onClick={() => chooseConversation(conversation.id)} title={conversation.title}>{conversation.title.split(/[，,。.!?！？\n]/u)[0].slice(0, 30)}</button>)}</div>;

  return <ProductShell active="/coach" className="coach-workspace" title={t("product.design.workspaceTitle")} eyebrow={t("product.design.workspaceSubtitle")}
    action={<div className="header-actions-inline">
      {chatMode === "ai" && <button type="button" className="header-chip coach-mobile-history" onClick={() => setHistoryOpen(true)}>{t("product.design.history")}</button>}
      {chatMode === "ai" && <button type="button" className="header-chip" disabled={working} onClick={() => void create()}>{t("product.design.newConversation")}</button>}
      <Link className="header-chip" href="/coach/memory">{t("product.design.preferences")}</Link>
    </div>}>
    {probe.entry.status === "loading" ? <div className="coach-connecting" role="status">{t("product.design.connecting")}</div> : <>
      {chatMode === "ai" ? <div className="coach-workspace-grid">
        <aside className="coach-history" aria-label={t("product.design.history")}>
          <div className="coach-history-heading">{t("product.design.recentConversations")}</div>
          {history}
          <div className="coach-history-footer"><Link href="/plan">{t("product.plan.eyebrow")}</Link><Link href="/coach/memory">{t("product.design.preferences")}</Link></div>
        </aside>
        <section className="coach-conversation" aria-label={t("product.design.workspaceTitle")}>
          <header className="coach-conversation-heading"><div><span className="coach-presence" /><b>Cmine Coach</b></div>
            <Link href="/today">{home?.today ? pick(home.today.workout.title, locale) : t("product.design.today")}</Link>
          </header>
          <div className="coach-conversation-scroll">
            {!messages.length && <div className="coach-welcome"><BrandMark size={48} /><h2>{t("product.design.chatTitle")}</h2><p>{t("product.design.welcomeBody")}</p>
              <div className="coach-suggestions">{(["product.design.quickTime", ...AI_PROMPTS.slice(0, 2)] as const).map(prompt => <button type="button" key={prompt} onClick={() => setText(t(prompt))}>{t(prompt)}</button>)}</div>
            </div>}
            {messages.map(message => <CoachMessage key={message.id} message={message} working={working} busy={Boolean(deciding)}
              onDecide={(action, decision) => void decide(action, decision)} onFeedback={(id, value) => void feedback(id, value)} />)}
            <div ref={endRef} />
          </div>
          {error && <p className="conversation-error" role="alert">{error}<button disabled={working} onClick={() => void send(lastRequest.current?.content, true)}>{t("coach.retry")}</button></p>}
          <div className="conversation-composer-wrap">
            <div className="conversation-composer"><label className="sr-only" htmlFor="coach-composer-input">{t("product.design.composerLabel")}</label>
              <textarea id="coach-composer-input" rows={2} value={text} onChange={event => setText(event.target.value)}
                onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && readiness.canSend) { event.preventDefault(); void send(); } }}
                placeholder={t("product.design.composerPlaceholder")} />
              {working ? <button type="button" className="composer-stop" onClick={() => abortRef.current?.abort()}>{t("coach.stop")}</button>
                : <button type="button" disabled={!readiness.canSend} onClick={() => void send()}>{t("product.design.send")}</button>}
            </div>
            <p className="conversation-composer-note" role="status">{composerHint || t("product.design.confirmationNote")}</p>
          </div>
        </section>
      </div> : <section className="coach-guidance"><BrandMark size={44} /><h2>{t("product.design.guidanceTitle")}</h2><p>{t("product.design.guidanceBody")}</p>
        <div className="coach-suggestions">{RULES_PROMPTS.map(prompt => <button key={prompt.intent} type="button" onClick={() => setContext({ intent: prompt.intent, planId: record?.id, dayIndex: context?.dayIndex ?? 0, exerciseId: context?.exerciseId })}>{t(prompt.key)}</button>)}</div>
        {rulesAnswer?.source === "rules" && <article><h3>{rulesAnswer.title}</h3>{rulesAnswer.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}<ul>{rulesAnswer.bullets.map(item => <li key={item}>{item}</li>)}</ul></article>}
        {accountsConfigured && !signedIn && <button className="adjustment-primary" type="button" onClick={() => void beginCmineLogin("/coach", locale)}>{t("product.entry.signIn")}</button>}
      </section>}
    </>}
    {historyOpen && <Dialog open onClose={() => setHistoryOpen(false)} labelledBy="coach-history-title" className="coach-history-dialog"><header><h2 id="coach-history-title">{t("product.design.history")}</h2><button type="button" onClick={() => setHistoryOpen(false)}>{t("product.viewer.close")}</button></header>{history}</Dialog>}
    {notice && <div className="toast account-toast" role="status">{notice}</div>}
  </ProductShell>;
}
