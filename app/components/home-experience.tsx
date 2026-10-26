"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useLocale } from "../lib/i18n-provider";
import { BrandMark } from "../shared/ui/brand-mark";
import { Icon } from "../shared/ui/icon";

/** Public illustrations never read or write a user's plan or training records. */
export function HomeExperience({ ctaHref, returning, signedIn, accountsAvailable, onSignIn }: {
  ctaHref: string; returning: boolean; signedIn: boolean; accountsAvailable: boolean; onSignIn: () => void;
}) {
  const { t } = useLocale();
  const [scenario, setScenario] = useState<"home" | "gym" | "short">("home");
  const cta = returning ? t("product.design.today") : t("home.primaryCta");
  const example = { home: { minutes: 35, count: 3 }, gym: { minutes: 45, count: 3 }, short: { minutes: 20, count: 2 } }[scenario];
  return <div className="fit-home-content">
    <section className="fit-hero" id="top">
      <div className="fit-hero-copy"><p className="fit-kicker">{t("refresh.home.kicker")}</p>
        <h1>{t("refresh.home.title")}<br /><span>{t("refresh.home.accent")}</span></h1>
        <p className="fit-hero-body">{t("refresh.home.body")}</p>
        <div className="fit-hero-actions"><Link className="primary-cta" href={ctaHref}>{cta}</Link><a className="fit-text-link" href="#how-it-works">{t("refresh.home.secondary")}</a></div>
        <p className="fit-entry-note">{t("refresh.home.note")}</p>
      </div>
      <div className="fit-hero-visual"><Image src="/images/brand/everyday-strength.webp" alt={t("refresh.home.photoAlt")} width={1200} height={800} priority unoptimized />
        <div className="fit-session-preview"><span>{t("refresh.home.sample")}</span><h2>{t("refresh.home.sampleTitle")}</h2><p>{t("refresh.home.sampleBody")}</p><div><b><Icon name="clock" />{t("refresh.home.sampleDose")}</b><span>{t("refresh.home.sampleEquipment")}</span></div></div>
        <small className="fit-photo-note">{t("refresh.home.photoNote")}</small>
      </div>
    </section>
    <div className="fit-value-line">{(["clock", "training", "check"] as const).map((icon, i) => <span key={icon}><Icon name={icon} />{t((['refresh.home.value1', 'refresh.home.value2', 'refresh.home.value3'] as const)[i])}</span>)}</div>
    <section className="fit-section" id="how-it-works">
      <div className="fit-section-heading"><div><p className="fit-kicker">{t("refresh.home.planLabel")}</p><h2>{t("refresh.home.planTitle")}</h2></div><p>{t("refresh.home.planBody")}</p></div>
      <div className="fit-plan-example"><div className="fit-plan-controls"><span>{t("refresh.home.sample")}</span><div role="group" aria-label={t("refresh.home.scenarioLabel")}>{(["home", "gym", "short"] as const).map(key => <button type="button" key={key} aria-pressed={scenario === key} onClick={() => setScenario(key)}>{t(`refresh.home.${key}`)}</button>)}</div></div>
        <div className="fit-plan-summary" aria-live="polite"><div><h3>{t(`refresh.home.${scenario}Title`)}</h3><p>{t(`refresh.home.${scenario}Body`)}</p></div><div className="fit-plan-counts"><span><b>{example.minutes}</b>{t("refresh.home.duration")}</span><span><b>{example.count}</b>{t("refresh.home.movement")}</span></div></div>
        <div className="fit-example-moves">{t(`refresh.home.${scenario}Moves`).split(" / ").map((name, i) => <div key={name}><span>{String(i + 1).padStart(2, "0")}</span><b>{name}</b><Icon name="training" /></div>)}</div>
        <div className="fit-example-foot"><small>{t("refresh.home.previewNote")}</small><Link className="fit-text-link" href={ctaHref}>{returning ? cta : t("refresh.home.ownPlan")}</Link></div>
      </div>
    </section>
    <section className="fit-section fit-coach-section" id="meet-coach"><div><BrandMark size={44} /><p className="fit-kicker">{t("refresh.home.coachLabel")}</p><h2>{t("refresh.home.coachTitle")}</h2><p className="fit-body">{t("refresh.home.coachBody")}</p><Link className="fit-text-link" href="/coach">{t("refresh.home.coachLink")}</Link><small className="fit-capability-note">{t("refresh.home.aiNote")}</small></div>
      <div className="fit-coach-example"><p className="fit-example-label">{t("refresh.home.illustration")}</p><p className="fit-sample-message">{t("refresh.home.prompt")}</p><div className="fit-sample-proposal"><header><b>{t("refresh.home.proposal")}</b><span>{t("refresh.home.proposed")}</span></header><div className="fit-proposal-numbers"><div><span>{t("refresh.home.before")}</span><p>35 <small>{t("refresh.home.duration")}</small></p></div><div><span>{t("refresh.home.after")}</span><p>20 <small>{t("refresh.home.duration")}</small></p></div></div><p className="fit-example-disclaimer">{t("refresh.home.confirmation")}</p><Link className="primary-cta" href="/coach">{t("refresh.home.confirmLink")}</Link></div></div>
    </section>
    <section className="fit-section fit-loop"><div className="fit-section-heading fit-centered"><p className="fit-kicker">{t("refresh.home.loopLabel")}</p><h2>{t("refresh.home.loopTitle")}</h2><p>{t("refresh.home.loopBody")}</p></div><div className="fit-loop-grid">{([
      ["training", "trainingTitle", "trainingBody", "trainingLink", "/today"], ["nutrition", "foodTitle", "foodBody", "foodLink", "/nutrition"], ["progress", "progressTitle", "progressBody", "progressLink", "/progress"],
    ] as const).map(([icon, title, body, link, href]) => <article key={icon}><div className={`fit-loop-art ${icon}`} aria-hidden="true"><Icon name={icon} /><div className="fit-loop-lines"><i /><i /><i /></div></div><h3>{t(`refresh.home.${title}`)}</h3><p>{t(`refresh.home.${body}`)}</p><Link className="fit-text-link" href={href}>{t(`refresh.home.${link}`)}</Link></article>)}</div></section>
    <section className="fit-section fit-start-grid" id="editions"><article><p className="fit-kicker">{t("refresh.home.localLabel")}</p><h2>{t("refresh.home.localTitle")}</h2><p>{t("refresh.home.localBody")}</p><ul>{(["local1", "local2", "local3"] as const).map(key => <li key={key}><Icon name="check" />{t(`refresh.home.${key}`)}</li>)}</ul><Link className="secondary-cta" href={ctaHref}>{returning ? cta : t("refresh.home.localCta")}</Link></article>
      <article className="fit-account-path"><p className="fit-kicker">{t("refresh.home.accountLabel")}</p><h2>{t("refresh.home.accountTitle")}</h2><p>{t("refresh.home.accountBody")}</p><ul>{(["account1", "account2", "account3"] as const).map(key => <li key={key}><Icon name="check" />{t(`refresh.home.${key}`)}</li>)}</ul>{signedIn ? <Link className="primary-cta" href="/account">{t("refresh.home.accountOpen")}</Link> : accountsAvailable ? <button className="primary-cta" type="button" onClick={onSignIn}>{t("refresh.home.accountCta")}</button> : <p className="fit-capability-note">{t("refresh.home.accountUnavailable")}</p>}<Link className="fit-text-link" href="/pricing">{t("refresh.home.pricing")}</Link></article>
    </section>
    <section className="fit-section fit-faq"><div><p className="fit-kicker">{t("refresh.home.faqLabel")}</p><h2>{t("refresh.home.faqTitle")}</h2></div><div>{([1, 2, 3, 4, 5] as const).map(n => <details key={n}><summary>{t(`refresh.home.q${n}`)}<Icon name="plus" /></summary><p>{t(`refresh.home.a${n}`)}</p></details>)}</div></section>
    <section className="fit-closing"><div><p className="fit-kicker">{t("refresh.home.closingLabel")}</p><h2>{t("refresh.home.closingTitle")}</h2></div><Link className="primary-cta" href={ctaHref}>{cta}</Link></section>
    <footer className="fit-footer"><div><Link className="product-logo" href="/"><BrandMark /><b>Cmine Fit</b></Link><p>{t("refresh.home.footer")}</p></div><nav aria-label={t("refresh.home.explore")}><b>{t("refresh.home.explore")}</b><Link href="/today">{t("nav.today")}</Link><Link href="/coach">{t("nav.coach")}</Link><Link href="/pricing">{t("home.navPricing")}</Link></nav><nav aria-label={t("refresh.home.support")}><b>{t("refresh.home.support")}</b><Link href="/privacy">{t("refresh.home.privacy")}</Link><Link href="/disclaimer">{t("refresh.home.disclaimer")}</Link><a href="https://github.com/hcao10/personal-fitness-coach" target="_blank" rel="noreferrer">{t("refresh.home.source")}</a></nav><div className="fit-footer-bottom"><span>© 2026 Cmine Fit</span><p>{t("refresh.home.footerNote")}</p><span>Exercise media © Gym visual</span></div></footer>
  </div>;
}
