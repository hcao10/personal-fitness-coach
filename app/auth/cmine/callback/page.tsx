import Link from "next/link";

export default function LegacyCmineCallbackPage() {
  return <main className="callback-page"><div className="callback-card"><span className="brand-mark">C</span><p>Cmine ID 已改用服务端安全回调。请返回首页重新登录。</p><Link href="/">返回 Cmine Fit</Link></div></main>;
}
