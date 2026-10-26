import type { Metadata } from "next";
import IntakeClient from "../features/profile/intake-client";
import { resolveLocale } from "../lib/locale-server";
import { translator } from "../../packages/i18n/src";

// /start and /onboarding are the same screen. The first is the name the
// marketing page points at; the second is the address every existing link,
// bookmark and sign-in return path already uses.
export async function generateMetadata(): Promise<Metadata> {
  const t = translator(await resolveLocale());
  return { title: t("onboarding.metaTitle"), description: t("onboarding.metaDescription") };
}

export default function StartPage() { return <IntakeClient />; }
