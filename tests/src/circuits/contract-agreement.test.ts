/**
 * Does `crypto.ts` agree with the contract's own `export pure circuit`s?
 *
 * This is the one file allowed to reach past the seam and touch the compiled contract directly:
 * its subject IS the agreement between the two implementations, so it cannot be written against
 * an abstraction over them. Everything else in `circuits/` goes through `backends()`.
 *
 * Skipped when the contract has not been compiled.
 */

import { describe, expect, it } from "vitest";

import {
  authorshipOf,
  bytesToHex,
  credCommitmentOf,
  hexToBytes,
  leafOf,
  nullifierOf,
  reportIdOf,
} from "../harness/crypto.js";
import {
  ACME,
  BETA,
  EMPLOYEE_A,
  EMPLOYEE_B,
  EMPLOYEE_BETA,
  EMPLOYER_PK,
  EPOCH,
  EPOCH_NEXT,
  IMPOSTOR,
  NEXT_TIME,
  OTHER_EVIDENCE,
  PROSECUTOR_PK,
  baseScenario,
  withEvidence,
} from "../harness/fixtures.js";
import { backends, contractIsCompiled } from "../harness/index.js";
import type { Hex32 } from "../harness/types.js";

const compiled = contractIsCompiled();

/** A spread of inputs: all-zero, all-one, patterned, and asymmetric. */
const SAMPLES: readonly [Hex32, Hex32, Hex32][] = [
  ["00".repeat(32), "00".repeat(32), "00".repeat(32)],
  ["ff".repeat(32), "ff".repeat(32), "ff".repeat(32)],
  ["11".repeat(32), "12".repeat(32), "13".repeat(32)],
  ["a1".repeat(32), "0f".repeat(32), "de".repeat(32)],
  ["0123456789abcdef".repeat(4), "fedcba9876543210".repeat(4), "5a".repeat(32)],
];

const PERIODS = [0n, 1n, EPOCH, EPOCH_NEXT] as const;

describe.skipIf(!compiled)("crypto.ts agrees with the contract's pure circuits", () => {
  it("reproduces pure circuits digest for digest", async () => {
    const { loadContract } = await import("../harness/simulator.js");
    const { pureCircuits } = await loadContract();
    const b = hexToBytes;

    for (const [x, y, z] of SAMPLES) {
      expect(credCommitmentOf(x)).toBe(bytesToHex(pureCircuits.credCommitmentOf(b(x))));
      expect(leafOf(x, y)).toBe(bytesToHex(pureCircuits.leafOf(b(x), b(y))));
      expect(reportIdOf(x, y)).toBe(bytesToHex(pureCircuits.reportIdOf(b(x), b(y))));
      expect(authorshipOf(x, y, z)).toBe(
        bytesToHex(pureCircuits.authorshipOf(b(x), b(y), b(z))),
      );
      for (const period of PERIODS) {
        expect(nullifierOf(x, y, period)).toBe(
          bytesToHex(pureCircuits.nullifierOf(b(x), b(y), period)),
        );
      }
    }
  });

  it("is order-sensitive in the same way the contract is", async () => {
    const { loadContract } = await import("../harness/simulator.js");
    const { pureCircuits } = await loadContract();
    const b = hexToBytes;
    const [x, y] = SAMPLES[3]!;

    expect(bytesToHex(pureCircuits.leafOf(b(x), b(y)))).not.toBe(
      bytesToHex(pureCircuits.leafOf(b(y), b(x))),
    );
    expect(bytesToHex(pureCircuits.nullifierOf(b(x), b(y), 1n))).not.toBe(
      bytesToHex(pureCircuits.nullifierOf(b(y), b(x), 1n)),
    );
  });
});

describe.runIf(!compiled)("contract agreement", () => {
  it.skip("skipped — contract not compiled (run `npm run compile --workspace=contracts`)", () => {});
});

/**
 * The differential test proper: drive every backend through one identical scenario and require
 * the resulting public ledgers to be indistinguishable.
 */
describe("both backends reach the same public ledger", () => {
  it("agrees on the full snapshot after a scenario that exercises every circuit", async () => {
    const found = await backends();

    const snapshots = found.map(({ fresh }) => {
      const h = baseScenario(fresh());

      h.as(EMPLOYEE_A).report(ACME, EPOCH);
      h.as(EMPLOYEE_B).report(ACME, EPOCH);
      h.as(EMPLOYEE_BETA).report(BETA, EPOCH);
      h.setBlockTime(NEXT_TIME);
      h.as(withEvidence(EMPLOYEE_A, OTHER_EVIDENCE)).report(ACME, EPOCH_NEXT);

      const reportA = reportIdOf(EMPLOYEE_A.evidenceHash, EMPLOYEE_A.personalSecret);
      h.as(EMPLOYEE_A).revealAuthorship(reportA, PROSECUTOR_PK);
      h.as(EMPLOYEE_A).revealAuthorship(reportA, EMPLOYER_PK);

      expect(() => h.as(IMPOSTOR).report(ACME, EPOCH_NEXT)).toThrow();
      expect(() => h.as(EMPLOYEE_A).report(ACME, EPOCH_NEXT)).toThrow();
      expect(() => h.as(EMPLOYEE_B).revealAuthorship(reportA, PROSECUTOR_PK)).toThrow();
      expect(() => h.registerOrganization(ACME, "ff".repeat(32))).toThrow();

      const l = h.ledger();
      return {
        backend: h.backend,
        organizations: [...l.organizations.entries()].map(([k, v]) => `${k}:${v}`).sort(),
        credentialsCount: l.credentialsCount,
        reports: [...l.reports].sort(),
        nullifiers: [...l.nullifiers].sort(),
        authorships: [...l.authorships].sort(),
      };
    });

    const first = snapshots[0]!;
    expect(first.organizations).toHaveLength(2);
    expect(first.credentialsCount).toBe(3);
    expect(first.reports).toHaveLength(4);
    expect(first.nullifiers).toHaveLength(4);
    expect(first.authorships).toHaveLength(2);

    for (const other of snapshots.slice(1)) {
      expect({ ...other, backend: first.backend }).toEqual(first);
    }
  });
});
