"use client";

/**
 * Browser storage that cannot throw.
 *
 * `localStorage` is not always there — private windows, blocked site data, a
 * quota that is already full — and every one of those throws on access rather
 * than returning null. Guest mode is the product's first-value path, so a
 * throwing read here would be a blank page for exactly the users who have not
 * signed in.
 */

export function readJson<T>(key: string, storage: "local" | "session" = "local"): T | null {
  try {
    const store = storage === "local" ? window.localStorage : window.sessionStorage;
    const raw = store.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

/** Returns false when the value could not be persisted, so callers can say so. */
export function writeJson(key: string, value: unknown, storage: "local" | "session" = "local"): boolean {
  try {
    const store = storage === "local" ? window.localStorage : window.sessionStorage;
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string, storage: "local" | "session" = "local"): void {
  try {
    const store = storage === "local" ? window.localStorage : window.sessionStorage;
    store.removeItem(key);
  } catch { /* nothing to clean up if the store is unreachable */ }
}
