import { defineConfig } from "@playwright/test";

/**
 * Real browser-profile upgrade chain (v0.2 integration QA). Not part of
 * `npm run test:e2e`: each phase runs against a different production build
 * that `run-chain.sh` serves on port 3000, in one persistent Chromium
 * profile. See docs/v0.2-integration-qa.md.
 */
export default defineConfig({
  testDir: ".",
  testMatch: "chain.spec.ts",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  timeout: 300_000,
  use: { baseURL: "http://localhost:3000" },
});
