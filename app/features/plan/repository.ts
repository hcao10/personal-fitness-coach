"use client";

import { apiFetch, apiPost, type ApiFailure } from "../../shared/api/client";
import { readJson, removeKey, writeJson } from "../../shared/storage";
import {
  generatePlan, localDate, type CoachPlan, type PlanRecord, type PlanState, type Profile,
} from "./plan-imports";

/**
 * One plan, two places it can live.
 *
 * The guest side is not a preview and not a teaser: it is a real plan produced
 * by the same deterministic planner the server runs, stored in this browser,
 * with the same draft-then-accept lifecycle. That is the difference between
 * "sign in to see the rest" and "here is your plan, sign in if you want it on
 * your phone too".
 */

const PLAN_KEY = "cmine_fit_plan_v1";

type StoredPlan = { record: PlanRecord; status: "draft" | "active" };

export type PlanResult = { ok: true; state: PlanState } | { ok: false; failure: ApiFailure | null };

export interface PlanRepository {
  load(): Promise<PlanState>;
  generate(profile: Profile, startDate: string, timezone: string): Promise<PlanResult>;
  accept(record: PlanRecord): Promise<PlanResult>;
}

const stateFromStored = (stored: StoredPlan | null): PlanState =>
  !stored ? { status: "none" } : stored.status === "active" ? { status: "active", record: stored.record } : { status: "draft", record: stored.record };

export const readLocalPlan = (): PlanState => stateFromStored(readJson<StoredPlan>(PLAN_KEY));
export const clearLocalPlan = (): void => removeKey(PLAN_KEY);

const localRepository: PlanRepository = {
  async load() { return readLocalPlan(); },

  async generate(profile, startDate) {
    const record: PlanRecord = {
      // A local id, marked as one. It must never be sent to an endpoint that
      // expects a server plan id, and the prefix is what makes that checkable.
      id: `local:${Date.now()}`,
      plan: generatePlan(profile),
      profile,
      source: "rules",
      startDate,
      createdAt: new Date().toISOString(),
    };
    const stored: StoredPlan = { record, status: "draft" };
    if (!writeJson(PLAN_KEY, stored)) return { ok: false, failure: null };
    return { ok: true, state: { status: "draft", record } };
  },

  async accept(record) {
    const stored: StoredPlan = { record, status: "active" };
    if (!writeJson(PLAN_KEY, stored)) return { ok: false, failure: null };
    return { ok: true, state: { status: "active", record } };
  },
};

type AccountPlan = {
  plan?: CoachPlan; planId?: string | null; planStatus?: "active" | "draft"; source?: "llm" | "rules";
};

function accountRepository(locale: string): PlanRepository {
  return {
    async load() {
      const [account, home] = await Promise.all([
        apiFetch<{ profile?: Profile | null; latestPlan?: { id: string; profile: Profile | null; plan: CoachPlan | null; source?: string | null } | null }>("/api/v1/me"),
        apiFetch<{ today?: { scheduledDate?: string; dayIndex?: number } | null }>("/api/v1/coach/home"),
      ]);
      if (!account.ok) return { status: "none" };
      const latest = account.data.latestPlan;
      if (!latest?.plan || !latest.profile) return { status: "none" };
      // The schedule's day 0 is `dayIndex` days before today's occurrence.
      const today = home.ok ? home.data.today : null;
      const startDate = today?.scheduledDate
        ? shift(today.scheduledDate, -Number(today.dayIndex || 0))
        : localDate(new Date());
      const record: PlanRecord = {
        id: latest.id, plan: latest.plan, profile: latest.profile,
        source: latest.source === "llm" ? "ai" : "rules",
        startDate, createdAt: new Date().toISOString(),
      };
      return { status: "active", record };
    },

    async generate(profile, startDate, timezone) {
      const response = await apiPost<AccountPlan>("/api/v1/plans", { profile, consent: true, startDate, timezone, locale },
        // Plan generation may call a model; the default client timeout is far
        // too short for that and would look like a failure the server did not have.
        { timeoutMs: 90_000 });
      if (!response.ok) return { ok: false, failure: response };
      const body = response.data;
      if (!body.plan) return { ok: false, failure: { ok: false, status: response.status, code: "AI_GENERATION_FAILED", kind: "server", retryable: true } };
      const record: PlanRecord = {
        id: body.planId || "", plan: body.plan, profile,
        source: body.source === "llm" ? "ai" : "rules",
        startDate, createdAt: new Date().toISOString(),
      };
      return { ok: true, state: body.planStatus === "draft" ? { status: "draft", record } : { status: "active", record } };
    },

    async accept(record) {
      const response = await apiPost<unknown>(`/api/v1/plans/${encodeURIComponent(record.id)}/activate`, {
        startDate: record.startDate,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      });
      return response.ok ? { ok: true, state: { status: "active", record } } : { ok: false, failure: response };
    },
  };
}

const shift = (start: string, days: number): string => {
  const value = new Date(`${start}T12:00:00`);
  value.setDate(value.getDate() + days);
  return localDate(value);
};

export const planRepository = (mode: "guest" | "account", locale: string): PlanRepository =>
  mode === "account" ? accountRepository(locale) : localRepository;
