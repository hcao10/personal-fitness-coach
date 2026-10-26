// One-shot codemod: lifts the inline `lang === "zh" ? "…" : "…"` ternaries in
// app/coach-app.tsx into the shared catalog and rewrites the call sites to
// t("home.<key>").
//
// Done mechanically rather than by hand because transcribing 118 bilingual
// string pairs is exactly the kind of work that introduces silent copy errors.
// Keys are slugged from the English text so they stay readable; collisions get
// a numeric suffix. Strings are moved byte-for-byte — the rendered product is
// unchanged, only the indirection is new.
//
// Run once: node scripts/extract-home-copy.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "app", "coach-app.tsx");
let code = readFileSync(source, "utf8");

const slug = (english) => {
  const words = english.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean).slice(0, 4);
  if (!words.length) return "text";
  return words[0] + words.slice(1).map((word) => word[0].toUpperCase() + word.slice(1)).join("");
};

const pattern = /lang === "zh" \? "((?:[^"\\]|\\.)*)" : "((?:[^"\\]|\\.)*)"/g;
const entries = new Map();
const used = new Map();

// BCP-47 tags are locale data, not user-facing copy: they belong in
// LOCALE_META, and the one occurrence sits in a module-scope helper where the
// component's `t` is not in scope anyway.
const isLocaleTag = (value) => /^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(value);

code = code.replace(pattern, (match, zh, en) => {
  if (isLocaleTag(zh) && isLocaleTag(en)) return match;
  const existing = [...entries.entries()].find(([, value]) => value.zh === zh && value.en === en);
  if (existing) return `t("home.${existing[0]}")`;
  let key = slug(en);
  const seen = used.get(key) || 0;
  used.set(key, seen + 1);
  if (seen > 0) key = `${key}${seen + 1}`;
  entries.set(key, { zh, en });
  return `t("home.${key}")`;
});

const render = (locale) => {
  const lines = [...entries.entries()]
    .map(([key, value]) => `  ${/^[a-z][a-zA-Z0-9]*$/.test(key) ? key : JSON.stringify(key)}: ${JSON.stringify(value[locale])},`)
    .join("\n");
  return `// AUTO-EXTRACTED from app/coach-app.tsx by scripts/extract-home-copy.mjs.\n`
    + `// Safe to edit by hand from here on — the extraction is a one-time migration.\n`
    + `export const home${locale === "zh" ? "Zh" : "En"} = {\n${lines}\n} as const;\n`;
};

writeFileSync(join(root, "packages", "i18n", "src", "messages", "home.zh.ts"), render("zh"));
writeFileSync(join(root, "packages", "i18n", "src", "messages", "home.en.ts"), render("en"));
writeFileSync(source, code);
console.log(`extracted ${entries.size} unique message pairs from ${source}`);
