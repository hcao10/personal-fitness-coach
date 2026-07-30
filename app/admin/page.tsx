import type { Metadata } from "next";
import Link from "next/link";
import { chatGPTSignOutPath, requireChatGPTUser } from "../chatgpt-auth";
import AdminDashboard from "./admin-dashboard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "产品管理台 · Cmine Fit", robots: { index: false, follow: false } };

export default async function AdminPage() {
  const user = await requireChatGPTUser("/admin");
  return <main className="admin-shell">
    <aside className="admin-rail">
      <Link className="brand admin-brand" href="/" aria-label="Cmine Fit home"><span className="brand-mark">C</span><span>CMINE <b>FIT</b></span></Link>
      <div className="admin-nav-label">CONTROL ROOM</div>
      <nav aria-label="管理后台导航"><a className="active" href="#overview"><span>01</span>总览</a><a href="#modules"><span>02</span>系统模块</a><a href="#generations"><span>03</span>AI 生成</a><a href="#users"><span>04</span>用户管理</a><a href="#settings"><span>05</span>站点设置</a><Link href="/"><span>↗</span>返回用户端</Link></nav>
      <div className="admin-identity"><span>{user.displayName.slice(0, 1).toUpperCase()}</span><div><b>{user.displayName}</b><small>已验证身份</small></div></div>
    </aside>
    <section className="admin-main" id="overview">
      <header className="admin-topbar"><div><span>CMINE FIT / ADMIN</span><strong>产品管理台</strong></div><a href={chatGPTSignOutPath("/")}>安全退出 ↗</a></header>
      <AdminDashboard />
      <footer className="admin-footer"><span>CMINE FIT CONTROL ROOM</span><p>健康和训练建议仍需以用户身体反馈及专业意见为准。</p></footer>
    </section>
  </main>;
}
