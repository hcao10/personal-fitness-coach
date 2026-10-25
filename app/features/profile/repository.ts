"use client";

import { apiFetch, apiPost, type ApiFailure } from "../../shared/api/client";
import { readJson, removeKey, writeJson } from "../../shared/storage";
import {
  draftFromProfile, emptyDraft, mergeDrafts, toProfile,
  type ProfileDraft,
} from "../../../packages/product-state/src";
import type { Locale } from "../../../packages/i18n/src";
import type { Profile } from "../../lib/coach";

/**
 * One profile, two places it can live.
 *
 * The domain shape is identical in both: a `ProfileDraft` in, a `ProfileDraft`
 * out. Only where it is stored differs, which is what makes "start anonymous,
 * sign in later, lose nothing" a merge rather than a migration.
 */

export const DRAFT_KEY = "cmine_fit_profile_draft_v1";
/** The homepage's old session-storage draft, read once so it is not lost. */
const LEGACY_INTAKE_KEY = "cmine_fit_intake_draft";

type StoredDraft = { draft: ProfileDraft; updatedAt: string };

export type SaveResult = { ok: true } | { ok: false; failure: ApiFailure | null };

export interface ProfileRepository {
  load(): Promise<{ draft: ProfileDraft; saved: boolean; imported: boolean }>;
  save(draft: ProfileDraft): Promise<SaveResult>;
}

export function readLocalDraft(): ProfileDraft | null {
  const stored = readJson<StoredDraft>(DRAFT_KEY);
  if (stored?.draft) return { ...emptyDraft(), ...stored.draft };
  // A homepage draft written before this key existed was a full `Profile`, not
  // a draft. Convert it once rather than asking those users to start over.
  const legacy = readJson<Profile>(LEGACY_INTAKE_KEY, "session");
  if (!legacy) return null;
  const converted = draftFromProfile({ ...legacy, limitations: legacy.limitations || "" });
  // The legacy draft was pre-filled with defaults, so it cannot testify that
  // the user accepted anything.
  return { ...converted, safetyAcknowledged: false };
}

export const writeLocalDraft = (draft: ProfileDraft): boolean =>
  writeJson(DRAFT_KEY, { draft, updatedAt: new Date().toISOString() } satisfies StoredDraft);

export function clearLocalDraft(): void {
  removeKey(DRAFT_KEY);
  removeKey(LEGACY_INTAKE_KEY, "session");
}

const localRepository: ProfileRepository = {
  async load() {
    const draft = readLocalDraft();
    return { draft: draft ?? emptyDraft(), saved: Boolean(draft && toProfile(draft)), imported: false };
  },
  async save(draft) {
    return writeLocalDraft(draft) ? { ok: true } : { ok: false, failure: null };
  },
};

type OnboardingSnapshot = { step?: number; draft?: Partial<ProfileDraft> };

/**
 * The account repository merges rather than replaces.
 *
 * A user who filled the homepage form on this device and then signed in must
 * see their own answers, not a stale server draft — and must not be asked
 * anything twice. `mergeDrafts` encodes that rule; this supplies both sides and
 * reports whether an import actually happened, so the UI can say so.
 */
function accountRepository(locale: Locale): ProfileRepository {
  return {
    async load() {
      const local = readLocalDraft();
      const [account, onboarding] = await Promise.all([
        apiFetch<{ profile?: Profile | null }>("/api/v1/me"),
        apiFetch<OnboardingSnapshot>("/api/v1/onboarding"),
      ]);
      const storedProfile = account.ok && account.data.profile ? draftFromProfile(account.data.profile) : null;
      const storedDraft = onboarding.ok ? onboarding.data.draft ?? null : null;
      const remote = mergeDrafts(storedDraft, storedProfile);
      const draft = mergeDrafts(remote, local);
      const imported = Boolean(local) && JSON.stringify(draft) !== JSON.stringify(remote);
      return { draft, saved: Boolean(storedProfile), imported };
    },

    async save(draft) {
      const profile = toProfile(draft);
      if (!profile) {
        // A draft that is not yet a profile still deserves to survive a reload.
        const stored = await apiPost<unknown>("/api/v1/onboarding", { step: 0, data: draft });
        return stored.ok ? { ok: true } : { ok: false, failure: stored };
      }
      const completed = await apiPost<unknown>("/api/v1/onboarding/complete", {
        profile, consent: draft.safetyAcknowledged, locale,
      });
      if (!completed.ok) return { ok: false, failure: completed };
      // The local copy has served its purpose once the account holds it.
      clearLocalDraft();
      return { ok: true };
    },
  };
}

export const profileRepository = (mode: "guest" | "account", locale: Locale): ProfileRepository =>
  mode === "account" ? accountRepository(locale) : localRepository;
