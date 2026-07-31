/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { beginCmineLogin } from "../lib/auth";

type AdminUser = { id: string; email: string | null; name: string | null; status: string; createdAt?: string; created_at?: string };
type AiRoute = { id: string; task: string; tier: string; priority: number; provider: "cloudflare" | "openai" | "compatible"; model: string; enabled: boolean };
type AdminOverview = {
  admin: { email: string | null; name: string | null; role: string };
  metrics: Record<string, number> & {
    users: number; activeUsers: number; plans: number; activeSessions: number; generations: number;
    generationSuccessRate: number; subscriptions: number; revenueUsd: number; meals: number;
    mealAnalyses: number; mealAnalysisSuccessRate: number; lowConfidenceMeals: number; aiCostUsd: number;
  };
  services: {
    database: boolean; storage: boolean; planner: boolean; vision: boolean; llm: boolean; cmine: boolean;
    foodData: boolean; billing: boolean; rewardAds: boolean; model: string; reasoningEffort: string;
    providers: Record<string, boolean>;
  };
  recentUsers: AdminUser[];
  recentRuns: { id: string; status: string; model: string; latencyMs: number; requestId: string | null; errorCode: string | null; createdAt: string }[];
  recentBilling: Record<string, any>[];
  recentAudits: Record<string, any>[];
  aiRoutes: AiRoute[];
  settings: Record<string, { value: unknown; updatedBy: string | null; updatedAt: string }>;
};

function dateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default function AdminDashboard() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [notice, setNotice] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [routes, setRoutes] = useState<AiRoute[]>([]);

  const load = async () => {
    const response = await fetch("/api/v1/admin/overview", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      const body = await response?.json().catch(() => null) as { error?: string; message?: string } | null;
      setErrorCode(body?.error || "");
      setError(body?.message || `管理服务暂时不可用${response ? `（${response.status}）` : ""}`);
      return;
    }
    const next = await response.json() as AdminOverview;
    setOverview(next);
    setAnnouncement(String(next.settings.announcement?.value || ""));
    setRoutes(next.aiRoutes || []);
    setUsers(next.recentUsers || []);
    setError("");
    setErrorCode("");
  };

  useEffect(() => {
    const task = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(task);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const setUserStatus = async (userId: string, status: "active" | "suspended") => {
    const response = await fetch(`/api/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }),
    });
    if (!response.ok) return setNotice((await response.json().catch(() => null))?.message || "用户状态更新失败。");
    setNotice(status === "active" ? "用户已经恢复。" : "用户已停用，现有会话已经撤销。");
    await searchUsers();
    await load();
  };

  const searchUsers = async () => {
    const response = await fetch(`/api/v1/admin/users?q=${encodeURIComponent(userQuery)}&limit=50`, { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok) return setNotice(body?.message || "用户搜索失败。");
    setUsers(body.users || []);
  };

  const updateSetting = async (key: string, value: string | boolean | number) => {
    const response = await fetch("/api/v1/admin/settings", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, value }),
    });
    if (!response.ok) return setNotice((await response.json().catch(() => null))?.message || "设置保存失败。");
    setNotice("设置已经保存并写入审计记录。");
    await load();
  };

  const updateRoute = async (route: AiRoute) => {
    const response = await fetch(`/api/v1/admin/ai-routes/${encodeURIComponent(route.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: route.provider, model: route.model, enabled: route.enabled }),
    });
    if (!response.ok) return setNotice((await response.json().catch(() => null))?.message || "模型路由保存失败。");
    setNotice("模型路由已经更新。密钥仍只保存在安全环境中。");
    await load();
  };

  if (error) {
    return <section className="admin-denied">
      <span>CMINE ID · ACCESS CONTROL</span>
      <h1>{errorCode === "AUTH_REQUIRED" ? "先确认你的 Cmine 身份。" : "当前账号不能进入管理后台。"}</h1>
      <p>{error}</p>
      {errorCode === "AUTH_REQUIRED"
        ? <button className="admin-login-button" onClick={() => void beginCmineLogin("/admin")}>使用 Cmine ID 登录 →</button>
        : <Link href="/account">查看当前登录账号</Link>}
    </section>;
  }

  const metrics = overview?.metrics;
  const services = overview?.services;
  const modules = [
    { name: "D1 产品数据", detail: "用户、训练、营养、支付、权益与审计", live: Boolean(services?.database) },
    { name: "R2 饭菜图片", detail: "压缩、清除 EXIF、私有存储与保留策略", live: Boolean(services?.storage) },
    { name: "训练计划 AI", detail: services?.model || "可切换模型路由", live: Boolean(services?.planner) },
    { name: "饭菜视觉 AI", detail: "低成本初识别与低置信度升级", live: Boolean(services?.vision) },
    { name: "食品数据库", detail: "USDA FoodData Central + Open Food Facts", live: Boolean(services?.foodData) },
    { name: "Cmine ID", detail: "PKCE、JWKS、会话续期与 Connected Apps 撤销", live: Boolean(services?.cmine) },
    { name: "Stripe", detail: "Checkout、Portal、Webhook 与权益同步", live: Boolean(services?.billing) },
    { name: "激励广告", detail: "只有签名回调成功才发积分", live: Boolean(services?.rewardAds) },
  ];

  return <>
    <div className="admin-intro">
      <div><p>懂训练，更懂每一次变化</p><h1>产品状态，<br /><em>一眼看清。</em></h1></div>
      <aside><span>当前管理员</span><b>{overview?.admin.name || overview?.admin.email || "CMINE ADMIN"}</b><p>身份与管理权限统一由 Cmine ID 和产品角色验证。</p></aside>
    </div>

    <div className="admin-metrics admin-metrics-wide" aria-label="产品数据">
      <article><span>全部用户</span><b>{metrics?.users ?? "—"}</b><small>{metrics?.activeUsers ?? "—"} 个有效账户</small></article>
      <article><span>AI 成功率</span><b>{metrics ? `${metrics.generationSuccessRate}%` : "—"}</b><small>{metrics?.generations ?? "—"} 次生成</small></article>
      <article><span>AI 估算成本</span><b>${metrics?.aiCostUsd ?? "—"}</b><small>按已知模型单价累计</small></article>
      <article><span>专业订阅</span><b>{metrics?.subscriptions ?? "—"}</b><small>收入 ${metrics?.revenueUsd ?? 0}</small></article>
      <article><span>确认餐食</span><b>{metrics?.meals ?? "—"}</b><small>识别成功率 {metrics?.mealAnalysisSuccessRate ?? 0}%</small></article>
    </div>

    <section className="admin-panel" id="modules">
      <div className="admin-section-title"><div><span>02 / SYSTEM</span><h2>服务端模块</h2></div><p>状态来自当前生产环境，配置完成后才显示运行中。</p></div>
      <div className="module-table">{modules.map((module) => <article key={module.name}>
        <span className={`module-dot ${module.live ? "live" : "ready"}`} />
        <div><h3>{module.name}</h3><p>{module.detail}</p></div>
        <b className={module.live ? "live" : "ready"}>{module.live ? "运行中" : "未配置"}</b>
      </article>)}</div>
    </section>

    <section className="admin-panel" id="models">
      <div className="admin-section-title"><div><span>03 / AI ROUTING</span><h2>模型路由</h2></div><p>按任务与用户权益切换供应商。密钥不会出现在此页面。</p></div>
      <div className="ai-route-list">{routes.map((route, index) => <article key={route.id}>
        <div><b>{route.task}</b><span>{route.tier} · 优先级 {route.priority}</span></div>
        <select value={route.provider} onChange={(event) => setRoutes((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, provider: event.target.value as AiRoute["provider"] } : item))}>
          <option value="cloudflare">Cloudflare</option><option value="openai">OpenAI</option><option value="compatible">OpenAI-compatible</option>
        </select>
        <input value={route.model} onChange={(event) => setRoutes((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, model: event.target.value } : item))} />
        <label><input type="checkbox" checked={route.enabled} onChange={(event) => setRoutes((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: event.target.checked } : item))} />启用</label>
        <button onClick={() => void updateRoute(route)}>保存</button>
      </article>)}</div>
    </section>

    <section className="admin-panel" id="generations">
      <div className="admin-section-title"><div><span>04 / AI OPERATIONS</span><h2>最近的 AI 生成</h2></div><p>只记录运行状态、延迟和用量，不保存模型原始思维链。</p></div>
      <div className="admin-table">
        <div className="admin-table-head"><span>状态</span><span>模型</span><span>延迟</span><span>请求 / 错误</span><span>时间</span></div>
        {overview?.recentRuns.length ? overview.recentRuns.map((run) => <article key={run.id}>
          <b className={run.status === "succeeded" ? "status-good" : "status-bad"}>{run.status === "succeeded" ? "成功" : "失败"}</b>
          <span>{run.model}</span><span>{(run.latencyMs / 1000).toFixed(1)}s</span>
          <code>{run.errorCode || run.requestId || "—"}</code><time>{dateTime(run.createdAt)}</time>
        </article>) : <div className="admin-empty">还没有生成记录。</div>}
      </div>
    </section>

    <section className="admin-panel" id="billing">
      <div className="admin-section-title"><div><span>05 / BILLING</span><h2>订阅与支付事件</h2></div><p>Stripe Webhook 是订阅状态的唯一事实来源。</p></div>
      <div className="billing-event-list">{overview?.recentBilling?.length ? overview.recentBilling.map((event) => <article key={String(event.event_id)}>
        <b className={event.status === "processed" ? "status-good" : "status-bad"}>{String(event.status)}</b>
        <div><strong>{String(event.event_type)}</strong><span>{String(event.object_id || "—")}</span></div>
        <em>{event.amount_total ? `${String(event.currency || "USD")} ${(Number(event.amount_total) / 100).toFixed(2)}` : "—"}</em>
        <time>{dateTime(String(event.received_at))}</time>
      </article>) : <div className="admin-empty">尚无支付事件；Stripe 未配置时用户端不会显示购买入口。</div>}</div>
    </section>

    <section className="admin-panel" id="nutrition-admin">
      <div className="admin-section-title"><div><span>06 / NUTRITION</span><h2>营养识别质量</h2></div><p>低置信度结果必须由用户确认，不以图片估算冒充精确热量。</p></div>
      <div className="nutrition-admin-metrics"><article><span>识别请求</span><b>{metrics?.mealAnalyses ?? 0}</b></article><article><span>成功率</span><b>{metrics?.mealAnalysisSuccessRate ?? 0}%</b></article><article><span>低置信度</span><b>{metrics?.lowConfidenceMeals ?? 0}</b></article><article><span>确认餐食</span><b>{metrics?.meals ?? 0}</b></article></div>
    </section>

    <section className="admin-panel" id="users">
      <div className="admin-section-title"><div><span>07 / USERS</span><h2>用户管理</h2></div><p>停用用户会立即撤销本站会话，不会删除其 Cmine ID。</p></div>
      <div className="admin-user-search"><input value={userQuery} onChange={(event) => setUserQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void searchUsers(); }} placeholder="邮箱、姓名或 Cmine sub" /><button onClick={() => void searchUsers()}>搜索</button></div>
      <div className="admin-user-list">{users.length ? users.map((user) => <article key={user.id}>
        <span className="admin-user-avatar">{(user.name || user.email || "C").slice(0, 1).toUpperCase()}</span>
        <div><h3>{user.name || "未设置姓名"}</h3><p>{user.email || "未返回邮箱"}</p></div>
        <time>{dateTime(user.createdAt || user.created_at || new Date().toISOString())}</time>
        <b className={user.status === "active" ? "status-good" : "status-bad"}>{user.status === "active" ? "正常" : "已停用"}</b>
        <button onClick={() => void setUserStatus(user.id, user.status === "active" ? "suspended" : "active")}>{user.status === "active" ? "停用" : "恢复"}</button>
      </article>) : <div className="admin-empty">没有符合条件的用户。</div>}</div>
    </section>

    <section className="admin-panel" id="settings">
      <div className="admin-section-title"><div><span>08 / SETTINGS</span><h2>额度与站点设置</h2></div><p>预算触发后停止新的 AI 请求，但历史、训练和营养记录仍然可用。</p></div>
      <div className="admin-settings">
        <label><span>站内公告</span><input value={announcement} maxLength={300} onChange={(event) => setAnnouncement(event.target.value)} placeholder="留空则不展示公告" /><button onClick={() => void updateSetting("announcement", announcement)}>保存</button></label>
        {[
          ["ai_daily_hard_usd", "每日硬成本上限（USD）", 5],
          ["ai_monthly_hard_usd", "每月硬成本上限（USD）", 50],
          ["free_plan_limit", "免费版计划额度", 2],
          ["free_meal_scan_limit", "免费版饭菜识别额度", 5],
          ["pro_plan_limit", "Pro 计划额度", 30],
          ["pro_meal_scan_limit", "Pro 饭菜识别额度", 100],
          ["pro_coach_message_limit", "Pro Coach 消息额度", 200],
        ].map(([key, label, fallback]) => <label key={String(key)}><span>{String(label)}</span><input type="number" min="0" value={Number(overview?.settings[String(key)]?.value ?? fallback)} onChange={(event) => setOverview((current) => current ? { ...current, settings: { ...current.settings, [String(key)]: { value: Number(event.target.value), updatedBy: current.admin.email, updatedAt: new Date().toISOString() } } } : current)} /><button onClick={() => void updateSetting(String(key), Number(overview?.settings[String(key)]?.value ?? fallback))}>保存</button></label>)}
        <article><div><h3>维护模式</h3><p>临时阻止新的 AI 计划生成；账户和历史仍可访问。</p></div><button className={overview?.settings.maintenance_mode?.value === true ? "danger" : ""} onClick={() => void updateSetting("maintenance_mode", overview?.settings.maintenance_mode?.value !== true)}>{overview?.settings.maintenance_mode?.value === true ? "关闭维护模式" : "开启维护模式"}</button></article>
      </div>
    </section>

    <section className="admin-panel" id="audit">
      <div className="admin-section-title"><div><span>09 / AUDIT</span><h2>管理操作审计</h2></div><p>用户状态、模型路由和站点设置的修改都会留痕。</p></div>
      <div className="audit-list">{overview?.recentAudits?.length ? overview.recentAudits.map((event) => <article key={String(event.id)}><time>{dateTime(String(event.created_at))}</time><b>{String(event.action)}</b><span>{String(event.admin_email)}</span><code>{String(event.target_id || event.target_type || "—")}</code></article>) : <div className="admin-empty">尚无管理操作。</div>}</div>
    </section>
    {notice && <div className="toast admin-toast">{notice}</div>}
  </>;
}
