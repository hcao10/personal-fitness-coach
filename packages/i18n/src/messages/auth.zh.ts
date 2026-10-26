// Copy for app/auth (callback screens). Chinese is the schema: a key added here must be
// added to auth.en.ts or the build fails.
export const authZh = {
  // Mobile OAuth hand-off fallback — shown in the system browser when the deep
  // link back into the app did not fire.
  // Brand + separator + assurance clause, the same shape as home.aiPersonalizedSafetyChecked.
  // It is a security claim on an OAuth callback, so it is copy, not ornament.
  secureSignInBadge: "CMINE FIT · 安全登录",
  returnToAppTitle: "返回 Cmine Fit App",
  returnToAppHeading: "请返回 Cmine Fit App",
  returnToAppBody: "登录结果会通过系统安全链接交给 App。若 App 没有自动打开，请确认已安装最新开发构建后重新登录。",
  openApp: "打开 Cmine Fit",
  authCodeNotice: "此页面不会显示、保存或交换你的登录授权码。",
  // Legacy browser callback route, kept only to redirect old bookmarks.
  serverCallbackNotice: "Cmine ID 已改用服务端安全回调。请返回首页重新登录。",
  backToHome: "返回 Cmine Fit",
  // Sign-in failures surfaced by app/lib/auth.ts.
  signInUnavailable: "Cmine ID 登录暂时不可用，请稍后再试。",
  signInServiceUnreachable: "暂时无法连接登录服务，请稍后重试。",
} as const;
