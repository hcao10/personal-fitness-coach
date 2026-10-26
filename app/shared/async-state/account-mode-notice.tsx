"use client";

import { useState, type ReactNode } from "react";
import { useLocale } from "../../lib/i18n-provider";
import { beginCmineLogin } from "../../lib/auth";
import { useCapabilities } from "../api/capability-provider";
import { Icon } from "../ui/icon";

/** Uses the existing OAuth entry point; no alternate guest credential or session. */
export function CmineSignInButton({ returnTo, beforeSignIn, children, className = "primary-cta" }: {
  returnTo?: string; beforeSignIn?: () => void; children?: ReactNode; className?: string;
}) {
  const { locale, t } = useLocale();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const signIn = async () => {
    if (pending) return;
    setPending(true);
    setError("");
    beforeSignIn?.();
    const result = await beginCmineLogin(returnTo ?? `${window.location.pathname}${window.location.search}${window.location.hash}`, locale);
    if (!result.ok) {
      setError(result.message || t("auth.signInServiceUnreachable"));
      setPending(false);
    }
  };
  return <div className="mode-signin">
    <button className={className} type="button" disabled={pending} onClick={() => void signIn()}>
      {pending ? t("product.access.connecting") : children ?? t("product.access.signIn")}
    </button>
    {error && <p className="mode-signin-error" role="alert">{error}</p>}
  </div>;
}

/** One status location across product pages, based on the existing session probe. */
export function AccountModeNotice() {
  const { t } = useLocale();
  const probe = useCapabilities();
  if (!probe.session || !probe.capabilities || probe.probeFailed) return null;
  const signedIn = probe.session.signedIn;
  return <aside className={`account-mode-notice ${signedIn ? "is-account" : "is-guest"}`} aria-label={t("product.access.label")}>
    <span className="account-mode-icon"><Icon name={signedIn ? "account" : "security"} /></span>
    <div className="account-mode-copy">
      <b>{t(signedIn ? "product.access.accountTitle" : "product.access.guestTitle")}</b>
      <p>{t(signedIn ? "product.access.accountBody" : "product.access.guestBody")}</p>
      {!signedIn && !probe.capabilities.accounts && <p>{t("product.access.unavailable")}</p>}
    </div>
    {!signedIn && probe.capabilities.accounts && <CmineSignInButton />}
  </aside>;
}
