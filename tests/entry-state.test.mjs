import assert from "node:assert/strict";
import test from "node:test";
import { resolveEntry } from "../packages/product-state/src/capability.ts";

// The three dead ends this product shipped were one bug wearing three faces:
//
//   /onboarding  await beginCmineLogin(); return;   // never setLoading(false)
//   /today       await beginCmineLogin(); return;   // never setLoading(false)
//   /coach       return;                            // no conversation, live composer
//
// In each, a probe that answered "no" left the page in `loading` with no
// transition out. These tests enumerate the whole input space and assert that
// cannot happen again, whichever page asks.

const CAPABILITIES = [
  { accounts: false, ai: false, schemaReady: false, rewardAds: false },
  { accounts: false, ai: true, schemaReady: true, rewardAds: false },
  { accounts: true, ai: false, schemaReady: true, rewardAds: false },
  { accounts: true, ai: true, schemaReady: true, rewardAds: true },
];
const SESSIONS = [{ signedIn: false }, { signedIn: true }];

test("once both probes have answered, no page is ever left loading", () => {
  for (const capabilities of CAPABILITIES) {
    for (const session of SESSIONS) {
      for (const guestSupported of [true, false]) {
        const state = resolveEntry({ session, capabilities, guestSupported });
        assert.notEqual(state.status, "loading",
          `loading with capabilities=${JSON.stringify(capabilities)} session=${JSON.stringify(session)} guest=${guestSupported}`);
      }
    }
  }
});

test("loading is only reachable while a probe is genuinely outstanding", () => {
  const capabilities = CAPABILITIES[0];
  assert.equal(resolveEntry({ session: null, capabilities, guestSupported: true }).status, "loading");
  assert.equal(resolveEntry({ session: { signedIn: false }, capabilities: null, guestSupported: true }).status, "loading");
  assert.equal(resolveEntry({ session: null, capabilities: null, guestSupported: true }).status, "loading");
});

test("a failed probe is an error with a retry, never a spinner", () => {
  const state = resolveEntry({ session: null, capabilities: null, probeFailed: true, guestSupported: true });
  assert.deepEqual(state, { status: "error", retryable: true });
});

test("with Cmine ID unconfigured, a guest-capable page enters guest mode and says why", () => {
  const state = resolveEntry({
    session: { signedIn: false },
    capabilities: { accounts: false, ai: false, schemaReady: false, rewardAds: false },
    guestSupported: true,
  });
  assert.deepEqual(state, { status: "guest", reason: "accounts_not_configured" });
});

test("with Cmine ID configured but nobody signed in, guest mode names the other reason", () => {
  const state = resolveEntry({
    session: { signedIn: false },
    capabilities: { accounts: true, ai: false, schemaReady: true, rewardAds: false },
    guestSupported: true,
  });
  assert.deepEqual(state, { status: "guest", reason: "not_signed_in" });
});

test("an account-only page never offers a sign-in button that cannot work", () => {
  const unconfigured = resolveEntry({
    session: { signedIn: false },
    capabilities: { accounts: false, ai: false, schemaReady: false, rewardAds: false },
    guestSupported: false,
  });
  assert.deepEqual(unconfigured, { status: "sign_in_required", canSignIn: false });

  const configured = resolveEntry({
    session: { signedIn: false },
    capabilities: { accounts: true, ai: false, schemaReady: true, rewardAds: false },
    guestSupported: false,
  });
  assert.deepEqual(configured, { status: "sign_in_required", canSignIn: true });
});

test("a signed-in user reaches account mode regardless of the other capabilities", () => {
  for (const capabilities of CAPABILITIES) {
    assert.deepEqual(
      resolveEntry({ session: { signedIn: true }, capabilities, guestSupported: false }),
      { status: "account" },
    );
  }
});
