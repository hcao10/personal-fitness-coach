import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = new URL("/og.png", protocol + "://" + host);
  return {
    title: "FORMA Coach — 你的 AI 私人健身教练",
    description: "从身体数据、训练目标和现实条件出发，生成能坚持的一周训练与饮食建议。",
    applicationName: "FORMA Coach",
    keywords: ["AI fitness coach", "健身计划", "训练计划", "BMR", "open source fitness"],
    openGraph: {
      title: "FORMA Coach — 你的 AI 私人健身教练",
      description: "把‘想练得更好’翻译成今天该做什么。",
      type: "website",
      images: [{ url: imageUrl, width: 1680, height: 945, alt: "FORMA Coach social preview" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "FORMA Coach — 你的 AI 私人健身教练",
      description: "把‘想练得更好’翻译成今天该做什么。",
      images: [imageUrl],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
