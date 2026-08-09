import type { Metadata } from "next";
import PricingClient from "./pricing-client";
import { resolveLocale } from "../lib/locale-server";
import { translator } from "../../packages/i18n/src";

// A static `metadata` object could only ever hold one language, so the tab
// title and the search snippet stayed Chinese for an English visitor whose
// page body was English. Generating it per request uses the same
// server-resolved locale as `<html lang>` in app/layout.tsx.
export async function generateMetadata(): Promise<Metadata> {
  const t = translator(await resolveLocale());
  return {
    title: t("pricing.metaTitle"),
    description: t("pricing.metaDescription"),
  };
}

export default function PricingPage() {
  return <PricingClient />;
}
