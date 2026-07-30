"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type AdminOverview = {
  metrics: {
    users: number;
    activeUsers: number;
    plans: number;
    consents: number;
    activeSessions: number;
    completions: number;
    measurements: number;
    generations: number;
    generationSuccessRate: number;
  };
  services: {
    database: boolean;
    llm: boolean;
    cmine: boolean;
    rewardAds: boolean;
    model: string;
    reasoningEffort: string;
  };
  recentUsers: { id: string; email: string | null; name: string | null; status: string; createdAt: string }[];
  recentPlans: { id: string; userId: string | null; source: string; model: string; createdAt: string }[];
  recentRuns: { id: string; status: string; model: string; latencyMs: number; requestId: string | null; errorCode: string | null; createdAt: string }[];
  settings: Record<string, { value: unknown; updatedBy: string | null; updatedAt: string }>;
};

function dateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default function AdminDashboard() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [announcement, setAnnouncement] = useState("");

  const load = async () => {
    const response = await fetch("/api/v1/admin/overview", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      const body = await response?.json().catch(() => null) as { message?: string } | null;
      setError(body?.message || `管理服务暂时不可用${response ? `（${response.status}）` : ""}`);
      return;
    }
    const next = await response.json() as AdminOverview;
    setOverview(next);
    setAnnouncement(String(next.settings.announcement?.value || ""));
    setError("");
  };

  useEffect(() => {
    const task = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(task);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const setUserStatus = async (userId: string, status: "active" | "suspended") => {
    const response = await fetch(`/api/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      setNotice((await response.json().catch(() => null))?.message || "用户状态更新失败。");
      return;
    }
    setNotice(status === "active" ? "用户已经恢复。" : "用户已停用，现有会话已经撤销。");
    await load();
  };

  const updateSetting = async (key: string, value: string | boolean) => {
    const response = await fetch("/api/v1/admin/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    if (!response.ok) {
      setNotice((await response.json().catch(() => null))?.message || "设置保存失败。");
      return;
    }
    setNotice("站点设置已经保存并写入审计记录。");
    await load();
  };

  if (error) {
    return <section className="admin-denied">
      <span>ACCESS CONTROL</span>
      <h1>当前账号不能进入管理后台。</h1>
      <p>{error}</p>
      <Link href="/">返回用户端</Link>
    </section>;
  }

  const metrics = overview?.metrics;
  const services = overview?.services;
  const modules = [
    { name: "D1 产品数据", detail: "用户、会话、计划、进度、测量与审计", live: Boolean(services?.database), pending: "正在连接" },
    { name: "AI 推理计划", detail: services ? `${services.model} · ${services.reasoningEffort} reasoning · 结构化输出` : "推理 + 结构化计划 + 安全复核", live: Boolean(services?.llm), pending: "等待安全密钥" },
    { name: "Cmine ID", detail: "PKCE、JWKS、已验证邮箱与 HttpOnly 会话", live: Boolean(services?.cmine), pending: "等待客户端凭据" },
    { name: "激励广告", detail: "只有服务端验证成功的广告事件才发放积分", live: Boolean(services?.rewardAds), pending: "尚未接入" },
  ];

  return <>
    <div className="admin-intro">
      <div><p>懂训练，更懂每一次变化</p><h1>产品状态，<br /><em>一眼看清。</em></h1></div>
      <aside><span>当前阶段</span><b>{overview ? "PRODUCT ONLINE" : "CONNECTING"}</b><p>指标直接读取生产数据库与运行环境；外部服务没有配置时会明确显示，不使用演示数字。</p></aside>
    </div>

    <div className="admin-metrics admin-metrics-wide" aria-label="产品数据">
      <article><span>全部用户</span><b>{metrics?.users ?? "—"}</b><small>{metrics?.activeUsers ?? "—"} 个有效账户</small></article>
      <article><span>保存计划</span><b>{metrics?.plans ?? "—"}</b><small>{metrics?.generations ?? "—"} 次生成请求</small></article>
      <article><span>AI 成功率</span><b>{metrics ? `${metrics.generationSuccessRate}%` : "—"}</b><small>来自真实生成记录</small></article>
      <article><span>训练动作</span><b>{metrics?.completions ?? "—"}</b><small>{metrics?.measurements ?? "—"} 条身体记录</small></article>
      <article><span>有效会话</span><b>{metrics?.activeSessions ?? "—"}</b><small>{metrics?.consents ?? "—"} 条免责确认</small></article>
    </div>

    <section className="admin-panel" id="modules">
      <div className="admin-section-title"><div><span>02 / SYSTEM</span><h2>服务端模块</h2></div><p>状态来自当前部署环境，配置完成后才显示运行中。</p></div>
      <div className="module-table">{modules.map((module) => <article key={module.name}>
        <span className={`module-dot ${module.live ? "live" : "ready"}`} />
        <div><h3>{module.name}</h3><p>{module.detail}</p></div>
        <b className={module.live ? "live" : "ready"}>{module.live ? "运行中" : module.pending}</b>
      </article>)}</div>
    </section>

    <section className="admin-panel" id="generations">
      <div className="admin-section-title"><div><span>03 / AI OPERATIONS</span><h2>最近的 AI 生成</h2></div><p>只记录运行状态、延迟和用量；不会在这里暴露用户健康资料。</p></div>
      <div className="admin-table">
        <div className="admin-table-head"><span>状态</span><span>模型</span><span>延迟</span><span>请求 / 错误</span><span>时间</span></div>
        {overview?.recentRuns.length ? overview.recentRuns.map((run) => <article key={run.id}>
          <b className={run.status === "succeeded" ? "status-good" : "status-bad"}>{run.status === "succeeded" ? "成功" : "失败"}</b>
          <span>{run.model}</span><span>{(run.latencyMs / 1000).toFixed(1)}s</span>
          <code>{run.errorCode || run.requestId || "—"}</code><time>{dateTime(run.createdAt)}</time>
        </article>) : <div className="admin-empty">还没有生成记录。</div>}
      </div>
    </section>

    <section className="admin-panel" id="users">
      <div className="admin-section-title"><div><span>04 / USERS</span><h2>最近用户</h2></div><p>停用用户会立即撤销本站会话，不会删除其 Cmine ID。</p></div>
      <div className="admin-user-list">
        {overview?.recentUsers.length ? overview.recentUsers.map((user) => <article key={user.id}>
          <span className="admin-user-avatar">{(user.name || user.email || "C").slice(0, 1).toUpperCase()}</span>
          <div><h3>{user.name || "未设置姓名"}</h3><p>{user.email || "未返回邮箱"}</p></div>
          <time>{dateTime(user.createdAt)}</time>
          <b className={user.status === "active" ? "status-good" : "status-bad"}>{user.status === "active" ? "正常" : "已停用"}</b>
          <button onClick={() => void setUserStatus(user.id, user.status === "active" ? "suspended" : "active")}>{user.status === "active" ? "停用" : "恢复"}</button>
        </article>) : <div className="admin-empty">还没有用户记录。</div>}
      </div>
    </section>

    <section className="admin-panel" id="settings">
      <div className="admin-section-title"><div><span>05 / SITE SETTINGS</span><h2>站点设置</h2></div><p>密钥和模型凭据只能在安全环境中配置，不会进入管理页面。</p></div>
      <div className="admin-settings">
        <label><span>站内公告</span><input value={announcement} maxLength={300} onChange={(event) => setAnnouncement(event.target.value)} placeholder="留空则不展示公告" /><button onClick={() => void updateSetting("announcement", announcement)}>保存</button></label>
        <article><div><h3>维护模式</h3><p>用于临时阻止新的计划生成；现有账户和历史仍可访问。</p></div><button className={overview?.settings.maintenance_mode?.value === true ? "danger" : ""} onClick={() => void updateSetting("maintenance_mode", overview?.settings.maintenance_mode?.value !== true)}>{overview?.settings.maintenance_mode?.value === true ? "关闭维护模式" : "开启维护模式"}</button></article>
        <article><div><h3>免责协议版本</h3><p>当前版本：{String(overview?.settings.disclaimer_version?.value || "health-v2")}</p></div><span>每次更新都会保留用户同意记录</span></article>
      </div>
    </section>
    {notice && <div className="toast admin-toast">{notice}</div>}
  </>;
}
