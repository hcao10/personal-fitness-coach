"use client";

import type { ReactNode } from "react";
import Link from "next/link";

const items = [
  { href: "/today", icon: "01", label: "今日", en: "Today" },
  { href: "/coach", icon: "02", label: "Coach", en: "Coach" },
  { href: "/nutrition", icon: "03", label: "饮食", en: "Nutrition" },
  { href: "/progress", icon: "04", label: "进度", en: "Progress" },
  { href: "/account", icon: "05", label: "我的", en: "Account" },
];

export default function ProductShell({ active, title, eyebrow, children, action }: {
  active: string; title: string; eyebrow: string; children: ReactNode; action?: ReactNode;
}) {
  return <div className="product-shell">
    <aside className="product-sidebar">
      <Link className="product-logo" href="/"><span>C</span><b>CMINE FIT</b></Link>
      <nav>{items.map((item) => <Link key={item.href} href={item.href} className={active === item.href ? "active" : ""}><i>{item.icon}</i><span>{item.label}<small>{item.en}</small></span></Link>)}</nav>
      <Link className="product-sidebar-help" href="/pricing"><span>PRO</span><p>更长期、更贴合的专业指导</p></Link>
    </aside>
    <main className="product-main">
      <header className="product-header"><div><p>{eyebrow}</p><h1>{title}</h1></div>{action}</header>
      {children}
    </main>
    <nav className="product-bottom-nav">{items.map((item) => <Link key={item.href} href={item.href} className={active === item.href ? "active" : ""}><i>{item.icon}</i><span>{item.label}</span></Link>)}</nav>
  </div>;
}
