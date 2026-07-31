import type { Metadata } from "next";
import PricingClient from "./pricing-client";

export const metadata: Metadata = {
  title: "专业计划 — Cmine Fit",
  description: "了解 Cmine Fit 免费版与专业版：从一周 AI 计划，到持续适应你变化的长期训练与营养指导。",
};

export default function PricingPage() {
  return <PricingClient />;
}
