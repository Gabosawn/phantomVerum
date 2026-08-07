/**
 * Backend discovery.
 *
 *   - `model`    always available.
 *   - `contract` available once `contracts/output/contract/index.js` exists.
 */

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ModelHarness } from "./model.js";
import type { BackendName, TestigoHarness } from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));

/** `tests/src/harness` → repo root. Also correct from `tests/dist/harness`. */
const REPO_ROOT = resolve(HERE, "../../..");

export const COMPILED_CONTRACT = resolve(REPO_ROOT, "contracts/output/contract/index.js");

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
    const { SimulatorHarness, loadGeneratedModule } = await import("./simulator.js");
    const mod = await loadGeneratedModule(COMPILED_CONTRACT);
    found.push({ name: "contract", fresh: () => new SimulatorHarness(mod) });
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
    `backends: ${names} — contract backend OFF ` +
    `(no ${COMPILED_CONTRACT.replace(`${REPO_ROOT}/`, "")}; run \`npm run compile --workspace=contracts\`)`
  );
}

export { ModelHarness } from "./model.js";
export * from "./crypto.js";
export * from "./fixtures.js";
export * from "./types.js";
export * from "./contract-surface.js";
