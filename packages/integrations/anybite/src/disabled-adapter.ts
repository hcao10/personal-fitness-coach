/**
 * The only adapter this build ships.
 *
 * anyBite currently has planning documents and no deployed service, so every
 * method here refuses in a way the UI can render honestly. It does not throw,
 * does not queue, and never reports a `lastSyncedAt` — a queue that drains into
 * nothing is indistinguishable from a working integration until someone looks.
 *
 * The future real adapter is `createAnybiteAdapter({ baseUrl, consentStore })`,
 * which returns the same `AnybiteIntegrationPort`. Nothing above the port
 * changes when it arrives.
 */

import type {
  AnybiteConnectionStatus, AnybiteConsent, AnybiteIntegrationPort,
  AnybitePullResult, AnybitePushResult, MealOutcomeSummary,
} from "./contracts.ts";

const UNSUPPORTED: AnybiteConnectionStatus = { status: "unsupported", reason: "no_peer_service" };

// Parameters are omitted rather than named and ignored: a method that declares
// `snapshot` and never reads it reads as an oversight, while a zero-argument
// implementation says plainly that nothing here inspects its input.
export class DisabledAnybiteAdapter implements AnybiteIntegrationPort {
  async status(): Promise<AnybiteConnectionStatus> { return UNSUPPORTED; }

  /** No consent can be recorded for a link that cannot exist. */
  async consents(): Promise<AnybiteConsent[]> { return []; }

  async grant(): Promise<AnybiteConnectionStatus> { return UNSUPPORTED; }

  async revoke(): Promise<AnybiteConnectionStatus> { return UNSUPPORTED; }

  async pushNutritionGoal(): Promise<AnybitePushResult> {
    return { ok: false, code: "unsupported", retryable: false };
  }

  async pullMealOutcomes(): Promise<AnybitePullResult<MealOutcomeSummary>> {
    return { ok: false, code: "unsupported", retryable: false };
  }
}

export const anybiteIntegration: AnybiteIntegrationPort = new DisabledAnybiteAdapter();

/**
 * Pairwise pseudonym for a Fit user.
 *
 * Not the email, not the Cmine subject. `integrationSalt` is per deployment, so
 * two products that happen to share a login cannot join their records by
 * recomputing the id.
 */
export async function pairwiseSubjectId(fitUserId: string, integrationSalt: string): Promise<string> {
  const data = new TextEncoder().encode(`${integrationSalt}:${fitUserId}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).slice(0, 16).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
