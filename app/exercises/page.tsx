import type { Metadata } from "next";
import ExerciseCatalogClient from "./exercise-catalog-client";
import { resolveLocale } from "../lib/locale-server";
import { translator } from "../../packages/i18n/src";

// A static `metadata` object could only ever carry one language, so the browser
// tab and every share preview stayed Chinese no matter which language the reader
// had chosen. Resolved per request, the same way the root layout does it.
export async function generateMetadata(): Promise<Metadata> {
  const t = translator(await resolveLocale());
  return { title: t("exercises.metaTitle"), description: t("exercises.metaDescription") };
}

export default function ExerciseCatalogPage() { return <ExerciseCatalogClient />; }
