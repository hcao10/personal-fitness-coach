import Link from "next/link";
import { resolveLocale } from "../../../lib/locale-server";
import { translator } from "../../../lib/i18n";

export default async function LegacyCmineCallbackPage() {
  // Server component: the locale comes from the request, not from useT().
  const t = translator(await resolveLocale());
  return <main className="callback-page"><div className="callback-card"><span className="brand-mark">C</span><p>{t("auth.serverCallbackNotice")}</p><Link href="/">{t("auth.backToHome")}</Link></div></main>;
}
