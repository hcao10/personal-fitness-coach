import type { Metadata } from "next";
import PlanClient from "../features/plan/plan-client";
import { resolveLocale } from "../lib/locale-server";
import { translator } from "../../packages/i18n/src";

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(await resolveLocale());
  return { title: t("product.plan.metaTitle"), description: t("product.plan.metaDescription") };
}

export default function PlanPage() { return <PlanClient />; }
