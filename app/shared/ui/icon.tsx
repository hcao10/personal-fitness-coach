import type { SVGProps } from "react";

const paths = {
  training: "M5 5v14M2 8v8M19 5v14M22 8v8M5 12h14",
  coach: "M21 11.5a8.5 8.5 0 0 1-8.5 8.5H5l-3 2 1-6a8.5 8.5 0 1 1 18-4.5ZM8 11h.01M12 11h.01M16 11h.01",
  nutrition: "M7 3v7M3 3v5a4 4 0 0 0 8 0V3M7 12v9M20 3c-4 2-5 6-5 10h5M20 3v18",
  progress: "M4 3v17h17M8 15l4-5 4 2 5-7",
  account: "M20 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2M16 5a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  arrow: "M5 12h14M13 6l6 6-6 6",
  check: "m5 12 4 4L19 6",
  clock: "M12 7v5l3 2M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0Z",
  plan: "M8 3H5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-3M8 2h8v4H8ZM7 11h10M7 16h6",
  play: "m9 5 10 7-10 7Z",
} as const;

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: keyof typeof paths }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}><path d={paths[name]} /></svg>;
}
