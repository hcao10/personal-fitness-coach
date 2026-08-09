import type { Metadata } from "next";
import AccountDashboard from "./account-dashboard";
import { translator } from "../../packages/i18n/src";
import { resolveLocale } from "../lib/locale-server";

// Resolved per request rather than exported as a constant: a static `metadata`
// can only carry one language, and the browser tab was Chinese for every
// reader. Same source of truth as `<html lang>` in the root layout.
export async function generateMetadata(): Promise<Metadata> {
  const t = translator(await resolveLocale());
  return {
    title: t("account.metaTitle"),
    description: t("account.metaDescription"),
  };
}

export default function AccountPage() {
  return <AccountDashboard />;
}
