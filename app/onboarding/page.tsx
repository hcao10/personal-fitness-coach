import type { Metadata } from "next";
import OnboardingClient from "./onboarding-client";
import { resolveLocale } from "../lib/locale-server";
import { translator } from "../../packages/i18n/src";

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(await resolveLocale());
  return { title: t("onboarding.metaTitle"), description: t("onboarding.metaDescription") };
}

export default function OnboardingPage() { return <OnboardingClient />; }
