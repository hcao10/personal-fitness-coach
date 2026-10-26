"use client";

import { useState } from "react";
import { useT } from "../../lib/i18n-provider";
import { PAIN_THRESHOLD } from "../../../packages/domain/src/safety";
import type { NextStepAdvice, WorkoutFeedback } from "../../../packages/product-state/src";
import type { MessageKey } from "../../lib/i18n";

/**
 * Three questions and one optional note.
 *
 * What it replaces asked for duration, RPE and pain on three sliders before it
 * would accept anything, which is a survey. "How hard was that" is a question
 * people can answer; "rate that 1–10" is not, and the RPE the server stores is
 * derived from the answer rather than demanded from the user.
 */

const ADVICE_COPY: Record<NextStepAdvice["kind"], MessageKey> = {
  stop_and_seek_help: "product.workout.adviceStop",
  recover: "product.workout.adviceRecover",
  hold: "product.workout.adviceHold",
  add_reps: "product.workout.adviceAddReps",
  progress_load: "product.workout.adviceProgress",
  shorten_next: "product.workout.adviceShorten",
};

export function FeedbackPanel({ onSubmit, busy, message, advice, storageNote }: {
  onSubmit: (feedback: WorkoutFeedback) => void;
  busy: boolean;
  message: string;
  /** Set once the feedback is in — the next step, shown immediately. */
  advice: NextStepAdvice | null;
  storageNote: string;
}) {
  const t = useT();
  const [difficulty, setDifficulty] = useState<WorkoutFeedback["difficulty"]>("right");
  const [pain, setPain] = useState(0);
  const [completedSession, setCompletedSession] = useState(true);
  const [note, setNote] = useState("");

  if (advice) {
    return (
      <section className={`workout-advice ${advice.urgent ? "urgent" : ""}`} role="status" aria-live="polite">
        <h2>{t("product.workout.adviceTitle")}</h2>
        <p>{t(ADVICE_COPY[advice.kind])}</p>
        <small>{storageNote}</small>
      </section>
    );
  }

  return (
    <section className="workout-feedback">
      <h2>{t("product.workout.feedbackTitle")}</h2>
      <p className="workout-feedback-note">{t("product.workout.feedbackNote")}</p>

      <fieldset>
        <legend>{t("product.workout.difficultyLabel")}</legend>
        <div role="radiogroup" aria-label={t("product.workout.difficultyLabel")}>
          {(["easy", "right", "hard"] as const).map((value) => (
            <button key={value} type="button" role="radio" aria-checked={difficulty === value}
              className={difficulty === value ? "active" : ""} onClick={() => setDifficulty(value)}>
              {t(`product.workout.difficulty${value === "easy" ? "Easy" : value === "right" ? "Right" : "Hard"}` as MessageKey)}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="workout-pain">
        <span>{t("product.workout.painLabel")}</span>
        <b aria-hidden="true">{t("product.workout.painValue", { pain })}</b>
        <input type="range" min="0" max="10" value={pain} aria-valuetext={t("product.workout.painValue", { pain })}
          onChange={(event) => setPain(Number(event.target.value))} />
      </label>
      {pain >= PAIN_THRESHOLD && <p className="pain-warning" role="alert">{t("product.workout.painWarning")}</p>}

      <fieldset>
        <legend>{t("product.workout.completedLabel")}</legend>
        <div role="radiogroup" aria-label={t("product.workout.completedLabel")}>
          <button type="button" role="radio" aria-checked={completedSession} className={completedSession ? "active" : ""}
            onClick={() => setCompletedSession(true)}>{t("product.workout.completedYes")}</button>
          <button type="button" role="radio" aria-checked={!completedSession} className={!completedSession ? "active" : ""}
            onClick={() => setCompletedSession(false)}>{t("product.workout.completedNo")}</button>
        </div>
      </fieldset>

      <label className="workout-note">
        <span>{t("product.workout.noteLabel")}</span>
        <textarea value={note} rows={2} onChange={(event) => setNote(event.target.value)} />
      </label>

      <button type="button" className="primary-cta" disabled={busy}
        onClick={() => onSubmit({ difficulty, pain, completedSession, note: note.trim() || undefined })}>
        {busy ? t("product.workout.submitting") : t("product.workout.submit")}
      </button>
      {message && <p className="form-message" role="alert">{message}</p>}
    </section>
  );
}
