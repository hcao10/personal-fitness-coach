"use client";

import Link from "next/link";
import { BrandMark } from "../shared/ui/brand-mark";
import AdminDashboard from "./admin-dashboard";

export default function AdminAuthorized() {
  return <main className="admin-shell">
    <aside className="admin-rail">
      <Link className="brand admin-brand" href="/" aria-label="Cmine Fit home"><BrandMark /><span>CMINE <b>FIT</b></span></Link>
      <div className="admin-nav-label">CONTROL ROOM</div>
      <nav aria-label="管理后台导航"><a className="active" href="#overview"><span>01</span>总览</a><a href="#modules"><span>02</span>系统模块</a><a href="#models"><span>03</span>模型路由</a><a href="#billing"><span>04</span>支付订阅</a><a href="#nutrition-admin"><span>05</span>营养识别</a><a href="#users"><span>06</span>用户管理</a><a href="#settings"><span>07</span>额度设置</a><a href="#audit"><span>08</span>审计日志</a><Link href="/"><span></span>返回用户端</Link></nav>
      <div className="admin-identity"><span>C</span><div><b>Cmine ID</b><small>产品权限验证</small></div></div>
    </aside>
    <section className="admin-main" id="overview">
      <header className="admin-topbar"><div><span>CMINE FIT / ADMIN</span><strong>产品管理台</strong></div><Link href="/">返回用户端 </Link></header>
      <AdminDashboard />
      <footer className="admin-footer"><span>CMINE FIT CONTROL ROOM</span><p>健康和训练建议仍需以用户身体反馈及专业意见为准。</p></footer>
    </section>
  </main>;
}
