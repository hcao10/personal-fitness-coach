// One-shot migration: folds the legacy `copy` table from app/lib/i18n.ts into
// the shared home namespace and rewrites `t.key` call sites to `t("home.key")`,
// so the page uses one translation system instead of two.
//
// Run once: node scripts/merge-legacy-copy.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const legacyPath = join(root, "app", "lib", "i18n.ts");
const legacy = readFileSync(legacyPath, "utf8");

// Pull the zh and en blocks out of the `copy` object literal.
const block = (locale) => {
  const start = legacy.indexOf(`  ${locale}: {`);
  if (start === -1) throw new Error(`missing ${locale} block`);
  const end = legacy.indexOf("\n  },", start);
  return legacy.slice(start, end);
};
const parse = (text) => {
  const out = new Map();
  for (const match of text.matchAll(/(\w+):\s*"((?:[^"\\]|\\.)*)"/g)) out.set(match[1], match[2]);
  return out;
};
const legacyZh = parse(block("zh"));
const legacyEn = parse(block("en"));
if (legacyZh.size !== legacyEn.size) throw new Error(`key count mismatch: zh ${legacyZh.size}, en ${legacyEn.size}`);

const catalogPath = (locale) => join(root, "packages", "i18n", "src", "messages", `home.${locale}.ts`);
const existingKeys = new Set([...readFileSync(catalogPath("zh"), "utf8").matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]));

const collisions = [...legacyZh.keys()].filter((key) => existingKeys.has(key));
if (collisions.length) throw new Error(`key collisions with extracted copy: ${collisions.join(", ")}`);

for (const [locale, table] of [["zh", legacyZh], ["en", legacyEn]]) {
  const path = catalogPath(locale);
  const lines = [...table.entries()].map(([key, value]) => `  ${key}: ${JSON.stringify(value)},`).join("\n");
  const text = readFileSync(path, "utf8").replace(/\n\} as const;\s*$/, `\n${lines}\n} as const;\n`);
  writeFileSync(path, text);
}

// Rewrite the page: `t.foo` -> `t("home.foo")`, and swap the copy-table lookup
// for the shared translator.
const pagePath = join(root, "app", "coach-app.tsx");
let page = readFileSync(pagePath, "utf8");
let rewritten = 0;
page = page.replace(/\bt\.(\w+)\b/g, (match, key) => {
  if (!legacyZh.has(key)) return match;
  rewritten += 1;
  return `t("home.${key}")`;
});
page = page.replace(
  'import { copy, languageOptions, type DisplayLanguage, type Locale } from "./lib/i18n";',
  'import { languageOptions, type DisplayLanguage, type Locale } from "./lib/i18n";\nimport { translator } from "../packages/i18n/src";',
);
page = page.replace("  const t = copy[lang];", "  const t = translator(locale);");
writeFileSync(pagePath, page);

console.log(`merged ${legacyZh.size} legacy keys; rewrote ${rewritten} call sites`);
