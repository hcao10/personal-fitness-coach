"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_LOCALE, translator, type Locale } from "../../packages/i18n/src";
import { persistLocale } from "./locale-client";

/**
 * Puts the current locale and its translator in context.
 *
 * The homepage used to hold the locale in its own `useState`, which is why the
 * language switcher only worked there: every other page had no way to learn the
 * choice, and nested components like the product shell had no way to receive it
 * short of threading a prop through every layer.
 *
 * The value is seeded from the server-resolved locale, so the first byte already
 * carries the right language — a client-side correction would leave screen
 * readers announcing the wrong one for the initial render.
 */
type LocaleContextValue = {
  locale: Locale;
  t: ReturnType<typeof translator>;
  setLocale: (next: Locale) => Promise<void>;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ locale: initialLocale, children }: { locale: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback(async (next: Locale) => {
    // State first so the switch is immediate; persistence is what makes it
    // survive a reload and reach the parts of the product that run without a
    // browser (LLM replies, push, the weekly letter).
    setLocaleState(next);
    await persistLocale(next);
  }, []);

  const value = useMemo(() => ({ locale, t: translator(locale), setLocale }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

function useLocaleContext(): LocaleContextValue {
  const value = useContext(LocaleContext);
  // Falling back to the default here would turn a missing provider into
  // silently-Chinese UI, which is the failure this whole effort exists to end.
  if (!value) throw new Error("useLocale/useT used outside LocaleProvider — wrap the tree in app/layout.tsx");
  return value;
}

export function useLocale() {
  return useLocaleContext();
}

/** The translator for the current locale. `const t = useT()`, then `t("today.title")`. */
export function useT() {
  return useLocaleContext().t;
}

/**
 * The current locale behind a stable ref.
 *
 * For mount-only effects that need the locale in a branch which may fire much
 * later — a 401 redirect, say. Putting `locale` in the dependency array would
 * re-run the whole effect every time the reader switches language, which for an
 * auth check means a redundant request and possibly a second redirect; leaving
 * it out captures a value that can go stale. A ref is neither: the effect runs
 * once and still reads the language the reader has right now.
 */
export function useLocaleRef() {
  const { locale } = useLocaleContext();
  const ref = useRef(locale);
  useEffect(() => { ref.current = locale; }, [locale]);
  return ref;
}

export { DEFAULT_LOCALE };
