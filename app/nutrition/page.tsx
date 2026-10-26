import type { Metadata } from "next";
import NutritionDashboard from "./nutrition-dashboard";
import { resolveLocale } from "../lib/locale-server";
import { translator } from "../../packages/i18n/src";

// Metadata is produced on the server, where `useT` cannot run, so the locale is
// resolved the same way app/layout.tsx resolves it and the catalog is read
// directly. A static `metadata` object could only ever carry one language.
export async function generateMetadata(): Promise<Metadata> {
  const t = translator(await resolveLocale());
  return {
    title: t("nutrition.metaTitle"),
    description: t("nutrition.metaDescription"),
  };
}

export default function NutritionPage() {
  return <NutritionDashboard />;
}
