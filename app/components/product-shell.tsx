"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useLocale } from "../lib/i18n-provider";
import { Icon } from "../shared/ui/icon";
import { BrandMark } from "../shared/ui/brand-mark";

// The second line under each nav label used to be a hardcoded English gloss
// shown to everyone. In English it read as a duplicate of the label above it;
// in any third language it would be neither the label nor a translation. The
// catalog supplies one label per locale and there is no second line.
const items = [
  { href: "/today", icon: "training", key: "nav.today" },
  { href: "/coach", icon: "coach", key: "nav.coach" },
  { href: "/nutrition", icon: "nutrition", key: "nav.nutrition" },
  { href: "/progress", icon: "progress", key: "nav.progress" },
  { href: "/account", icon: "account", key: "nav.account" },
] as const;

export default function ProductShell({ active, title, eyebrow, children, action, className = "" }: {
  active: string; title: string; eyebrow: string; children: ReactNode; action?: ReactNode; className?: string;
}) {
  const { t, locale, setLocale } = useLocale();
  const links = items.map(item => <Link key={item.href} href={item.href}
    aria-current={active === item.href ? "page" : undefined} className={active === item.href ? "active" : ""}>
    <Icon name={item.icon} /><span>{t(item.key)}</span>
  </Link>);
  return <div className={`product-shell ${className}`}>
    <a className="skip-link" href="#main-content">{t("product.design.skipContent")}</a>
    <div className="product-topbar">
      <Link className="product-logo" href="/"><BrandMark /><b>Cmine Fit</b></Link>
      <nav className="product-desktop-nav" aria-label={t("product.design.navigation")}>{links}</nav>
      <label className="product-language"><span className="sr-only">{t("product.design.language")}</span>
        <select value={locale} onChange={event => void setLocale(event.target.value as "zh" | "en")}><option value="zh">简体中文</option><option value="en">English</option></select>
      </label>
    </div>
    <main className="product-main" id="main-content">
      <header className="product-header"><div><p>{eyebrow}</p><h1>{title}</h1></div>{action}</header>
      {children}
    </main>
    <nav className="product-bottom-nav" aria-label={t("product.design.navigation")}>{links}</nav>
  </div>;
}
