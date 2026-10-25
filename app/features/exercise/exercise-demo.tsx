"use client";

import { useState, useSyncExternalStore } from "react";
import { useLocale } from "../../lib/i18n-provider";
import type { ExerciseView } from "../../../packages/exercise-catalog/src";
import { ExerciseStage } from "./exercise-stage";

const motionQuery = "(prefers-reduced-motion: reduce)";
const subscribe = (notify: () => void) => {
  const query = window.matchMedia(motionQuery);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};
const reducedMotion = () => window.matchMedia(motionQuery).matches;
const serverMotion = () => true;

/** Shared playback controls for the workout and the detail sheet. */
export function ExerciseDemo({ view, size }: { view: ExerciseView; size: "large" | "compact" }) {
  const { t } = useLocale();
  const prefersStill = useSyncExternalStore(subscribe, reducedMotion, serverMotion);
  const [playing, setPlaying] = useState<boolean | null>(null);
  const animate = playing ?? !prefersStill;
  return <div className="exercise-demo">
    <ExerciseStage key={view.id} view={view} size={size} animate={animate} />
    {view.asset && <button type="button" className="exercise-playback" aria-pressed={animate}
      onClick={() => setPlaying(!animate)}>{t(animate ? "product.viewer.pauseDemo" : "product.viewer.playDemo")}</button>}
  </div>;
}
