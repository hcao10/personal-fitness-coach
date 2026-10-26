"use client";
import Link from "next/link";
import { useLocale } from "./lib/i18n-provider";
import { BrandMark } from "./shared/ui/brand-mark";
export default function PageError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useLocale();
  return <main className="fit-system-state"><section className="fit-system-card"><BrandMark size={44} /><h1>{t("refresh.system.errorTitle")}</h1><p>{t("refresh.system.errorBody")}</p><div className="fit-system-actions"><button className="primary-cta" onClick={reset}>{t("refresh.system.retry")}</button><Link className="secondary-cta" href="/">{t("refresh.system.back")}</Link></div></section></main>;
}
