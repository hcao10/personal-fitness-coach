"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../shared/api/client";
import type { LocalizedPartial } from "../../../packages/i18n/src";

/**
 * Dataset instruction steps for a movement, fetched once and remembered.
 *
 * The plannable pool carries one reviewed cue per exercise; the full dataset
 * carries the numbered steps. Shipping all of them to the browser would be a
 * megabyte of JSON for a modal most sessions never open, and the endpoint is
 * unauthenticated precisely so a signed-out user following a GIF still gets
 * them.
 *
 * A failure is not an error state here: the viewer already has the reviewed
 * cue, the breathing note, the mistakes and the stop conditions, none of which
 * need the network. Steps are an enrichment, so their absence is silent.
 */

const cache = new Map<string, LocalizedPartial<string[]>>();

type Fetched = { id: string; steps: LocalizedPartial<string[]> };

export function useExerciseSteps(catalogId: string | null, alreadyHasSteps: boolean): LocalizedPartial<string[]> | null {
  // A cache hit is read during render rather than copied into state by an
  // effect: the value is already available, and an effect would show the
  // fallback cue for one render before replacing it.
  const cached = catalogId ? cache.get(catalogId) ?? null : null;
  const [fetched, setFetched] = useState<Fetched | null>(null);

  useEffect(() => {
    if (!catalogId || alreadyHasSteps || cache.has(catalogId)) return;
    let active = true;
    const controller = new AbortController();
    void apiFetch<{ exercises: Array<{ id: string; instructions?: LocalizedPartial<string[]> }> }>(
      `/api/v1/exercises/guidance?ids=${encodeURIComponent(catalogId)}`,
      { signal: controller.signal, timeoutMs: 8_000 },
    ).then((result) => {
      if (!active || !result.ok) return;
      const found = result.data.exercises.find((item) => item.id === catalogId)?.instructions;
      if (!found) return;
      cache.set(catalogId, found);
      setFetched({ id: catalogId, steps: found });
    });
    return () => { active = false; controller.abort(); };
  }, [catalogId, alreadyHasSteps]);

  if (cached) return cached;
  // Keyed by id so a slow response for the previous movement cannot be shown
  // against the current one.
  return fetched && fetched.id === catalogId ? fetched.steps : null;
}
