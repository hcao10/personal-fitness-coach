import type { Metadata } from "next";
import CoachClient from "./coach-client";
import { resolveLocale } from "../lib/locale-server";
import { translator } from "../../packages/i18n/src";

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(await resolveLocale());
  return { title: t("coach.title"), description: t("coach.emptyHint") };
}

export default function CoachPage() { return <CoachClient />; }
