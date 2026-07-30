import type { Metadata } from "next";
import AccountDashboard from "./account-dashboard";

export const metadata: Metadata = {
  title: "我的训练 · Cmine Fit",
  description: "查看你的计划、训练进度和身体记录。",
};

export default function AccountPage() {
  return <AccountDashboard />;
}
