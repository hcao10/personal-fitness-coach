import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = new URL("/og.png", protocol + "://" + host);
  return {
    title: "Cmine Fit — 懂训练，更懂你",
    description: "从身体数据、训练目标和现实条件出发，生成能坚持的一周训练与饮食建议。",
    applicationName: "Cmine Fit",
    keywords: ["AI fitness coach", "健身计划", "训练计划", "BMR", "open source fitness"],
    openGraph: {
      title: "Cmine Fit — 懂训练，更懂你",
      description: "从真实身体条件和训练目标出发，为您定制专属训练与饮食计划。",
      type: "website",
      images: [{ url: imageUrl, width: 1672, height: 941, alt: "Cmine Fit social preview" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Cmine Fit — 懂训练，更懂你",
      description: "从真实身体条件和训练目标出发，为您定制专属训练与饮食计划。",
      images: [imageUrl],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
