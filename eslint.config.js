// ESLint: the shared @buildproveship/config rules plus this repo's local settings, each with its reason.
import { releaseready } from "@buildproveship/config/eslint";
import { defineConfig } from "eslint/config";

export default defineConfig(
  releaseready({
    tsconfigRootDir: import.meta.dirname,
    // Three programs: src + smoke tests (built to dist/), the type-stripped performance harness, and the k6
    // scripts. Only tsconfig.json is discoverable by the project service, so they are listed explicitly.
    project: [
      "./tsconfig.json",
      "./tsconfig.performance.json",
      "./tsconfig.k6.json",
    ],
  }),
  // src/generated/ is OpenAPI Generator output, rewritten by npm run generate and never edited by hand.
  { ignores: [".tools/", ".performance-results/", "src/generated/"] },
  {
    // k6 runs these scripts in its own runtime, which provides these globals instead of Node's.
    files: ["performance/workload.js", "performance/limits.js"],
    languageOptions: {
      globals: {
        __ENV: "readonly",
        __VU: "readonly",
        __ITER: "readonly",
        open: "readonly",
      },
    },
  },
  {
    files: ["**/*.ts"],
    rules: {
      // `||` on strings deliberately treats an empty value (an unset env var) as missing.
      "@typescript-eslint/prefer-nullish-coalescing": [
        "error",
        { ignorePrimitives: { string: true } },
      ],
    },
  },
);
