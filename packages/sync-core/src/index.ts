import type { SyncMutation } from "../../api-contracts/src";

export const OFFLINE_MUTATION_TYPES = new Set<SyncMutation["entityType"]>(["workout_session", "measurement", "meal_draft", "coach_draft"]);

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
