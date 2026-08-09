import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import { DEFAULT_LOCALE, isShippableLocale, localeFromAcceptLanguage, translator, type Locale } from "../../../packages/i18n/src";
import { api } from "./api";

/**
 * Locale for the Expo app, resolved and persisted the same way the web does.
 *
 * The device language is read through Intl rather than expo-localization: Hermes
 * ships a full ICU, `resolvedOptions().locale` already reflects the system
 * setting, and a dependency that has to be installed before the app builds is a
 * real cost for one string.
 */
const STORAGE_KEY = "cmine_locale";

/** The device's language, as a locale this product can actually serve. */
export function deviceLocale(): Locale {
  try {
    const tag = new Intl.DateTimeFormat().resolvedOptions().locale;
    // Reuses the web's negotiation so "zh-Hans-CN" and "en-GB" resolve the same
    // way in both clients instead of by two slightly different rules.
    return localeFromAcceptLanguage(tag) ?? DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export async function storedLocale(): Promise<Locale | null> {
  const value = await SecureStore.getItemAsync(STORAGE_KEY).catch(() => null);
  return isShippableLocale(value) ? value : null;
}

/**
 * Persists in two places for two different reasons: on the device so the next
 * cold start opens in the right language before any network call, and on the
 * account so LLM replies, push notifications and the weekly coach letter follow
 * the same choice — those run with no device present.
 */
export async function persistLocale(locale: Locale): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEY, locale).catch(() => undefined);
  await api("/api/v1/me/locale", { method: "PUT", body: JSON.stringify({ locale }) }).catch(() => undefined);
}

type LocaleContextValue = {
  locale: Locale;
  t: ReturnType<typeof translator>;
  setLocale: (next: Locale) => Promise<void>;
  /** False until the stored choice has been read; the first frame uses the device language. */
  ready: boolean;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  // Seeded from the device rather than from the default, so a first-run English
  // user never sees a frame of Chinese while storage is read.
  const [locale, setLocaleState] = useState<Locale>(deviceLocale);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void storedLocale().then((stored) => {
      if (cancelled) return;
      if (stored) setLocaleState(stored);
      setReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  const setLocale = useCallback(async (next: Locale) => {
    setLocaleState(next);
    await persistLocale(next);
  }, []);

  const value = useMemo(() => ({ locale, t: translator(locale), setLocale, ready }), [locale, setLocale, ready]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

function useLocaleContext(): LocaleContextValue {
  const value = useContext(LocaleContext);
  // Throwing beats defaulting: a silent fallback renders Chinese to everyone,
  // which is the failure this work exists to end.
  if (!value) throw new Error("useLocale/useT used outside LocaleProvider — wrap the tree in app/_layout.tsx");
  return value;
}

export const useLocale = () => useLocaleContext();
export const useT = () => useLocaleContext().t;
