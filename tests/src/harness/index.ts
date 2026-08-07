/**
 * Backend discovery.
 *
 *   - `model`    always available. Spec implementation over the real hash + real Merkle tree.
 *   - `contract` available once the contract has been compiled, i.e. once someone has run
 *                `npm run compile --workspace=contracts` (or `compile:fast` for a quick loop —
 *                the simulator needs no proving keys).
 *
 * Tests call `backends()` and `describe.each` over the result, so the same cases run against
 * whatever is available. With both present, any divergence is a real bug in one of the two.
 *
 * The contract is loaded with a dynamic `import` on purpose: a static one would make `tsc`
 * demand `contracts/output/` at build time, which is exactly the coupling this avoids.
 */

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ModelHarness } from "./model.js";
import type { BackendName, TestigoHarness } from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));

/** `tests/src/harness` → repo root. Also correct from `tests/dist/harness`. */
const REPO_ROOT = resolve(HERE, "../../..");

/**
 * The compiled artifact. Note `.js`, not `.cjs`: compactc 0.31.1 emits ESM, and
 * `contracts/package.json` declares `"type": "module"` so Node reads it as such.
 */
export const COMPILED_CONTRACT = resolve(REPO_ROOT, "contracts/output/contract/index.js");

export const RELATIVE_CONTRACT = COMPILED_CONTRACT.replace(`${REPO_ROOT}/`, "");

export interface Backend {
  readonly name: BackendName;
  /** A fresh, empty harness. Every test gets its own — no shared state between cases. */
  readonly fresh: () => TestigoHarness;
}

export const contractIsCompiled = (): boolean => existsSync(COMPILED_CONTRACT);

/**
 * The backends to run against. Async because the contract is imported dynamically; call it
 * once at module top level (`const BACKENDS = await backends()`).
 */
export async function backends(): Promise<Backend[]> {
  const found: Backend[] = [{ name: "model", fresh: () => new ModelHarness() }];

  if (contractIsCompiled()) {
    const { SimulatorHarness, loadContract } = await import("./simulator.js");
    const module = await loadContract();
    found.push({ name: "contract", fresh: () => new SimulatorHarness(module) });
  }

  return found;
}

/** One line telling the reader which backends actually ran. */
export function backendBanner(found: readonly Backend[]): string {
  const names = found.map((b) => b.name).join(", ");
  if (found.length > 1) {
    return `backends: ${names} — differential run, both must agree`;
  }
  return (
    `backends: ${names} — contract backend OFF (no ${RELATIVE_CONTRACT}; ` +
    "run `npm run compile:fast --workspace=contracts`)"
  );
}

export { ModelHarness } from "./model.js";
export * from "./crypto.js";
export * from "./fixtures.js";
export * from "./types.js";
export * from "./contract-surface.js";
