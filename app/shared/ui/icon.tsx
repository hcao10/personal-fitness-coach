import type { SVGProps } from "react";
import { Dumbbell, MessageCircle, Utensils, ChartColumnIncreasing, UserRound, Check, Clock3, ClipboardList, Play, X, Plus, Coins, ShieldCheck } from "lucide-react";

const icons = {
  training: Dumbbell, coach: MessageCircle, nutrition: Utensils, progress: ChartColumnIncreasing,
  account: UserRound, check: Check, clock: Clock3, plan: ClipboardList, play: Play,
  close: X, plus: Plus, points: Coins, security: ShieldCheck,
} as const;

/** One icon family; decorative icons inherit the label and color of their control. */
export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: keyof typeof icons }) {
  const Symbol = icons[name];
  return <Symbol width={22} height={22} strokeWidth={1.75} aria-hidden="true" focusable="false" {...props} />;
}
