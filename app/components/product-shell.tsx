"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useT } from "../lib/i18n-provider";

// The second line under each nav label used to be a hardcoded English gloss
// shown to everyone. In English it read as a duplicate of the label above it;
// in any third language it would be neither the label nor a translation. The
// catalog supplies one label per locale and there is no second line.
const items = [
  { href: "/today", icon: "01", key: "nav.today" },
  { href: "/coach", icon: "02", key: "nav.coach" },
  { href: "/nutrition", icon: "03", key: "nav.nutrition" },
  { href: "/progress", icon: "04", key: "nav.progress" },
  { href: "/account", icon: "05", key: "nav.account" },
] as const;

export default function ProductShell({ active, title, eyebrow, children, action }: {
  active: string; title: string; eyebrow: string; children: ReactNode; action?: ReactNode;
}) {
  const t = useT();
  return <div className="product-shell">
    <aside className="product-sidebar">
      <Link className="product-logo" href="/"><span>C</span><b>CMINE FIT</b></Link>
      <nav>{items.map((item) => <Link key={item.href} href={item.href} className={active === item.href ? "active" : ""}><i>{item.icon}</i><span>{t(item.key)}</span></Link>)}</nav>
      <Link className="product-sidebar-help" href="/pricing"><span>PRO</span><p>{t("shell.proPitch")}</p></Link>
    </aside>
    <main className="product-main">
      <header className="product-header"><div><p>{eyebrow}</p><h1>{title}</h1></div>{action}</header>
      {children}
    </main>
    <nav className="product-bottom-nav">{items.map((item) => <Link key={item.href} href={item.href} className={active === item.href ? "active" : ""}><i>{item.icon}</i><span>{t(item.key)}</span></Link>)}</nav>
  </div>;
}
