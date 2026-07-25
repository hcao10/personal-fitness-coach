import type { Metadata } from "next";
import Link from "next/link";
import { chatGPTSignOutPath, requireChatGPTUser } from "../chatgpt-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "产品管理台 · Cmine Fit", robots: { index: false, follow: false } };

const modules = [
  { name: "计划生成引擎", detail: "BMR、TDEE、目标周期、营养与训练编排", state: "运行中", tone: "live" },
  { name: "训练安全规则", detail: "风险提示、热量边界、疼痛与停止条件", state: "已启用", tone: "live" },
  { name: "Cmine ID", detail: "用户长期档案与进度连续性", state: "等待生产配置", tone: "ready" },
  { name: "奖励积分", detail: "激励内容、积分账本与兑换规则", state: "接口已预留", tone: "ready" },
] as const;

const roadmap = [
  { index: "01", title: "用户与训练档案", copy: "接入数据库后管理用户资料、训练历史、身体指标和目标变化。", status: "下一阶段" },
  { index: "02", title: "计划质量与安全复核", copy: "抽样查看计划、标记风险建议，并记录每次规则与提示词调整。", status: "设计完成" },
  { index: "03", title: "内容与多语言", copy: "集中维护动作说明、Coach 提醒、免责协议版本和九种语言内容。", status: "基础可用" },
  { index: "04", title: "权益与积分", copy: "管理积分来源、兑换项目、频率限制和异常奖励记录。", status: "接口已预留" },
] as const;

export default async function AdminPage() {
  const user = await requireChatGPTUser("/admin");

  return (
    <main className="admin-shell">
      <aside className="admin-rail">
        <Link className="brand admin-brand" href="/" aria-label="Cmine Fit home">
          <span className="brand-mark">C</span><span>CMINE <b>FIT</b></span>
        </Link>
        <div className="admin-nav-label">CONTROL ROOM</div>
        <nav aria-label="管理后台导航">
          <a className="active" href="#overview"><span>01</span>总览</a>
          <a href="#modules"><span>02</span>系统模块</a>
          <a href="#roadmap"><span>03</span>管理能力</a>
          <Link href="/"><span>↗</span>返回用户端</Link>
        </nav>
        <div className="admin-identity">
          <span>{user.displayName.slice(0, 1).toUpperCase()}</span>
          <div><b>{user.displayName}</b><small>站点管理员</small></div>
        </div>
      </aside>

      <section className="admin-main" id="overview">
        <header className="admin-topbar">
          <div><span>CMINE FIT / ADMIN</span><strong>产品管理台</strong></div>
          <a href={chatGPTSignOutPath("/")}>安全退出 ↗</a>
        </header>

        <div className="admin-intro">
          <div>
            <p>懂训练，更懂每一次变化</p>
            <h1>把一个好计划，<br /><em>做成长期的陪伴。</em></h1>
          </div>
          <aside><span>当前阶段</span><b>FOUNDATION</b><p>核心计划引擎、免责确认和管理入口已上线；用户数据与实时运营指标将在数据库接入后启用。</p></aside>
        </div>

        <div className="admin-metrics" aria-label="当前产品能力">
          <article><span>目标类型</span><b>5</b><small>手臂 / 减脂 / 增肌 / 塑形 / 力量</small></article>
          <article><span>语言入口</span><b>9</b><small>中英已完成，其他语言结构已预留</small></article>
          <article><span>训练周期</span><b>7d</b><small>完整训练与恢复编排</small></article>
          <article><span>安全确认</span><b>V1</b><small>首次使用前强制确认</small></article>
        </div>

        <section className="admin-panel" id="modules">
          <div className="admin-section-title"><div><span>02 / SYSTEM</span><h2>系统模块</h2></div><p>所有状态都对应当前代码与接入情况，不展示虚构运营数据。</p></div>
          <div className="module-table">
            {modules.map((module) => <article key={module.name}>
              <span className={`module-dot ${module.tone}`} />
              <div><h3>{module.name}</h3><p>{module.detail}</p></div>
              <b className={module.tone}>{module.state}</b>
            </article>)}
          </div>
        </section>

        <section className="admin-panel" id="roadmap">
          <div className="admin-section-title"><div><span>03 / MANAGEMENT</span><h2>长期管理能力</h2></div><p>以计划质量、安全性和个体适配为核心，逐步接入真实数据。</p></div>
          <div className="roadmap-grid">
            {roadmap.map((item) => <article key={item.index}>
              <span>{item.index}</span><div><h3>{item.title}</h3><p>{item.copy}</p></div><b>{item.status}</b>
            </article>)}
          </div>
        </section>

        <footer className="admin-footer"><span>CMINE FIT CONTROL ROOM</span><p>管理入口受身份验证保护。健康和训练建议仍需以用户身体反馈及专业意见为准。</p></footer>
      </section>
    </main>
  );
}
