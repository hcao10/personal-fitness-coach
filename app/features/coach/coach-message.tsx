"use client";

import { useLocale } from "../../lib/i18n-provider";
import { dateFormatter } from "../../../packages/i18n/src";
import { BrandMark } from "../../shared/ui/brand-mark";
import { TrainingAdjustmentCard } from "./training-adjustment-card";
import type { Action, Message } from "./types";

export function CoachMessage({ message, working, busy, onDecide, onFeedback }: {
  message: Message; working: boolean; busy: boolean;
  onDecide: (action: Action, decision: "accept" | "reject") => void;
  onFeedback: (id: string, value: 1 | -1) => void;
}) {
  const { locale, t } = useLocale();
  const hasProposal = Boolean(message.actions?.length);
  const showFullReply = !hasProposal || message.safety?.highRisk || message.intent === "safety";
  const relevantWarnings = (message.limitations || []).filter(text => /疼痛|停止|急救|胸痛|眩晕|stop|pain|emergency|dizz/i.test(text));
  if (message.role === "user") return <article className="conversation-message from-user"><p>{message.content}</p></article>;
  return <article className="conversation-message from-coach">
    <div className="conversation-coach-label"><BrandMark size={24} /><span>Cmine Coach</span></div>
    {!message.content && working ? <p className="coach-thinking" role="status">{t("product.design.assistantWorking")}</p>
      : showFullReply ? <p className="conversation-reply">{message.content}</p> : null}
    {relevantWarnings.map(warning => <p className="conversation-warning" key={warning}>{warning}</p>)}
    {message.actions?.map(action => <TrainingAdjustmentCard key={action.id} action={action} busy={busy} onDecide={onDecide} />)}
    {message.content && <details className="conversation-explanation"><summary>{t("product.design.explanation")}</summary>
      {!showFullReply && <p>{message.content}</p>}
      {message.basis?.length ? <dl>{message.basis.map(item => <div key={`${item.label}-${item.value}`}><dt>{item.label}</dt><dd>{item.value}{item.observedAt && <time>{dateFormatter(locale, item.observedAt.length === 10 ? { timeZone: "UTC" } : undefined).format(new Date(item.observedAt))}</time>}</dd></div>)}</dl> : null}
      {message.limitations?.filter(text => !relevantWarnings.includes(text)).map(text => <p key={text}>{text}</p>)}
      {message.sources?.map(source => <a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.title} · {source.publisher}</a>)}
      <div className="conversation-feedback"><button type="button" onClick={() => onFeedback(message.id, 1)}>{t("coach.feedbackHelpful")}</button><button type="button" onClick={() => onFeedback(message.id, -1)}>{t("coach.feedbackNeedsWork")}</button></div>
    </details>}
  </article>;
}
