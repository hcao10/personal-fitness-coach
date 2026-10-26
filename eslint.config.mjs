import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".wrangler/**",
    ".playwright-cli/**",
    "output/playwright/**",
  ]),
  {
    // Expo reads app.config.js as CommonJS, so require() is the contract here.
    files: ["apps/mobile/app.config.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // React Native components are not DOM elements: jsx-a11y's HTML rules do
    // not apply to them (RN uses accessibilityLabel, which these files set).
    files: ["apps/mobile/**/*.tsx"],
    rules: { "jsx-a11y/alt-text": "off" },
  },
]);

export default eslintConfig;
