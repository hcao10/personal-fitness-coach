import Link from "next/link";
import { BrandMark } from "../shared/ui/brand-mark";
export function DocumentHeader({ locale }: { locale: "zh" | "en" }) {
  return <header className="document-header"><Link className="product-logo" href="/"><BrandMark /><b>Cmine Fit</b></Link><Link className="fit-text-link" href="/">{locale === "zh" ? "返回首页" : "Back to home"}</Link></header>;
}
