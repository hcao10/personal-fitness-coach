"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch } from "./client";
import { resolveEntry, type CapabilitySnapshot, type EntryState } from "../../../packages/product-state/src";

/**
 * One capability probe for the whole app.
 *
 * Every page used to run its own `/api/health` and `/api/auth/me`, interpret the
 * answers differently, and — on failure — stop. Here the probe runs once, its
 * result is a value every page reads, and the failure has a name that pages can
 * render instead of a spinner they can never leave.
 */

export type SessionUser = { sub: string; email?: string | null; name?: string | null; picture?: string | null; role?: "user" | "admin" };

type HealthResponse = {
  cmine?: boolean; coachChat?: boolean; llm?: boolean; planner?: boolean; schemaReady?: boolean;
  rewardAds?: boolean; database?: boolean; missingTables?: string[];
};

type ProbeResult = {
  session: { signedIn: boolean; user: SessionUser | null; points: number } | null;
  capabilities: CapabilitySnapshot | null;
  /** True when the probe itself could not complete, not when it answered "no". */
  probeFailed: boolean;
  /** Tables the deployment is missing, so a local setup can be told what to run. */
  missingTables: string[];
};

export type ProbeValue = ProbeResult & { refresh: () => void };

const CapabilityContext = createContext<ProbeValue | null>(null);

export function CapabilityProvider({ children }: { children: ReactNode }) {
  const [result, setResult] = useState<ProbeResult>({ session: null, capabilities: null, probeFailed: false, missingTables: [] });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    // The effect body starts the request and nothing else; every state write
    // happens in the callback below, so retrying cannot cascade renders.
    void Promise.all([
      apiFetch<HealthResponse>("/api/health"),
      apiFetch<{ user: SessionUser | null; points: number }>("/api/auth/me"),
    ]).then(([health, me]) => {
      if (!active) return;
      // A 401 from /api/auth/me is a real answer — "nobody is signed in" — not a
      // failure. Treating it as one is how the product ended up redirecting to a
      // login it had already been told did not exist.
      const session = me.ok
        ? { signedIn: Boolean(me.data.user), user: me.data.user, points: me.data.points || 0 }
        : me.kind === "auth" ? { signedIn: false, user: null, points: 0 } : null;
      setResult({
        session,
        capabilities: health.ok ? {
          accounts: Boolean(health.data.cmine),
          ai: Boolean(health.data.coachChat ?? health.data.llm ?? health.data.planner),
          schemaReady: Boolean(health.data.schemaReady),
          rewardAds: Boolean(health.data.rewardAds),
        } : null,
        probeFailed: !health.ok || !session,
        missingTables: health.ok ? health.data.missingTables || [] : [],
      });
    });
    return () => { active = false; };
  }, [attempt]);

  // Retrying is an event, not a state derivation: bumping the attempt counter
  // re-runs the effect above without any component calling setState in one.
  const refresh = useCallback(() => setAttempt((value) => value + 1), []);

  const value = useMemo<ProbeValue>(() => ({ ...result, refresh }), [result, refresh]);
  return <CapabilityContext.Provider value={value}>{children}</CapabilityContext.Provider>;
}

export function useCapabilities(): ProbeValue {
  const value = useContext(CapabilityContext);
  // Defaulting to "everything is off" here would render a sign-in-less product
  // on a fully configured deployment, so a missing provider is a bug to fix, not
  // a state to degrade into.
  if (!value) throw new Error("useCapabilities used outside CapabilityProvider — wrap the tree in app/layout.tsx");
  return value;
}

/**
 * The entry decision for one page.
 *
 * `guestSupported` is the page's own claim about whether it has a real
 * experience without an account. The plan, session, coach and library pages say
 * yes; the account and admin pages say no.
 */
export function useEntry(guestSupported: boolean): ProbeValue & { entry: EntryState } {
  const probe = useCapabilities();
  const entry = resolveEntry({
    session: probe.session,
    capabilities: probe.capabilities,
    probeFailed: probe.probeFailed,
    guestSupported,
  });
  return { ...probe, entry };
}
