import type { MetadataRoute } from "next";
import { resolveLocale } from "./lib/locale-server";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const locale = await resolveLocale();
  return {
    name: "Cmine Fit",
    short_name: "Cmine Fit",
    description: locale === "zh" ? "懂训练，更懂你的 AI 健身教练。" : "An AI fitness coach built around your goals and real constraints.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f5f5f7",
    theme_color: "#216b53",
    categories: ["fitness", "health", "lifestyle"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
