import type { SyncMutation } from "../../api-contracts/src";

// Must stay in lockstep with applyMutation in worker/modules/mobile.ts — every
// type listed here has a real server-side handler; anything else is rejected
// instead of being silently recorded as "applied".
export const OFFLINE_MUTATION_TYPES = new Set<SyncMutation["entityType"]>(["workout_session", "measurement", "workout_set"]);

export function newMutationId(): string {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function validateSyncMutation(value: unknown): value is SyncMutation {
  if (!value || typeof value !== "object") return false;
  const mutation = value as Partial<SyncMutation>;
  return typeof mutation.mutationId === "string" && mutation.mutationId.length <= 100 &&
    typeof mutation.deviceId === "string" && mutation.deviceId.length <= 100 &&
    typeof mutation.entityId === "string" && mutation.entityId.length <= 100 &&
    typeof mutation.entityType === "string" && OFFLINE_MUTATION_TYPES.has(mutation.entityType as SyncMutation["entityType"]) &&
    (mutation.operation === "upsert" || mutation.operation === "delete") &&
    typeof mutation.occurredAt === "string" && Boolean(mutation.payload && typeof mutation.payload === "object");
}
