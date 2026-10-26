"use client";

import { createEventSink, type ProductEvent } from "../../../packages/product-state/src";
import { readJson, writeJson } from "../storage";

/**
 * A typed sink for the core funnel.
 *
 * Deliberately not an analytics vendor. The question this answers is whether
 * `profile_completed → plan_accepted → workout_started → workout_completed →
 * workout_feedback_submitted` happens at all, and that can be answered from the
 * browser's own session storage until there is a reason to ship it somewhere.
 *
 * Nothing user-authored is recorded — no question text, no limitations note, no
 * name. See `ProductEvent`, where that constraint is in the type.
 */

const STORAGE_KEY = "cmine_fit_product_events_v1";
const sink = createEventSink(200);

export function emitProductEvent(event: ProductEvent): void {
  sink.emit(event);
  if (typeof window === "undefined") return;
  // Session storage, not local: this is a diagnostic tail, not a record to keep.
  writeJson(STORAGE_KEY, sink.peek(), "session");
}

export function recordedProductEvents(): Array<ProductEvent & { at: string }> {
  if (typeof window === "undefined") return sink.peek();
  return readJson<Array<ProductEvent & { at: string }>>(STORAGE_KEY, "session") || sink.peek();
}
