import type { Metadata } from "next";
import TodayClient from "./today-client";
import { resolveLocale } from "../lib/locale-server";
import { translator } from "../../packages/i18n/src";

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(await resolveLocale());
  return { title: t("product.workout.todayTitle"), description: t("today.emptyBody") };
}

export default function TodayPage() { return <TodayClient />; }
