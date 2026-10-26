"use client";

import type { ReactNode } from "react";
import { useT } from "../../lib/i18n-provider";
import type { EntryState } from "../../../packages/product-state/src";
import { useCapabilities } from "../api/capability-provider";

/**
 * Renders whatever the entry decision turned out to be.
 *
 * The point of this component is that there is no way to render `loading`
 * forever: the union has four other cases, and every one of them ships a
 * control that moves the user somewhere. The error case in particular offers
 * "continue in local mode", because a page whose whole experience can run in
 * the browser should not be blocked by a probe that failed.
 */
export function EntryGate({ entry, missingTables = [], onRetry, onContinueLocal, onSignIn, children }: {
  entry: EntryState;
  missingTables?: string[];
  onRetry: () => void;
  /** Provided by pages that have a real local experience. */
  onContinueLocal?: () => void;
  /** Only ever called when `canSignIn` is true; otherwise no button is shown. */
  onSignIn?: () => void;
  children: (mode: "account" | "guest") => ReactNode;
}) {
  const t = useT();
  const { probeFailed } = useCapabilities();

  if (entry.status === "loading") {
    return <div className="entry-state entry-loading" role="status" aria-live="polite">{t("product.entry.loading")}</div>;
  }

  if (entry.status === "error") {
    return (
      <div className="entry-state entry-error" role="alert">
        <h2>{t("product.entry.errorTitle")}</h2>
        <p>{t("product.entry.errorBody")}</p>
        <div className="entry-actions">
          <button type="button" className="primary-cta" onClick={onRetry}>{t("product.entry.retry")}</button>
          {onContinueLocal && <button type="button" onClick={onContinueLocal}>{t("product.entry.continueLocal")}</button>}
        </div>
      </div>
    );
  }

  if (entry.status === "sign_in_required") {
    return (
      <div className="entry-state entry-signin">
        <h2>{t("product.entry.accountOnlyTitle")}</h2>
        <p>{entry.canSignIn ? t("product.entry.accountOnlyBody") : t("product.entry.accountOnlyUnavailable")}</p>
        <div className="entry-actions">
          {/* A sign-in button is only rendered when signing in can actually
              happen. Showing it on a deployment with no Cmine ID is the dead
              control this whole change exists to remove. */}
          {entry.canSignIn && onSignIn
            ? <button type="button" className="primary-cta" onClick={onSignIn}>{t("product.entry.signIn")}</button>
            : <a className="primary-cta" href="/plan">{t("product.entry.backToPlan")}</a>}
        </div>
      </div>
    );
  }

  return (
    <>
      {entry.status === "guest" && probeFailed && <p className="entry-mode-note" role="status">
        <b>{t("product.access.guestTitle")}</b>{t("product.access.guestBody")}
      </p>}
      {entry.status === "account" && missingTables.length > 0 && (
        <p className="entry-schema-warning" role="alert">
          <b>{t("product.entry.schemaWarningTitle")}</b>
          {t("product.entry.schemaWarningBody", { tables: missingTables.slice(0, 3).join(", ") })}
        </p>
      )}
      {children(entry.status === "account" ? "account" : "guest")}
    </>
  );
}
