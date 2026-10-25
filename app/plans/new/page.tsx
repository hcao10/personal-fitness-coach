import type { Metadata } from "next";
import IntakeClient from "../../features/profile/intake-client";
import { resolveLocale } from "../../lib/locale-server";
import { translator } from "../../../packages/i18n/src";

// This route used to render the marketing homepage, back when the homepage was
// also the intake form. Now that the questions have their own screen, "new plan"
// means the intake.
export async function generateMetadata(): Promise<Metadata> {
  const t = translator(await resolveLocale());
  return { title: t("onboarding.metaTitle"), description: t("onboarding.metaDescription") };
}

export default function NewPlanPage() { return <IntakeClient />; }
