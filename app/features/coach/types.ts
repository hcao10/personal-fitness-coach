import type { WorkoutDay } from "../../../packages/coach-core/src";
export type Evidence = { label: string; value: string; observedAt?: string | null; source?: string | null };
export type Source = { id: string; title: string; publisher: string; url: string };
export type Action = { draftUrl?: string; id: string; type: string; status: string; expiresAt?: string | null; payload: {
  title?: string; description?: string; before?: string; after?: string; reason?: string; impact?: string[]; reversible?: boolean;
  beforeWorkout?: WorkoutDay; afterWorkout?: WorkoutDay;
} };
export type Message = { id: string; role: "user" | "assistant"; content: string; createdAt: string; actions?: Action[];
  intent?: string; basis?: Evidence[]; limitations?: string[]; sources?: Source[]; safety?: { highRisk?: boolean } };
export type Conversation = { id: string; title: string; updatedAt: string };
