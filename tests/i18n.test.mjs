import assert from "node:assert/strict";
import test from "node:test";
import { LOCALES, SHIPPABLE_LOCALES, LOCALE_META, MESSAGES, translator, errorMessage, format, placeholders, plural, pick, localeFromAcceptLanguage } from "../packages/i18n/src/index.ts";

// The type system already guarantees identical key sets (each catalog is
// `satisfies Messages`). These tests cover what types cannot express: that the
// text is actually translated, that interpolation agrees across locales, and
// that a locale cannot reach the picker before it is complete.

const flatten = (object, prefix = "") =>
  Object.entries(object).flatMap(([key, value]) =>
    typeof value === "string" ? [[`${prefix}${key}`, value]] : flatten(value, `${prefix}${key}.`));

test("every shippable locale is a compiled locale", () => {
  for (const locale of SHIPPABLE_LOCALES) assert.ok(LOCALES.includes(locale), `${locale} is shippable but not compiled`);
});

test("every locale has metadata and a catalog", () => {
  for (const locale of LOCALES) {
    assert.ok(LOCALE_META[locale]?.tag, `${locale} has no BCP-47 tag`);
    assert.ok(MESSAGES[locale], `${locale} has no catalog`);
  }
});

test("locales share exactly the same keys", () => {
  const reference = flatten(MESSAGES.zh).map(([key]) => key).sort();
  for (const locale of LOCALES) {
    assert.deepEqual(flatten(MESSAGES[locale]).map(([key]) => key).sort(), reference, `${locale} key set differs`);
  }
});

test("no message is empty and no placeholder set drifts between locales", () => {
  const reference = new Map(flatten(MESSAGES.zh));
  for (const locale of LOCALES) {
    for (const [key, value] of flatten(MESSAGES[locale])) {
      assert.ok(value.trim().length > 0, `${locale}.${key} is empty`);
      assert.deepEqual(placeholders(value), placeholders(reference.get(key)), `${locale}.${key} placeholder set differs`);
    }
  }
});

test("non-Chinese locales are actually translated, not passthrough", () => {
  const zhEntries = new Map(flatten(MESSAGES.zh));
  for (const locale of LOCALES.filter((value) => value !== "zh")) {
    // Some keys legitimately match across locales (units, brand names). A large
    // overlap, however, means an untranslated catalog was shipped.
    const identical = flatten(MESSAGES[locale]).filter(([key, value]) => value === zhEntries.get(key));
    assert.ok(identical.length < 8, `${locale} repeats ${identical.length} Chinese values verbatim: ${identical.slice(0, 5).map(([key]) => key).join(", ")}`);
  }
});

test("the Chinese catalog carries no untranslated English sentences", () => {
  // Guards the reverse mistake: an English string left behind in the zh
  // catalog. Short Latin values (units, "kcal", design labels) are fine; a long
  // all-ASCII sentence in the Chinese catalog is a missed translation.
  const suspicious = flatten(MESSAGES.zh)
    .filter(([key, value]) => /^[\x20-\x7E]+$/.test(value) && value.length > 12 && !key.startsWith("error."));
  assert.deepEqual(suspicious.map(([key]) => key), [], "English text found in the Chinese catalog");
});

test("translator resolves keys and interpolates", () => {
  const t = translator("en");
  assert.equal(t("nav.today"), "Today");
  assert.match(t("home.previewNote", { goal: "fat loss" }), /fat loss/);
  assert.equal(translator("zh")("nav.today"), "今日");
});

test("format leaves unknown placeholders visible instead of blanking them", () => {
  assert.equal(format("hello {name}", { name: "world" }), "hello world");
  assert.equal(format("hello {missing}", {}), "hello {missing}");
});

test("plural uses the locale's own categories", () => {
  assert.equal(plural("en", 1, { one: "{count} day", other: "{count} days" }), "1 day");
  assert.equal(plural("en", 3, { one: "{count} day", other: "{count} days" }), "3 days");
  // Chinese has a single category; the `other` form must still be produced.
  assert.equal(plural("zh", 3, { other: "{count} 天" }), "3 天");
});

test("error codes resolve per locale and unknown codes return null", () => {
  assert.equal(errorMessage("AUTH_REQUIRED", "en"), "Please sign in with Cmine ID first.");
  assert.match(errorMessage("AUTH_REQUIRED", "zh"), /Cmine ID/);
  assert.equal(errorMessage("NOT_A_REAL_CODE", "en"), null);
});

test("pick falls back explicitly and reports nothing rather than blank", () => {
  assert.equal(pick({ zh: "中文", en: "English" }, "en"), "English");
  assert.equal(pick({ zh: "中文" }, "en"), "中文");
  assert.equal(pick(null, "en"), null);
});

test("Accept-Language negotiation honors quality and ignores unshippable languages", () => {
  assert.equal(localeFromAcceptLanguage("en-GB,en;q=0.9"), "en");
  assert.equal(localeFromAcceptLanguage("zh-CN,zh;q=0.9,en;q=0.8"), "zh");
  assert.equal(localeFromAcceptLanguage("en;q=0.4,zh;q=0.9"), "zh");
  assert.equal(localeFromAcceptLanguage("ko-KR,ko;q=0.9"), null);
  assert.equal(localeFromAcceptLanguage(null), null);
});
