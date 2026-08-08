"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { beginCmineLogin } from "../lib/auth";

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
const price = (catalog: Catalog | null, value: number | null | undefined) =>
  typeof value === "number" ? `${catalog?.currency === "USD" ? "US$" : `${catalog?.currency || ""} `}${value}` : null;

export default function PricingClient() {
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
    "个人训练档案与确定性 BMR / TDEE 计算",
    "结合目标、器械与伤病限制的 AI 周计划",
    "计划历史、训练完成记录与身体趋势",
    "每周复盘摘要（引擎分析结果免费可见）",
    ...(limits ? [`每月 ${limits.free.planGenerate} 次 AI 计划、${limits.free.mealScan} 次饭菜识别与 ${limits.free.coachChat} 条 Coach 消息`] : []),
  ];
  const proFeatures = [
    "一键采纳教练引擎的完整调整方案（渐进负荷 / 疲劳减量 / 停滞换动作）",
    "依据完成率、RPE、疼痛与恢复反馈持续调整",
    "饭菜拍照、包装扫码与每日营养目标（更高额度）",
    "长期进度趋势、停滞识别与阶段复盘",
    ...(limits ? [`每月 ${limits.pro.planGenerate} 次计划、${limits.pro.mealScan} 次饭菜识别、${limits.pro.coachChat} 条 Coach 消息与 ${limits.pro.adaptiveReview} 次完整复盘`] : []),
  ];

  const checkout = async (interval: "monthly" | "yearly") => {
    if (!signedIn) return void beginCmineLogin("/pricing");
    setWorking(interval);
    const response = await fetch("/api/v1/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ interval }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.url) {
      setWorking("");
      return setNotice(body?.message || "暂时无法开始订阅。");
    }
    window.location.assign(body.url);
  };

  return <main className="pricing-page">
    <header className="pricing-header">
      <Link className="brand" href="/"><span className="brand-mark">C</span><span>CMINE <b>FIT</b></span></Link>
      <nav><Link href="/nutrition">饮食记录</Link><Link href="/account">我的训练</Link></nav>
    </header>

    <section className="pricing-hero">
      <span>PROFESSIONAL PLANS</span>
      <h1>今天有计划，<br />长期也有方向。</h1>
      <p>免费版让你真正开始；专业版会理解训练反馈、身体变化、饮食和生活节奏，持续给出更细致、更适合当下的指导。{limits?.trialDays ? `新账号前 ${limits.trialDays} 天可完整体验全部专业能力。` : ""}</p>
      <div><b>{catalog?.configured ? "专业版现已开放" : "专业版正在接入支付"}</b><span>{catalog?.configured ? "由 Stripe 安全处理付款、续费与取消" : "支付未配置前不会收款或预授权"}</span></div>
    </section>

    <section className="pricing-grid" aria-label="Cmine Fit plans">
      <article>
        <header><span>START</span><b>当前可用</b></header>
        <h2>免费版</h2>
        <div className="plan-price"><strong>免费</strong><small>无需绑定支付方式</small></div>
        <p>完成个人建档，生成专属计划，并保存每一次训练、身体变化和餐食记录。</p>
        <ul>{basicFeatures.map((feature) => <li key={feature}>{feature}</li>)}</ul>
        <Link href="/#coach">开始制定计划 →</Link>
      </article>

      <article className="pro-plan">
        <header><span>CMINE FIT PRO</span><b>{catalog?.configured ? "可订阅" : "等待支付配置"}</b></header>
        <h2>专业版</h2>
        <div className="plan-price">
          {monthly ? <><strong>{monthly}</strong><small>/ 月{yearly ? <><br />或 {yearly} / 年</> : null}</small></>
            : <><strong>价格以 Checkout 为准</strong><small>点击订阅查看当前价格</small></>}
        </div>
        <p>不只是多生成几份计划，而是在更长时间里理解你、复盘你，再调整下一步。</p>
        <ul>{proFeatures.map((feature) => <li key={feature}>{feature}</li>)}</ul>
        {catalog?.configured && <div className="pricing-actions">
          <button onClick={() => void checkout("monthly")} disabled={Boolean(working)}>{working === "monthly" ? "正在前往 Stripe…" : "选择月付 →"}</button>
          <button onClick={() => void checkout("yearly")} disabled={Boolean(working)}>{working === "yearly" ? "正在前往 Stripe…" : yearlySaving && yearlySaving > 0 ? `选择年付 · 省 ${price(catalog, yearlySaving)}` : "选择年付 →"}</button>
        </div>}
      </article>
    </section>

    <section className="pricing-notes">
      <article><span>01</span><h3>按能力管理权益</h3><p>训练分析、饭菜识别、长期 Coach 与 App 同步独立判断，不把套餐名称硬编码进训练逻辑。</p></article>
      <article><span>02</span><h3>清楚地续费与取消</h3><p>月付、年付、续费与取消状态都会明确展示，并可通过 Stripe 客户门户随时管理。</p></article>
      <article><span>03</span><h3>同一个长期档案</h3><p>Web 与 App 共用 Cmine ID、计划、营养和进度，不需要重新建立资料。</p></article>
    </section>
    <footer className="pricing-footer"><span>CMINE FIT · 懂训练，更懂你</span><p>健康、训练与营养建议不替代医疗诊断、治疗或康复方案。</p></footer>
    {notice && <div className="toast account-toast">{notice}</div>}
  </main>;
}
