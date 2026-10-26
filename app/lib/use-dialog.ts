"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]", "button:not([disabled])", "input:not([disabled])", "select:not([disabled])",
  "textarea:not([disabled])", "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * Modal dialog behavior a screen reader and keyboard user actually need:
 * focus moves into the dialog on open, Tab cycles inside it, Escape closes,
 * and focus returns to whatever opened it. `aria-modal` alone does none of
 * this — without a trap, Tab silently walks out into the page behind.
 *
 * Pass `onClose = null` for a dialog that must be answered rather than
 * dismissed (the safety consent gate); Escape then does nothing, but the
 * focus trap still applies.
 */
export function useDialog<T extends HTMLElement = HTMLDivElement>(open: boolean, onClose: (() => void) | null) {
  const ref = useRef<T>(null);
  // Held in a ref so the trap effect does not re-run (and re-focus) whenever
  // the caller passes a new closure.
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const container = ref.current;
    if (!container) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusable = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter((element) => element.offsetParent !== null || element === document.activeElement);

    // Prefer the first control; fall back to the container so the dialog's
    // accessible name is announced even when it holds nothing focusable.
    const initial = focusable()[0];
    if (initial) initial.focus();
    else { container.setAttribute("tabindex", "-1"); container.focus(); }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && closeRef.current) { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) { event.preventDefault(); return; }
      const first = elements[0];
      const last = elements[elements.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !container.contains(active))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      // Only restore if focus is still inside the dialog; the user may have
      // deliberately moved on (e.g. the dialog navigated away).
      const active = document.activeElement;
      // React may detach the dialog before passive cleanup; the browser then
      // moves focus to body. That is still a dismissal, not a deliberate move.
      if (previouslyFocused?.isConnected && (!active || active === document.body || container.contains(active))) previouslyFocused.focus();
    };
  }, [open]);

  return ref;
}
