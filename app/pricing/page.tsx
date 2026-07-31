import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "专业计划 — Cmine Fit",
  description: "了解 Cmine Fit 基础版与专业版：从一周 AI 计划，到持续适应你变化的长期训练指导。",
};

const basicFeatures = [
  "个人训练档案与确定性 BMR / TDEE 计算",
  "结合目标、器械与伤病限制的 AI 周计划",
  "计划历史、训练完成记录与身体趋势",
  "Cmine ID 安全登录与数据导出",
];

const proFeatures = [
  "依据完成率、RPE、疼痛与恢复反馈持续调整",
  "更深入的训练编排、饮食建议与阶段复盘",
  "长期进度趋势、停滞识别与下一步策略",
  "持续对话的 AI Coach 与更贴心的提醒",
  "未来同步 App、健康数据与穿戴设备",
];

export default function PricingPage() {
  return <main className="pricing-page">
    <header className="pricing-header">
      <Link className="brand" href="/"><span className="brand-mark">C</span><span>CMINE <b>FIT</b></span></Link>
      <nav><Link href="/">AI 计划</Link><Link href="/account">我的训练</Link></nav>
    </header>

    <section className="pricing-hero">
      <span>PROFESSIONAL PLANS</span>
      <h1>今天有计划，<br />长期也有方向。</h1>
      <p>基础版让你真正开始；专业版会理解训练反馈、身体变化和生活节奏，持续给出更细致、更适合当下的指导。</p>
      <div><b>专业版筹备中</b><span>正式开放前不会收费</span></div>
    </section>

    <section className="pricing-grid" aria-label="Cmine Fit plans">
      <article>
        <header><span>START</span><b>当前可用</b></header>
        <h2>基础版</h2>
        <div className="plan-price"><strong>免费</strong><small>无需绑定支付方式</small></div>
        <p>完成个人建档，生成一周专属计划，并把每一次训练和身体变化保存下来。</p>
        <ul>{basicFeatures.map((feature) => <li key={feature}>{feature}</li>)}</ul>
        <Link href="/#coach">开始制定计划 →</Link>
      </article>

      <article className="pro-plan">
        <header><span>CMINE FIT PRO</span><b>即将开放</b></header>
        <h2>专业版</h2>
        <div className="plan-price"><strong>US$9.99</strong><small>/ 月<br />或 US$79 / 年</small></div>
        <p>不是多生成几份计划，而是让 Coach 在更长时间里理解你、复盘你，再调整下一步。</p>
        <ul>{proFeatures.map((feature) => <li key={feature}>{feature}</li>)}</ul>
        <button disabled>支付接入后开放</button>
      </article>
    </section>

    <section className="pricing-notes">
      <article><span>01</span><h3>按能力管理权益</h3><p>训练分析、长期 Coach、App 同步等能力独立判断，产品不会把套餐名硬编码进训练逻辑。</p></article>
      <article><span>02</span><h3>随时清楚地选择</h3><p>月付、年付、续费与取消状态都会明确展示；支付接入前不收款、不预授权。</p></article>
      <article><span>03</span><h3>同一个长期档案</h3><p>未来 Web 与 App 共用 Cmine ID、计划和进度，不需要重新建立训练资料。</p></article>
    </section>

    <footer className="pricing-footer"><span>CMINE FIT · 懂训练，更懂你</span><p>健康与训练建议不替代医疗诊断、治疗或康复方案。</p></footer>
  </main>;
}
