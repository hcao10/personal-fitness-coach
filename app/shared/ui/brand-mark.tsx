import Image from "next/image";

/** The existing Cmine Fit mark, shared with the favicon and installed PWA. */
export function BrandMark({ size = 32 }: { size?: number }) {
  return <Image src="/icon.svg" alt="" width={size} height={size} unoptimized className="brand-symbol" />;
}
