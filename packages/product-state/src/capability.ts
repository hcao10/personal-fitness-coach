/**
 * Capability and entry states.
 *
 * The three dead ends this product shipped — `/onboarding` stuck on "restoring
 * your profile", `/today` stuck on "preparing today's session", `/coach` showing
 * a composer whose send button could never work — were all the same bug: a probe
 * that failed left the page in `loading` with no transition out of it.
 *
 * So `loading` is not a boolean here. It is one case of a union whose remaining
 * cases every caller must render, and `resolveEntry` is a total function over the
 * probe results. `tests/entry-state.test.mjs` enumerates every input combination
 * and asserts that once both probes have answered, the result is never `loading`.
 */

export type CapabilityReason =
  /** The deployment has no credentials for it (no Cmine ID, no LLM key). */
  | "not_configured"
  /** Configured, but this particular user is not signed in. */
  | "requires_account"
  /** Configured and signed in, but the account's plan does not include it. */
  | "requires_entitlement"
  /** The browser could not reach the server at all. */
  | "offline";

export type CapabilityState<T = true> =
  | { status: "loading" }
  | { status: "available"; value: T }
  | { status: "unavailable"; reason: CapabilityReason }
  | { status: "error"; retryable: boolean; code: string };

export const capabilityAvailable = <T>(state: CapabilityState<T>): T | null =>
  state.status === "available" ? state.value : null;

/** Product capabilities the client asks about before rendering a decision. */
export type CapabilitySnapshot = {
  /** Cmine ID is configured, so signing in is a real option. */
  accounts: boolean;
  /** A planner route is configured, so an AI plan is a real option. */
  ai: boolean;
  /** The database answered AND the product schema is present. */
  schemaReady: boolean;
  rewardAds: boolean;
};

/**
 * What a page knows when it decides what to render.
 *
 * `null` means "the probe has not answered yet" — deliberately distinct from
 * `false`, which means "the probe answered and the thing is off". Collapsing the
 * two is precisely how a failed probe became an infinite spinner.
 */
export type EntryInput = {
  session: { signedIn: boolean } | null;
  capabilities: CapabilitySnapshot | null;
  /** The probe itself failed (network, 5xx). Distinct from "answered false". */
  probeFailed?: boolean;
  /** Whether this page has a real experience for a user with no account. */
  guestSupported: boolean;
};

export type EntryState =
  | { status: "loading" }
  | { status: "account" }
  | { status: "guest"; reason: "accounts_not_configured" | "not_signed_in" }
  /** No guest path here. `canSignIn` false means the button must not be shown. */
  | { status: "sign_in_required"; canSignIn: boolean }
  | { status: "error"; retryable: true };

export function resolveEntry(input: EntryInput): EntryState {
  if (input.probeFailed) return { status: "error", retryable: true };
  if (!input.session || !input.capabilities) return { status: "loading" };
  if (input.session.signedIn) return { status: "account" };
  if (input.guestSupported) {
    return { status: "guest", reason: input.capabilities.accounts ? "not_signed_in" : "accounts_not_configured" };
  }
  return { status: "sign_in_required", canSignIn: input.capabilities.accounts };
}

/**
 * Where a plan comes from. Kept as a type rather than a boolean because the UI
 * has to say which one it is, and "not AI" is three different things: rules,
 * a refused AI call, and an AI call that failed review.
 */
export type PlanSource = "rules" | "ai";

/** How a coach answer was produced. The UI must never present `rules` as `ai`. */
export type CoachAnswerSource = "ai" | "rules" | "unavailable";
