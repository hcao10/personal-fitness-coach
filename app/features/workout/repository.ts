"use client";

import { apiFetch, apiPost, type ApiFailure } from "../../shared/api/client";
import { readJson, writeJson } from "../../shared/storage";
import { RPE_FOR_DIFFICULTY, type WorkoutFeedback, type WorkoutSet } from "../../../packages/product-state/src";

/**
 * One session log, two places it can live.
 *
 * `WorkoutSet` and `WorkoutFeedback` are the same objects on both sides; only
 * the write target differs. The guest side is a real log — it survives a reload
 * and drives the same deterministic next step — not a UI-only illusion that
 * disappears when the tab closes.
 */

const SESSION_KEY = "cmine_fit_sessions_v1";

type StoredSession = { sets: WorkoutSet[]; feedback: WorkoutFeedback | null; completedAt: string | null };
type StoredSessions = Record<string, StoredSession>;

/** One key per plan-day, so two different days never overwrite each other. */
export const sessionKey = (planId: string, dayIndex: number, scheduledDate: string): string =>
  `${planId}#${dayIndex}#${scheduledDate}`;

export type WorkoutSnapshot = { sets: WorkoutSet[]; feedback: WorkoutFeedback | null };

export interface WorkoutRepository {
  load(key: string, planId: string, dayIndex: number, occurrenceId: string | null): Promise<WorkoutSnapshot>;
  saveSet(key: string, planId: string, dayIndex: number, occurrenceId: string | null, set: WorkoutSet): Promise<{ ok: true } | { ok: false; failure: ApiFailure | null }>;
  complete(key: string, planId: string, dayIndex: number, occurrenceId: string | null, feedback: WorkoutFeedback): Promise<{ ok: true } | { ok: false; failure: ApiFailure | null }>;
}

const readAll = (): StoredSessions => readJson<StoredSessions>(SESSION_KEY) || {};

const upsertLocal = (key: string, patch: (current: StoredSession) => StoredSession): boolean => {
  const all = readAll();
  const current = all[key] || { sets: [], feedback: null, completedAt: null };
  all[key] = patch(current);
  return writeJson(SESSION_KEY, all);
};

export const readLocalSession = (key: string): WorkoutSnapshot => {
  const stored = readAll()[key];
  return { sets: stored?.sets || [], feedback: stored?.feedback || null };
};

const localRepository: WorkoutRepository = {
  async load(key) { return readLocalSession(key); },

  async saveSet(key, _planId, _dayIndex, _occurrenceId, set) {
    const ok = upsertLocal(key, (current) => ({
      ...current,
      sets: [...current.sets.filter((item) => !(item.exerciseId === set.exerciseId && item.setIndex === set.setIndex)), set],
    }));
    return ok ? { ok: true } : { ok: false, failure: null };
  },

  async complete(key, _planId, _dayIndex, _occurrenceId, feedback) {
    const ok = upsertLocal(key, (current) => ({ ...current, feedback, completedAt: new Date().toISOString() }));
    return ok ? { ok: true } : { ok: false, failure: null };
  },
};

type ServerSet = WorkoutSet & { id?: string };

function accountRepository(): WorkoutRepository {
  return {
    async load(_key, planId, dayIndex, occurrenceId) {
      const query = occurrenceId ? `&occurrenceId=${encodeURIComponent(occurrenceId)}` : "";
      const response = await apiFetch<{ sets?: ServerSet[] }>(`/api/v1/workouts/${encodeURIComponent(planId)}/sets?dayIndex=${dayIndex}${query}`);
      // Feedback is not read back per session: the server records it as a
      // completion, and the page derives its state from the sets plus whatever
      // was submitted in this visit.
      return { sets: response.ok ? response.data.sets || [] : [], feedback: null };
    },

    async saveSet(key, planId, dayIndex, occurrenceId, set) {
      const response = await apiPost<unknown>(`/api/v1/workouts/${encodeURIComponent(planId)}/sets`, {
        ...set, occurrenceId, dayIndex,
        clientMutationId: `${occurrenceId || key}:${set.exerciseId}:${set.setIndex}`,
      });
      return response.ok ? { ok: true } : { ok: false, failure: response };
    },

    async complete(_key, planId, dayIndex, occurrenceId, feedback) {
      const response = await apiPost<unknown>(`/api/v1/workouts/${encodeURIComponent(planId)}/complete`, {
        occurrenceId, dayIndex,
        durationMinutes: feedback.durationMinutes ?? 30,
        // The server stores RPE; the user was asked a question they can answer.
        rpe: RPE_FOR_DIFFICULTY[feedback.difficulty],
        pain: feedback.pain,
        notes: (feedback.note || "").slice(0, 300),
      });
      return response.ok ? { ok: true } : { ok: false, failure: response };
    },
  };
}

export const workoutRepository = (mode: "guest" | "account"): WorkoutRepository =>
  mode === "account" ? accountRepository() : localRepository;
