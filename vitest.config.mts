import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Canonical project root with an upper-case drive letter.
 *
 * On Windows, `npm test` and `npx vitest` hand Vite roots that differ only in
 * drive-letter case (`c:/...` vs `C:/...`). Module IDs are case-sensitive keys
 * in the mock registry, so under the lower-case root `vi.mock()` silently fails
 * to intercept — tests then run against the REAL client and hit the live
 * Squarespace API instead of failing loudly. Pinning the root keeps mocking
 * deterministic no matter how the suite is invoked.
 */
const projectRoot = dirname(fileURLToPath(import.meta.url)).replace(
  /^([a-z]):/,
  (_, drive: string) => `${drive.toUpperCase()}:`,
);

export default defineConfig({
  root: projectRoot,
  test: {
    include: ["tests/**/*.test.ts"],
    // WORKAROUND: on Node 26 + Vitest 4.1.10 the default `forks` pool (and
    // `threads`) fail to bind the test runner inside the worker — every test
    // file dies with "Vitest failed to find the current suite" before a single
    // test runs. `vmThreads` bootstraps differently and works. Revisit once
    // Vitest supports Node 26, or run the suite on a Node LTS release, then
    // drop this line to get back on the default pool.
    pool: "vmThreads",
  },
});
