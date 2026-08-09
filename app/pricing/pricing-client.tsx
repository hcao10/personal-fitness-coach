"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { beginCmineLogin } from "../lib/auth";
import { useLocale } from "../lib/i18n-provider";
import { localizeApiError } from "../lib/api-error";

type Catalog = {
  configured: boolean;
  currency: string;
  pro: { monthly: number | null; yearly: number | null; monthlyAvailable: boolean; yearlyAvailable: boolean };
  limits?: {
    free: { planGenerate: number; mealScan: number; coachChat: number };
    pro: { planGenerate: number; mealScan: number; coachChat: number; adaptiveReview: number };
    trialDays: number;
  };
};

// All prices and quota numbers on this page come from the API (Stripe Price
// objects + runtime settings). Never hardcode a number here: it will drift
// from what checkout actually charges or what the server actually enforces.
// The catalog carries the words around them as placeholders for the same
// reason.
const price = (catalog: Catalog | null, value: number | null | undefined) =>
  typeof value === "number" ? `${catalog?.currency === "USD" ? "US$" : `${catalog?.currency || ""} `}${value}` : null;

export default function PricingClient() {
  const { locale, t } = useLocale();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [working, setWorking] = useState<"monthly" | "yearly" | "">("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void Promise.all([
      fetch("/api/v1/billing/catalog", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/auth/me", { cache: "no-store" }).then((response) => response.json()),
    ]).then(([nextCatalog, me]) => {
      setCatalog(nextCatalog);
      setSignedIn(Boolean(me.user));
    }).catch(() => setCatalog(null));
  }, []);

  const limits = catalog?.limits;
  const monthly = price(catalog, catalog?.pro.monthly);
  const yearly = price(catalog, catalog?.pro.yearly);
  const yearlySaving = typeof catalog?.pro.monthly === "number" && typeof catalog?.pro.yearly === "number"
    ? Number((catalog.pro.monthly * 12 - catalog.pro.yearly).toFixed(2)) : null;

  const basicFeatures = [
    t("pricing.freeFeatureProfile"),
    t("pricing.freeFeatureAiPlan"),
    t("pricing.freeFeatureHistory"),
    t("pricing.freeFeatureReviewSummary"),
    ...(limits ? [t("pricing.freeFeatureQuota", { plans: limits.free.planGenerate, scans: limits.free.mealScan, messages: limits.free.coachChat })] : []),
  ];
  const proFeatures = [
    t("pricing.proFeatureAdopt"),
    t("pricing.proFeatureAdaptive"),
    t("pricing.proFeatureNutrition"),
    t("pricing.proFeatureTrends"),
    ...(limits ? [t("pricing.proFeatureQuota", { plans: limits.pro.planGenerate, scans: limits.pro.mealScan, messages: limits.pro.coachChat, reviews: limits.pro.adaptiveReview })] : []),
  ];

  const checkout = async (interval: "monthly" | "yearly") => {
    if (!signedIn) return void beginCmineLogin("/pricing", locale);
    setWorking(interval);
    const response = await fetch("/api/v1/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ interval }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.url) {
      setWorking("");
      // The API answers with a stable code plus its own Chinese sentence.
      // `body.message ||` would have shown that Chinese to an English reader;
      // localizeApiError translates the code and keeps the server text only as
      // a last resort, the same way coach-app.tsx handles its errors.
      return setNotice(localizeApiError(body, locale, t("pricing.checkoutFailed")));
    }
    window.location.assign(body.url);
  };

  return <main className="pricing-page">
    <header className="pricing-header">
      <Link className="brand" href="/"><span className="brand-mark">C</span><span>CMINE <b>FIT</b></span></Link>
      <nav><Link href="/nutrition">{t("pricing.navNutrition")}</Link><Link href="/account">{t("pricing.navMyTraining")}</Link></nav>
    </header>

    <section className="pricing-hero">
      <span>{t("pricing.heroEyebrow")}</span>
      <h1>{t("pricing.heroTitleLine1")}<br />{t("pricing.heroTitleLine2")}</h1>
      {/* Two sentences, two messages: the separator between them is part of the
          copy, so `heroTrialNote` carries its own leading space in the locales
          that need one. Do not add {" "} here — Chinese does not take one. */}
      <p>{t("pricing.heroIntro")}{limits?.trialDays ? t("pricing.heroTrialNote", { days: limits.trialDays }) : ""}</p>
      <div><b>{catalog?.configured ? t("pricing.statusLiveTitle") : t("pricing.statusPendingTitle")}</b><span>{catalog?.configured ? t("pricing.statusLiveDetail") : t("pricing.statusPendingDetail")}</span></div>
    </section>

    <section className="pricing-grid" aria-label={t("pricing.plansRegionLabel")}>
      <article>
        <header><span>{t("pricing.freeEyebrow")}</span><b>{t("pricing.freeBadge")}</b></header>
        <h2>{t("pricing.freeTitle")}</h2>
        <div className="plan-price"><strong>{t("pricing.freePrice")}</strong><small>{t("pricing.freePriceNote")}</small></div>
        <p>{t("pricing.freeSummary")}</p>
        <ul>{basicFeatures.map((feature) => <li key={feature}>{feature}</li>)}</ul>
        <Link href="/#coach">{t("pricing.freeCta")}</Link>
      </article>

      <article className="pro-plan">
        <header><span>CMINE FIT PRO</span><b>{catalog?.configured ? t("pricing.proBadgeAvailable") : t("pricing.proBadgePending")}</b></header>
        <h2>{t("pricing.proTitle")}</h2>
        <div className="plan-price">
          {monthly ? <><strong>{monthly}</strong><small>{t("pricing.perMonth")}{yearly ? <><br />{t("pricing.orYearly", { price: yearly })}</> : null}</small></>
            : <><strong>{t("pricing.proPriceFallback")}</strong><small>{t("pricing.proPriceFallbackNote")}</small></>}
        </div>
        <p>{t("pricing.proSummary")}</p>
        <ul>{proFeatures.map((feature) => <li key={feature}>{feature}</li>)}</ul>
        {catalog?.configured && <div className="pricing-actions">
          <button onClick={() => void checkout("monthly")} disabled={Boolean(working)}>{working === "monthly" ? t("pricing.checkoutRedirect") : t("pricing.chooseMonthly")}</button>
          <button onClick={() => void checkout("yearly")} disabled={Boolean(working)}>{working === "yearly" ? t("pricing.checkoutRedirect") : yearlySaving && yearlySaving > 0 ? t("pricing.chooseYearlySaving", { amount: price(catalog, yearlySaving) || "" }) : t("pricing.chooseYearly")}</button>
        </div>}
      </article>
    </section>

    <section className="pricing-notes">
      <article><span>01</span><h3>{t("pricing.noteEntitlementsTitle")}</h3><p>{t("pricing.noteEntitlementsBody")}</p></article>
      <article><span>02</span><h3>{t("pricing.noteBillingTitle")}</h3><p>{t("pricing.noteBillingBody")}</p></article>
      <article><span>03</span><h3>{t("pricing.noteProfileTitle")}</h3><p>{t("pricing.noteProfileBody")}</p></article>
    </section>
    <footer className="pricing-footer"><span>{t("pricing.footerTagline")}</span><p>{t("pricing.footerDisclaimer")}</p></footer>
    {notice && <div className="toast account-toast">{notice}</div>}
  </main>;
}
