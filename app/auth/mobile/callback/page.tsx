import type { Metadata } from "next";

export const metadata: Metadata = { title: "返回 Cmine Fit App", robots: { index: false, follow: false } };

export default function MobileCallbackFallback() {
  return <main className="mobile-callback-page">
    <section>
      <span>CMINE FIT · SECURE SIGN-IN</span>
      <h1>请返回 Cmine Fit App</h1>
      <p>登录结果会通过系统安全链接交给 App。若 App 没有自动打开，请确认已安装最新开发构建后重新登录。</p>
      <a href="cminefit://auth/callback">打开 Cmine Fit</a>
      <small>此页面不会显示、保存或交换你的登录授权码。</small>
    </section>
  </main>;
}
