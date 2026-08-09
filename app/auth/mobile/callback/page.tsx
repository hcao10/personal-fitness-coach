import type { Metadata } from "next";
import { resolveLocale } from "../../../lib/locale-server";
import { translator } from "../../../lib/i18n";

// A server component, so there is no useT() here: the locale is resolved from
// the request the same way app/layout.tsx resolves it. The title had to move
// from a static `metadata` object to `generateMetadata` for the same reason —
// a per-request locale cannot be baked into a module-level constant.
export async function generateMetadata(): Promise<Metadata> {
  const t = translator(await resolveLocale());
  return { title: t("auth.returnToAppTitle"), robots: { index: false, follow: false } };
}

export default async function MobileCallbackFallback() {
  const t = translator(await resolveLocale());
  return <main className="mobile-callback-page">
    <section>
      <span>CMINE FIT · SECURE SIGN-IN</span>
      <h1>{t("auth.returnToAppHeading")}</h1>
      <p>{t("auth.returnToAppBody")}</p>
      <a href="cminefit://auth/callback">{t("auth.openApp")}</a>
      <small>{t("auth.authCodeNotice")}</small>
    </section>
  </main>;
}
