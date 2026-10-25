"use client";

import Link from "next/link";
import { useCallback, useId, useMemo, useState } from "react";
import { useLocale } from "../../lib/i18n-provider";
import { emitProductEvent } from "../../shared/analytics/product-events";

import {
  coachRulesAnswer, encodeCoachContext,
  type CoachContext, type CoachRulesResult, type PlanRecord,
} from "../../../packages/product-state/src";
import { fromPlannedExercise } from "../../../packages/exercise-catalog/src";
import { pick } from "../../../packages/i18n/src";
import { COACH_INTENT_LABELS } from "./intent-labels";

/**
 * The coach, reachable from wherever the user is.
 *
 * Two forms, as the product needs: a global entry point that follows the reader
 * across the plan, the session and the library; and contextual questions that
 * carry `planId / dayIndex / exerciseId` as structured fields rather than a
 * sentence stuffed into `?prompt=`.
 *
 * The deterministic intents are answered here, in the browser, with no network
 * and no account — that is what makes "no LLM" stop meaning "no coach". Free
 * text is the one thing that genuinely needs a model, so it hands off to the
 * full coach page (which owns the streaming, the evidence and the confirmable
 * action cards) rather than growing a second copy of that machinery here.
 */


export function CoachDock({ plan, dayIndex, aiAvailable, signedIn, accountsConfigured, request, occurrenceId, baseVersionId, contextualOnly = false }: {
  plan: PlanRecord | null;
  dayIndex?: number;
  occurrenceId?: string;
  baseVersionId?: string;
  aiAvailable: boolean;
  signedIn: boolean;
  accountsConfigured: boolean;
  contextualOnly?: boolean;
  /**
   * A question raised elsewhere — the exercise viewer, the session player.
   * Callers pass a fresh object per ask; identity is what marks it as new.
   */
  request?: CoachContext | null;
}) {
  const { locale, t } = useLocale();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<CoachContext | null>(null);
  const [text, setText] = useState("");

  const ask = useCallback((next: CoachContext) => {
    setContext(next);
    setOpen(true);
    emitProductEvent({ name: "coach_question_sent", intent: next.intent, source: "rules", hasExerciseContext: Boolean(next.exerciseId) });
  }, []);

  // Adjusting state during render rather than in an effect: an effect would
  // open the panel a render late, and would have to call back into the parent
  // to clear the request, which is a second cascading update for one click.
  const [handledRequest, setHandledRequest] = useState(request);
  if (request && request !== handledRequest) {
    setHandledRequest(request);
    setContext(request);
    setOpen(true);
    emitProductEvent({ name: "coach_opened", surface: "exercise" });
  }

  const answer: CoachRulesResult | null = useMemo(
    () => context ? coachRulesAnswer({ ...context, locale, plan }) : null,
    [context, locale, plan],
  );

  const exerciseName = useMemo(() => {
    if (!context?.exerciseId || !plan) return null;
    for (const day of plan.plan.schedule) {
      const match = day.exercises.find((exercise) => exercise.id === context.exerciseId);
      if (match) return pick(fromPlannedExercise(match).name, locale);
    }
    return null;
  }, [context, plan, locale]);

  const available = COACH_INTENT_LABELS.filter((entry) =>
    (!entry.needsExercise || Boolean(context?.exerciseId)) && (!entry.needsDay || dayIndex !== undefined));

  // Free text is the one thing a model is actually needed for. The button is
  // only enabled when handing off can work, and says why when it cannot.
  const handoff = aiAvailable && signedIn
    ? null
    : !accountsConfigured || !aiAvailable ? t("product.coach.cannotSendNotConfigured") : t("product.coach.cannotSendSignIn");

  const coachHref = `/coach?${encodeCoachContext({ ...context, intent: "free_text", planId: plan?.id, dayIndex, occurrenceId, baseVersionId, exerciseId: context?.exerciseId })}`;

  const send = () => {
    if (!text.trim() || handoff) return;
    // The coach page already restores this draft on mount, and stores it as a
    // raw string rather than JSON; reusing that key means the handoff needs no
    // new contract, and matching its format means no quotes leak into the box.
    try { window.sessionStorage.setItem("cmine_fit_coach_draft", text.trim()); } catch { /* private window */ }
    emitProductEvent({ name: "coach_question_sent", intent: "free_text", source: "ai", hasExerciseContext: Boolean(context?.exerciseId) });
    window.location.assign(coachHref);
  };

  if (contextualOnly && !open) return null;
  return (
    <div className={`coach-dock ${open ? "open" : ""}`}>
      <button
        type="button" className="coach-dock-toggle" aria-expanded={open} aria-controls={panelId}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) emitProductEvent({ name: "coach_opened", surface: "dock" });
        }}
      >
        <span aria-hidden="true">C</span>
        {open ? t("product.coach.dockClose") : t("product.coach.dockLabel")}
      </button>

      {open && (
        <section id={panelId} className="coach-dock-panel" aria-label={t("product.coach.title")}>
          <header>
            <h2>{t("product.coach.title")}</h2>
            <span className="coach-badge rules">{t("product.coach.rulesBadge")}</span>
          </header>
          {exerciseName && <p className="coach-dock-subject">{t("product.coach.askAbout", { name: exerciseName })}</p>}

          <div className="coach-dock-intents">
            {available.map((entry) => (
              <button
                key={entry.intent} type="button"
                className={context?.intent === entry.intent ? "active" : ""}
                onClick={() => ask({ intent: entry.intent, planId: plan?.id, dayIndex, exerciseId: context?.exerciseId, availableMinutes: context?.availableMinutes })}
              >
                {t(entry.key)}
              </button>
            ))}
          </div>

          {!answer && <p className="coach-dock-empty">{t("product.coach.emptyPrompt")}</p>}

          {answer && (
            <article className={`coach-dock-answer ${answer.source}`}>
              <h3>{answer.title}</h3>
              {answer.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {answer.source === "rules" ? (
                <>
                  {answer.bullets.length > 0 && <ol>{answer.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ol>}
                  {answer.substitutes.length > 0 && (
                    <ul className="coach-dock-substitutes">
                      {answer.substitutes.map((substitute) => <li key={substitute.id}>{pick(substitute.name, locale) || substitute.id}</li>)}
                    </ul>
                  )}
                  <footer>
                    <small>{t("product.coach.limitationsTitle")}</small>
                    <ul>{answer.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
                  </footer>
                </>
              ) : (
                <footer>
                  <small>{t("product.coach.answerableTitle")}</small>
                  <ul>
                    {answer.answerable.map((intent) => {
                      const label = COACH_INTENT_LABELS.find((entry) => entry.intent === intent);
                      return label ? <li key={intent}>{t(label.key)}</li> : null;
                    })}
                  </ul>
                </footer>
              )}
            </article>
          )}

          <div className="coach-dock-composer">
            <label className="sr-only" htmlFor={`${panelId}-input`}>{t("product.coach.composerPlaceholder")}</label>
            <textarea
              id={`${panelId}-input`} value={text} rows={2}
              placeholder={t("product.coach.composerPlaceholder")}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }}
            />
            <button type="button" className="primary-cta" disabled={!text.trim() || Boolean(handoff)} onClick={send}>
              {t("product.coach.send")}
            </button>
          </div>
          {handoff
            ? <p className="coach-dock-note" role="status">{handoff}</p>
            : <Link className="coach-dock-note" href={coachHref}>{t("product.coach.openFull")} </Link>}
        </section>
      )}
    </div>
  );
}
