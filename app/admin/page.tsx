import type { Metadata } from "next";
import AdminPageClient from "./admin-page-client";

export const metadata: Metadata = { title: "产品管理台 · Cmine Fit", robots: { index: false, follow: false } };

export default function AdminPage() {
  return <AdminPageClient />;
}
