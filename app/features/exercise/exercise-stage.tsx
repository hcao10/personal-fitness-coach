/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import { useLocale } from "../../lib/i18n-provider";
import { mediaFor, type ExerciseView } from "../../../packages/exercise-catalog/src";
import { pick } from "../../../packages/i18n/src";

/**
 * The demo image for one movement.
 *
 * A component of its own so callers can reset it with `key={view.id}` instead of
 * clearing the media state from an effect: carrying "missing" over from the
 * previous movement would hide media that is actually there, and an effect that
 * fixes that up runs a render too late.
 *
 * The still loads first and the animation replaces it once decoded. A movement
 * with no shipped media, or media that 404s, says so in words — the whole point
 * of `onError` here is that a broken image frame is a product honesty bug.
 */
export function ExerciseStage({ view, size, animate = true }: {
  view: ExerciseView;
  size: "large" | "compact" | "thumb";
  /** Grid cards pass false: eight autoplaying GIFs on one screen is not a preview. */
  animate?: boolean;
}) {
  const { locale, t } = useLocale();
  const [stillState, setStillState] = useState<"loading" | "ready" | "failed">("loading");
  const [animatedState, setAnimatedState] = useState<"loading" | "ready" | "failed">("loading");
  const name = pick(view.name, locale) || view.id;
  const { still, animated } = mediaFor(view.asset);

  const state = animate && animatedState === "ready" ? "animated" : stillState === "ready" ? "still" : "loading";
  if (!view.asset || (stillState === "failed" && (!animate || animatedState === "failed"))) {
    return <p className={`exercise-stage-missing ${size}`}>{t("product.viewer.mediaMissing")}</p>;
  }

  return (
    <span className={`exercise-stage ${size} ${state}`}>
      {still && (
        <img
          className="exercise-stage-still" src={still} alt={state === "animated" ? "" : t("product.viewer.stillAlt", { name })}
          width={640} height={480}
          onLoad={() => setStillState("ready")}
          onError={() => setStillState("failed")}
        />
      )}
      {animate && animated && (
        <img
          className="exercise-stage-animated" src={animated} alt={t("product.viewer.animatedAlt", { name })}
          width={640} height={480}
          onLoad={() => setAnimatedState("ready")}
          // A missing GIF is not a missing exercise: if the still arrived, the
          // stage keeps it rather than falling back to the empty state.
          onError={() => setAnimatedState("failed")}
        />
      )}
    </span>
  );
}
