import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import PwaRegister from "./pwa-register";
import { resolveLocale } from "./lib/locale-server";
import { LOCALE_META, SHIPPABLE_LOCALES } from "../packages/i18n/src";
import { LocaleProvider } from "./lib/i18n-provider";
import { CapabilityProvider } from "./shared/api/capability-provider";

const SITE_COPY = {
  zh: {
    title: "Cmine Fit — 懂训练，更懂你",
    description: "从身体数据、训练目标和现实条件出发，生成能坚持的一周训练与饮食建议。",
    social: "从真实身体条件和训练目标出发，为您定制专属训练与饮食计划。",
    keywords: ["AI fitness coach", "健身计划", "训练计划", "BMR", "open source fitness"],
  },
  en: {
    title: "Cmine Fit — understands training, understands you",
    description: "A week of training and nutrition you can actually keep, built from your body data, goals and real constraints.",
    social: "Personal training and nutrition plans built from your real body data and goals.",
    keywords: ["AI fitness coach", "training plan", "workout plan", "BMR", "open source fitness"],
  },
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const locale = await resolveLocale();
  const copy = SITE_COPY[locale];
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const imageUrl = new URL("/og.png", origin);
  return {
    title: copy.title,
    description: copy.description,
    applicationName: "Cmine Fit",
    keywords: [...copy.keywords],
    // Tells crawlers the page is served in several languages at one URL,
    // negotiated per request, rather than looking like duplicate content.
    alternates: {
      canonical: origin,
      languages: Object.fromEntries(SHIPPABLE_LOCALES.map((value) => [LOCALE_META[value].tag, origin])),
    },
    icons: {
      icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
      shortcut: "/icon.svg",
    },
    openGraph: {
      title: copy.title,
      description: copy.social,
      type: "website",
      locale: LOCALE_META[locale].tag,
      images: [{ url: imageUrl, width: 1672, height: 941, alt: "Cmine Fit social preview" }],
    },
    twitter: {
      card: "summary_large_image",
      title: copy.title,
      description: copy.social,
      images: [imageUrl],
    },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Resolved server-side so the language is correct on the first byte — a
  // client-side correction would leave screen readers announcing the wrong
  // language for the initial render.
  const locale = await resolveLocale();
  const meta = LOCALE_META[locale];
  // `key` matters: the provider seeds its state from this prop, and a prop
  // change alone would not reset it. Keying on the locale means a server-side
  // language change (cookie set on another page, Accept-Language renegotiated)
  // produces a fresh provider rather than stale state from the previous render.
  return <html lang={meta.tag} dir={meta.dir}><body>
    <PwaRegister />
    <LocaleProvider key={locale} locale={locale}>
      {/* One capability probe for the whole app. Every page used to run its own
          and interpret the answer differently; on failure, most of them simply
          stopped. */}
      <CapabilityProvider>
        {children}
      </CapabilityProvider>
    </LocaleProvider>
  </body></html>;
}
