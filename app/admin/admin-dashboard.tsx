"use client";

import { useEffect, useState } from "react";

type Summary = {
  metrics: { users: number; plans: number; consents: number; activeSessions: number };
  services: { database: boolean; llm: boolean; cmine: boolean; rewardAds: boolean; model: string };
};

export default function AdminDashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/admin/summary", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<Summary>;
      })
      .then(setSummary)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "unknown"));
  }, []);

  const metrics = summary?.metrics;
  const services = summary?.services;
  const modules = [
    { name: "D1 数据后端", detail: "用户、会话、档案、计划、免责确认与积分账本", live: Boolean(services?.database), pending: "正在连接" },
    { name: "LLM 计划生成", detail: services ? `${services.model} 结构化生成 + 训练规则复核` : "结构化生成 + 训练规则复核", live: Boolean(services?.llm), pending: "等待 API 密钥" },
    { name: "Cmine ID", detail: "服务端 PKCE、HttpOnly 会话与用户档案", live: Boolean(services?.cmine), pending: "等待 client_id" },
    { name: "奖励广告", detail: "仅在广告供应商完成服务端回调验证后记入积分", live: Boolean(services?.rewardAds), pending: "等待供应商" },
  ];

  return <>
    <div className="admin-intro">
      <div><p>懂训练，更懂每一次变化</p><h1>真实数据，<br /><em>真实运行状态。</em></h1></div>
      <aside><span>当前阶段</span><b>{error ? "NEEDS ATTENTION" : summary ? "BACKEND ONLINE" : "CONNECTING"}</b><p>{error ? `管理 API 无法读取：${error}` : "这里读取 D1 与服务端配置，不再展示虚构的运营指标。未配置的外部服务会明确标记。"}</p></aside>
    </div>

    <div className="admin-metrics" aria-label="真实产品数据">
      <article><span>用户</span><b>{metrics?.users ?? "—"}</b><small>D1 中的 Cmine ID 用户</small></article>
      <article><span>AI 计划</span><b>{metrics?.plans ?? "—"}</b><small>已保存的 LLM 计划</small></article>
      <article><span>免责确认</span><b>{metrics?.consents ?? "—"}</b><small>health-v1 确认记录</small></article>
      <article><span>有效会话</span><b>{metrics?.activeSessions ?? "—"}</b><small>未过期服务端会话</small></article>
    </div>

    <section className="admin-panel" id="modules">
      <div className="admin-section-title"><div><span>02 / SYSTEM</span><h2>服务端模块</h2></div><p>状态来自当前部署环境：配置完成才显示运行中。</p></div>
      <div className="module-table">{modules.map((module) => <article key={module.name}>
        <span className={`module-dot ${module.live ? "live" : "ready"}`} />
        <div><h3>{module.name}</h3><p>{module.detail}</p></div>
        <b className={module.live ? "live" : "ready"}>{module.live ? "运行中" : module.pending}</b>
      </article>)}</div>
    </section>

    <section className="admin-panel" id="roadmap">
      <div className="admin-section-title"><div><span>03 / DATA</span><h2>已经进入后端的数据</h2></div><p>所有写入均由服务端完成；OAuth 访问令牌不会进入浏览器存储。</p></div>
      <div className="roadmap-grid">
        <article><span>01</span><div><h3>用户与会话</h3><p>Cmine 身份映射、哈希会话标识和七天有效期。</p></div><b>已建模</b></article>
        <article><span>02</span><div><h3>训练档案与计划</h3><p>输入快照、完整计划、模型和生成时间。</p></div><b>已建模</b></article>
        <article><span>03</span><div><h3>免责版本</h3><p>按版本记录确认时间与语言。</p></div><b>已建模</b></article>
        <article><span>04</span><div><h3>积分账本</h3><p>只接受可验证来源，广告未接通前不发假积分。</p></div><b>已建模</b></article>
      </div>
    </section>
  </>;
}
