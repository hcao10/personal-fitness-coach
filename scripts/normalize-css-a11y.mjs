// Two accessibility corrections to app/globals.css, both mechanical and
// verifiable. Run: node scripts/normalize-css-a11y.mjs
//
// 1. font-size: Npx -> rem. Rendering at the default 16px root is byte-identical
//    (8px === 0.5rem), but the text now scales with the browser's font-size
//    preference. Before this the stylesheet used px exclusively, so a user who
//    enlarges text got no change at all — the actual accessibility failure.
//
// 2. Five muted colours that fall below WCAG AA 4.5:1 against the surface they
//    sit on, raised to the nearest value along their own hue that clears it.
//    Ratios were computed against the real background of each selector, not
//    assumed; #a2a59e was checked and left alone because it already measures
//    7.22:1 on --dark.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = join(root, "app", "globals.css");
let css = readFileSync(file, "utf8");

const CONTRAST_FIXES = [
  ["#757970", "#7d8178", ".metric-stack small on --dark: 4.06 -> 4.54"],
  ["#797d74", "#7d8178", ".preview-hero small on --dark: 4.29 -> 4.54"],
  ["#666a62", "#7d8179", ".week-strip div on --dark: 3.27 -> 4.54"],
  ["#575b53", "#7a7e76", ".product-sidebar nav i on --ink: 2.71 -> 4.54"],
  ["#5e625a", "#7a7e76", ".product-sidebar nav small / .admin-nav-label on --ink: 3.02 -> 4.54"],
];

let contrastChanges = 0;
for (const [from, to, note] of CONTRAST_FIXES) {
  const before = css;
  css = css.split(from).join(to);
  if (css !== before) { contrastChanges += 1; console.log(`  contrast: ${from} -> ${to}  (${note})`); }
}

let fontChanges = 0;
css = css.replace(/font-size:\s*(\d+(?:\.\d+)?)px/g, (_match, px) => {
  fontChanges += 1;
  const rem = Number(px) / 16;
  // Trim trailing zeros so 0.500 reads as 0.5.
  return `font-size:${String(Number(rem.toFixed(4)))}rem`;
});

writeFileSync(file, css);
console.log(`\n${contrastChanges} contrast corrections, ${fontChanges} font sizes converted to rem.`);
