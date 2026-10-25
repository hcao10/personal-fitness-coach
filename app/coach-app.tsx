"use client";

import Link from "next/link";
import Image from "next/image";
import { BrandMark } from "./shared/ui/brand-mark";
import { Icon } from "./shared/ui/icon";
import { useEffect, useState } from "react";
import { AUTH_PROVIDERS, beginCmineLogin } from "./lib/auth";
import { languageOptions, type Locale } from "./lib/i18n";
import { useLocale } from "./lib/i18n-provider";
import { localizeApiError } from "./lib/api-error";
import { CONSENT_STORAGE_KEY, FALLBACK_DISCLAIMER_VERSION, FALLBACK_PRIVACY_VERSION, PRODUCT_VERSION, consentStamp } from "./lib/consent-versions";
import { useDialog } from "./lib/use-dialog";
import { useCapabilities } from "./shared/api/capability-provider";
import { apiFetch, apiPost } from "./shared/api/client";
import { readLocalPlan } from "./features/plan/repository";

/**
 * The marketing homepage. One job, one primary button.
 *
 * This file used to be the whole product: 447 lines and twenty-odd pieces of
 * local state carrying the marketing copy, a full intake form, a live plan
 * preview, the generated plan, sign-in, the consent gate, exercise completion
 * and the reward-ad flow. Two consequences followed. The intake here and the
 * seven-step one behind sign-in were separate drafts, so signing in meant
 * answering the same questions twice; and a generated plan expanded a section
 * below the form that produced it, so "here is your plan" never got a screen.
 *
 * The questions now live at /onboarding and the plan at /plan. What stays here
 * is why someone would use this, one call to action, and the two dialogs that
 * genuinely belong to the site rather than to a page: the consent gate and
 * sign-in.
 */
export default function CoachApp() {
  const { locale, t, setLocale: changeLocale } = useLocale();
  const probe = useCapabilities();
  const [announcement, setAnnouncement] = useState("");
  const [consentVersions, setConsentVersions] = useState({ disclaimer: FALLBACK_DISCLAIMER_VERSION, privacy: FALLBACK_PRIVACY_VERSION });
  const [accepted, setAccepted] = useState<boolean | null>(null);
  const [healthCheck, setHealthCheck] = useState(false);
  const [estimateCheck, setEstimateCheck] = useState(false);
  const [hasPlan, setHasPlan] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [adOpen, setAdOpen] = useState(false);
  const [adClaimed, setAdClaimed] = useState(false);
  const [toast, setToast] = useState("");
  const [timezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");

  // The consent gate passes null: it must be answered, not dismissed.
  const consentDialogRef = useDialog(Boolean(probe.session?.signedIn) && accepted === false, null);
  const loginDialogRef = useDialog(loginOpen, () => setLoginOpen(false));
  const adDialogRef = useDialog(adOpen, () => setAdOpen(false));

  useEffect(() => {
    void (async () => {
      // `/api/v1/site` degrades to shipped defaults now rather than 500ing on an
      // un-migrated database, so this no longer decides the consent gate by
      // catch block.
      const site = await apiFetch<{ announcement?: string; disclaimerVersion?: string; privacyVersion?: string }>("/api/v1/site");
      const disclaimer = (site.ok && site.data.disclaimerVersion) || FALLBACK_DISCLAIMER_VERSION;
      const privacy = (site.ok && site.data.privacyVersion) || FALLBACK_PRIVACY_VERSION;
      setAnnouncement(site.ok ? site.data.announcement || "" : "");
      setConsentVersions({ disclaimer, privacy });
      try { setAccepted(localStorage.getItem(CONSENT_STORAGE_KEY) === consentStamp(disclaimer, privacy)); }
      catch { setAccepted(false); }
      // A plan on this device turns the call to action into "open my plan" —
      // sending a returning user back through intake is how the old homepage
      // asked for the same answers twice.
      const local = readLocalPlan();
      setHasPlan(local.status === "draft" || local.status === "active");
      const authError = new URLSearchParams(window.location.search).get("auth_error");
      if (authError) setToast(authError);
    })();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 4200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const signIn = async () => {
    const result = await beginCmineLogin("/plan", locale);
    // beginCmineLogin resolved its message in `locale` already; the fallback is
    // a catalog key rather than a Chinese literal.
    if (!result.ok) { setLoginOpen(false); setToast(result.message || t("auth.signInUnavailable")); }
  };

  const user = probe.session?.user ?? null;
  const returning = hasPlan || Boolean(user);
  const ctaHref = returning ? "/today" : "/onboarding";

  return (
    <main className="calm-home">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Cmine Fit home"><BrandMark /><span>CMINE <b>FIT</b></span></a>
        <nav className="topnav" aria-label="Primary navigation">
          <Link href="/today">{t("nav.today")}</Link>
          <Link href="/nutrition">{t("home.linkNutrition")}</Link>
          <a href="#editions">{t("home.navAbout")}</a>
          <Link href="/pricing">{t("home.navPricing")}</Link>
        </nav>
        <div className="header-actions">
          <label className="language-select"><span className="sr-only">Language</span>
            <select value={locale} onChange={(event) => void changeLocale(event.target.value as Locale)}>
              {languageOptions.map((language) => <option key={language.value} value={language.value}>{language.label}</option>)}
            </select>
          </label>
          {user && probe.capabilities?.rewardAds && (
            <button className="points-pill" onClick={() => setAdOpen(true)} aria-label={t("home.watchAd")}><span>◆</span> {probe.session?.points ?? 0}</button>
          )}
          {user
            ? <Link className="avatar-button" href="/account"><span>{(user.name || user.email || "C").slice(0, 1).toUpperCase()}</span><em>{t("home.myTraining")}</em></Link>
            // Only offered when signing in can actually happen. On a deployment
            // with no Cmine ID this button used to open a dialog whose only
            // outcome was an error toast.
            : probe.capabilities?.accounts
              ? <button className="login-button" onClick={() => setLoginOpen(true)}>{t("home.login")} <span></span></button>
              : null}
        </div>
      </header>
      {announcement && <div className="site-announcement" role="status"><span>CMINE FIT</span><p>{announcement}</p></div>}

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">CMINE FIT · {t("home.eyebrow")}</p>
          <h1>{t("product.design.heroTitle")}<br /><em>{t("product.design.heroAccent")}</em></h1>
          <p className="hero-subtitle">{t("product.design.heroBody")}</p>
          <div className="hero-cta">
            <Link className="primary-cta" href={ctaHref}>
              <span>{returning ? t("product.design.today") : t("home.primaryCta")}</span>
            </Link>
            <Link className="home-coach-link" href="/coach">{t("product.design.coach")} </Link>
            <p className="hero-cta-note">{t("home.ctaNote")}</p>
          </div>
        </div>
        <div className="home-hero-art"><Image src="/images/brand/calm-strength-hero.webp" alt={t("product.design.imageAlt")} width={1200} height={800} priority unoptimized /></div>
      </section>

      <section className="home-product-overview">
        <div><p className="eyebrow">DESIGNED AROUND YOU</p><h2>{t("product.design.overview")}</h2><p>{t("product.design.overviewBody")}</p></div>
        <div className="home-feature-grid">
          {([['plan', 'planTitle', 'planBody', '/plan'], ['training', 'guideTitle', 'guideBody', '/exercises'], ['coach', 'coachTitle', 'coachBody', '/coach']] as const).map(([icon,title,body,href]) => <Link href={href} key={title}>
            <Icon name={icon} /><h3>{t(`product.design.${title}`)}</h3><p>{t(`product.design.${body}`)}</p><span aria-hidden="true"></span>
          </Link>)}
        </div>
      </section>

      <section className="edition-section" id="editions">
        <div className="section-heading"><p>02 / YOUR WAY</p><div><h2>{t("home.editions")}</h2><span>{t("home.yourControlLongTerm")}</span></div></div>
        <div className="edition-grid">
          <article className="open-edition">
            <div className="edition-tag">{t("home.openCore")}</div><h3>{t("home.openTitle")}</h3><p>{t("home.openText")}</p>
            <div className="feature-cloud"><span>{t("home.selfHost")}</span><span>{t("home.localAi")}</span><span>{t("home.transparentCore")}</span><span>{t("home.zhEn")}</span></div>
            <a href="https://github.com/hcao10/personal-fitness-coach" target="_blank" rel="noreferrer">{t("home.viewSource")} <b></b></a>
          </article>
          <article className="pro-edition">
            <div className="edition-tag">{t("home.proEdition")}</div><h3>{t("home.proTitle")}</h3><p>{t("home.proText")}</p>
            <div className="pro-diagram">
              <div><span>01</span><b>{t("home.trainingRecord")}</b><small>CONTINUITY</small></div><i></i>
              <div><span>02</span><b>{t("home.smartPlanning")}</b><small>PERSONALIZATION</small></div><i></i>
              <div><span>03</span><b>{t("home.ongoingRefinement")}</b><small>PROGRESS</small></div>
            </div>
            <Link className="edition-link" href="/pricing">{t("home.upgrade")} <b></b></Link>
          </article>
        </div>
      </section>

      <footer>
        <a className="brand" href="#top"><BrandMark /><span>CMINE <b>FIT</b></span></a>
        <p>{t("home.footerNote")}</p>
        <span>© 2026 Cmine Fit · Exercise media © Gym visual</span>
      </footer>

      {probe.session?.signedIn && accepted === false && (
        <div ref={consentDialogRef} className="modal-backdrop safety-backdrop" role="dialog" aria-modal="true" aria-labelledby="disclaimer-title">
          <div className="safety-modal">
            <div className="modal-stripe"><span>SAFETY FIRST</span><b>01 / 03</b></div>
            <h2 id="disclaimer-title">{t("home.disclaimerTitle")}</h2>
            <p className="disclaimer-intro">{t("home.disclaimerIntro")}</p>
            <label className={healthCheck ? "checked" : ""}><input type="checkbox" checked={healthCheck} onChange={(event) => setHealthCheck(event.target.checked)} /><span>{healthCheck ? "✓" : ""}</span><p>{t("home.disclaimerHealth")}</p></label>
            <label className={estimateCheck ? "checked" : ""}><input type="checkbox" checked={estimateCheck} onChange={(event) => setEstimateCheck(event.target.checked)} /><span>{estimateCheck ? "✓" : ""}</span><p>{t("home.disclaimerEstimate")}</p></label>
            <button className="primary-cta" disabled={!healthCheck || !estimateCheck} onClick={() => {
              try { localStorage.setItem(CONSENT_STORAGE_KEY, consentStamp(consentVersions.disclaimer, consentVersions.privacy)); } catch { /* private window */ }
              setAccepted(true);
              void apiPost("/api/consents", { locale, timezone, productVersion: PRODUCT_VERSION });
            }}><span>{t("home.accept")}</span><b></b></button>
            <small>{locale === "zh"
              ? <>继续即表示你已阅读并接受<a href="/disclaimer" target="_blank" rel="noreferrer">《健康免责声明》</a>与<a href="/privacy" target="_blank" rel="noreferrer">《隐私说明》</a>。</>
              : <>Continuing means you accept the <a href="/disclaimer" target="_blank" rel="noreferrer">health disclaimer</a> and <a href="/privacy" target="_blank" rel="noreferrer">privacy notice</a>.</>}</small>
          </div>
        </div>
      )}

      {loginOpen && (
        <div ref={loginDialogRef} className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setLoginOpen(false)} role="dialog" aria-modal="true" aria-labelledby="signin-title">
          <div className="small-modal">
            <button className="modal-close" aria-label={t("home.close")} onClick={() => setLoginOpen(false)}>×</button>
            <span className="modal-icon" aria-hidden="true"></span>
            <h2 id="signin-title">{t("home.signinTitle")}</h2><p>{t("home.signinText")}</p>
            <div className="provider-list">{AUTH_PROVIDERS.map((provider) => <button key={provider.id} onClick={() => void signIn()}><span>C</span>{provider.label}<em></em></button>)}</div>
          </div>
        </div>
      )}

      {adOpen && (
        <div ref={adDialogRef} className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setAdOpen(false)} role="dialog" aria-modal="true" aria-labelledby="ad-title">
          <div className="small-modal ad-modal">
            <button className="modal-close" aria-label={t("home.close")} onClick={() => setAdOpen(false)}>×</button>
            <span className="modal-icon" aria-hidden="true">◆</span>
            <h2 id="ad-title">{t("home.adTitle")}</h2><p>{t("home.adText")}</p>
            <div className="ad-reward"><b>+10</b><span>{t("home.points")}</span></div>
            <button className="primary-cta" disabled={adClaimed} onClick={async () => {
              const result = await apiPost<unknown>("/api/points/claim-ad", {});
              setAdClaimed(result.ok);
              setToast(result.ok ? t("home.completed") : localizeApiError({ error: result.code, message: result.serverMessage }, locale, t("home.rewardAdsAreNot")));
              window.setTimeout(() => setAdOpen(false), 900);
            }}><span>{adClaimed ? t("home.completed") : t("home.playAd")}</span><b>▶</b></button>
          </div>
        </div>
      )}
      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    </main>
  );
}
