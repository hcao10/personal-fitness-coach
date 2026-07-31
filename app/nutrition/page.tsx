import type { Metadata } from "next";
import NutritionDashboard from "./nutrition-dashboard";

export const metadata: Metadata = {
  title: "饮食记录 · Cmine Fit",
  description: "拍照、扫码或手动记录餐食，在确认份量后计算每日热量和宏量营养。",
};

export default function NutritionPage() {
  return <NutritionDashboard />;
}

