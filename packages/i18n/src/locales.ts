// Locale registry shared by the web app, the Cloudflare Worker and the Expo
// app. Plain TypeScript with no runtime dependency, imported by relative path
// the same way coach-core and sync-core are — a web-only i18n library could not
// serve all three runtimes, and every one of them replaces the compile-time
// completeness guarantee below with a runtime "missing key" fallback.

// Every locale that COMPILES. A locale can only be listed here once it has a
// complete message catalog, because each catalog is typed `satisfies Messages`
// against the Chinese one. Being here does not mean it may be shown to users.
export const LOCALES = ["zh", "en"] as const;
export type Locale = (typeof LOCALES)[number];

// Every locale that MAY BE SHOWN. A locale moves from LOCALES to here only
// after the launch gate passes (safety and legal copy human-reviewed, screenshot
// pass, glossary applied). Keeping the two lists separate is what stops a
// half-translated language from reaching the picker — the failure this product
// already shipped once, when the switcher offered nine languages and seven of
// them silently rendered English.
export const SHIPPABLE_LOCALES: readonly Locale[] = ["zh", "en"];

export type LocaleMeta = {
  /** BCP-47 tag for <html lang>, Intl and Accept-Language. */
  tag: string;
  /** Endonym — a language is listed in its own language, never translated. */
  nativeLabel: string;
  englishLabel: string;
  dir: "ltr" | "rtl";
};

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  zh: { tag: "zh-CN", nativeLabel: "简体中文", englishLabel: "Simplified Chinese", dir: "ltr" },
  en: { tag: "en-US", nativeLabel: "English", englishLabel: "English", dir: "ltr" },
};

export const DEFAULT_LOCALE: Locale = "zh";

export const isLocale = (value: unknown): value is Locale =>
  typeof value === "string" && (LOCALES as readonly string[]).includes(value);

export const isShippableLocale = (value: unknown): value is Locale =>
  isLocale(value) && SHIPPABLE_LOCALES.includes(value);

/**
 * A value that exists in every locale. Replaces the closed `{ zh, en }` literals
 * that were written out in thirty-odd places across coach-core, the adaptive
 * engine and the habit engine — with this, widening `Locale` is one edit rather
 * than thirty, and the compiler finds every catalog that has not caught up.
 */
export type Localized<T = string> = Record<Locale, T>;

/** A value that may be missing in some locales (e.g. dataset content). */
export type LocalizedPartial<T = string> = Partial<Record<Locale, T>>;

/**
 * Reads a localized value, falling back explicitly rather than silently.
 * Returns null when nothing is available so callers must decide what an honest
 * empty state looks like instead of rendering an accidental blank.
 */
export function pick<T>(value: LocalizedPartial<T> | undefined | null, locale: Locale, fallback: Locale = DEFAULT_LOCALE): T | null {
  if (!value) return null;
  return value[locale] ?? value[fallback] ?? Object.values(value)[0] ?? null;
}

/**
 * Negotiates a locale from an Accept-Language header. Quality values are
 * honored; unknown languages are ignored rather than approximated.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const ranked = header.split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const quality = params.map((param) => param.trim()).find((param) => param.startsWith("q="));
      return { tag: tag.trim().toLowerCase(), q: quality ? Number(quality.slice(2)) || 0 : 1 };
    })
    .filter((entry) => entry.tag && entry.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of ranked) {
    const base = tag.split("-")[0];
    const match = SHIPPABLE_LOCALES.find((locale) => locale === tag || locale === base);
    if (match) return match;
  }
  return null;
}
