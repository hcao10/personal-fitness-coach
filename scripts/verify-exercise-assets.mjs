// Fails the build when any plannable exercise references media that is not
// actually shipped in public/exercises — broken demo images are a product
// honesty bug, not a cosmetic one.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sources = [
  join(root, "packages", "coach-core", "src", "exercise-pool.ts"),
  join(root, "packages", "coach-core", "src", "index.ts"),
];

const assets = new Set();
for (const source of sources) {
  const text = readFileSync(source, "utf8");
  for (const match of text.matchAll(/"asset":\s*"([^"]+)"|asset:\s*"([^"]+)"/g)) {
    assets.add(match[1] || match[2]);
  }
}

const missing = [];
for (const asset of assets) {
  for (const extension of ["jpg", "gif"]) {
    if (!existsSync(join(root, "public", "exercises", `${asset}.${extension}`))) missing.push(`${asset}.${extension}`);
  }
}

if (missing.length) {
  console.error(`Missing exercise media in public/exercises (${missing.length}):`);
  for (const file of missing) console.error(`  ${file}`);
  process.exit(1);
}
console.log(`exercise assets verified: ${assets.size} exercises, all media present`);
