"use client";
import Link from "next/link";
import { useLocale } from "./lib/i18n-provider";
import { BrandMark } from "./shared/ui/brand-mark";
export default function NotFound() {
  const { t } = useLocale();
  return <main className="fit-system-state"><section className="fit-system-card"><BrandMark size={44} /><h1>{t("refresh.system.missingTitle")}</h1><p>{t("refresh.system.missingBody")}</p><div className="fit-system-actions"><Link className="primary-cta" href="/">{t("refresh.system.back")}</Link><Link className="secondary-cta" href="/today">{t("refresh.system.training")}</Link></div></section></main>;
}
