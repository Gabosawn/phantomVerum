/**
 * Backend discovery. This is what makes Block D independent of Block A's schedule.
 *
 *   - `model`    always available. Spec implementation over the real hash + real Merkle tree.
 *   - `contract` available once `contracts/output/contract/index.cjs` exists, i.e. once
 *                someone has run `npm run compile --workspace=contracts`.
 *
 * Tests call `backends()` and `describe.each` over the result, so the same 13 cases run
 * against whatever is available. When both are present, any divergence between them is a real
 * bug in one of the two — that is the point of the seam.
 *
 * The contract module is loaded with a dynamic `import` on purpose: a static one would make
 * `tsc` demand `contracts/output/` at build time, which is exactly the coupling we are
 * avoiding.
 */

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ModelHarness } from "./model.js";
import type { BackendName, TestigoHarness } from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));

/** `tests/src/harness` → repo root. Also correct from `tests/dist/harness`. */
const REPO_ROOT = resolve(HERE, "../../..");

export const COMPILED_CONTRACT = resolve(REPO_ROOT, "contracts/output/contract/index.cjs");

export interface Backend {
  readonly name: BackendName;
  /** A fresh, empty harness. Every test gets its own — no shared state between cases. */
  readonly fresh: () => TestigoHarness;
}

export const contractIsCompiled = (): boolean => existsSync(COMPILED_CONTRACT);

/**
 * The backends to run the suite against. Async because the compiled contract is imported
 * dynamically; call it once at module top level (`const BACKENDS = await backends()`).
 */
export async function backends(): Promise<Backend[]> {
  const found: Backend[] = [{ name: "model", fresh: () => new ModelHarness() }];

  if (contractIsCompiled()) {
    const { SimulatorHarness } = await import("./simulator.js");
    found.push({ name: "contract", fresh: () => new SimulatorHarness() });
  }

  return found;
}

/** One line telling the reader which backends actually ran. Printed by the suite and by e2e. */
export function backendBanner(found: readonly Backend[]): string {
  const names = found.map((b) => b.name).join(", ");
  if (found.length > 1) {
    return `backends: ${names} — differential run, both must agree`;
  }
  return (
    `backends: ${names} — contract backend OFF ` +
    `(no ${COMPILED_CONTRACT.replace(`${REPO_ROOT}/`, "")}; run \`npm run compile --workspace=contracts\`)`
  );
}

export { ModelHarness } from "./model.js";
export * from "./crypto.js";
export * from "./fixtures.js";
export * from "./types.js";
export * from "./contract-surface.js";
