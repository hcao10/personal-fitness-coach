"use client";

import { useEffect, type ReactNode } from "react";
import { useDialog } from "../../lib/use-dialog";

/**
 * One dialog, so a modal cannot ship without focus management again.
 *
 * There were two exercise modals (Today's and the library's) plus three
 * hand-rolled ones on the homepage, each with its own idea of what Escape does
 * and whether the page behind it scrolls. This wraps `useDialog` — which already
 * traps focus, handles Escape and restores focus — and adds the two things every
 * copy forgot: the page behind must not scroll on a phone, and a click on the
 * backdrop must not be confused with a drag that ended there.
 *
 * `onClose = null` marks a dialog that has to be answered rather than dismissed.
 */
export function Dialog({ open, onClose, labelledBy, label, className = "", backdropClassName = "", children }: {
  open: boolean;
  onClose: (() => void) | null;
  /** Id of the element naming the dialog. Prefer this over `label`. */
  labelledBy?: string;
  label?: string;
  className?: string;
  backdropClassName?: string;
  children: ReactNode;
}) {
  const ref = useDialog<HTMLDivElement>(open, onClose);

  useEffect(() => {
    if (!open) return;
    // Locking the html element rather than body: iOS Safari keeps scrolling the
    // document behind a fixed overlay when only body is locked.
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => { document.documentElement.style.overflow = previous; };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className={`app-dialog-backdrop ${backdropClassName}`.trim()}
      // mousedown, not click: releasing the button over the backdrop after a
      // drag that started inside the dialog is not a dismissal.
      onMouseDown={(event) => { if (onClose && event.target === event.currentTarget) onClose(); }}
      role="presentation"
    >
      <div ref={ref} className={`app-dialog ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : label}>
        {children}
      </div>
    </div>
  );
}
