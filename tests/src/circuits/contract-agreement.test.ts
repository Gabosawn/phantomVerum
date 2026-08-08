/**
 * Does `crypto.ts` agree with the contract's own `export pure circuit`s?
 *
 * This is the one file allowed to reach past the seam and touch the compiled contract directly:
 * its subject IS the agreement between the two implementations, so it cannot be written against
 * an abstraction over them. Everything else in `circuits/` goes through `backends()`.
 *
 * `crypto.ts` reimplements the four hashes independently rather than calling into the contract.
 * That is what makes this comparison worth running — it pins tag, arity and operand order for
 * all four, over random-ish inputs, on every `npm test`.
 *
 * Skipped when the contract has not been compiled.
 */

import { describe, expect, it } from "vitest";

import {
  anchorOf,
  bytesToHex,
  credCommitmentOf,
  hexToBytes,
  leafOf,
  nullifierOf,
  receiptOf,
  reportIdOf,
} from "../harness/crypto.js";
import { EPOCH_DURATION } from "../harness/contract-surface.js";
import {
  ACME,
  AUGUST,
  BASE_CREDENTIAL_COUNT,
  BETA,
  EMPLOYEE_A,
  EMPLOYEE_B,
  EMPLOYEE_BETA,
  EMPLOYER_NONCE,
  IMPOSTOR,
  OTHER_EVIDENCE,
  PROSECUTOR_NONCE,
  SEPTEMBER,
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

/**
 * Epoch indices spanning the `Uint<64>` domain, for the nullifier agreement checks. The
 * third operand of `nullifierOf` is the epoch index (a `bigint`), so it is exercised
 * separately from the two `Bytes<32>` operands.
 */
const PERIODS: readonly bigint[] = [0n, 1n, AUGUST, 2n ** 32n, 2n ** 64n - 1n];

describe.skipIf(!compiled)("crypto.ts agrees with the contract's pure circuits", () => {
  it("reproduces every pure circuit digest for digest", async () => {
    const { loadContract } = await import("../harness/simulator.js");
    const { pureCircuits } = await loadContract();
    const b = hexToBytes;

    for (const [x, y, z] of SAMPLES) {
      expect(leafOf(x, y)).toBe(bytesToHex(pureCircuits.leafOf(b(x), b(y))));
      expect(reportIdOf(x, y)).toBe(bytesToHex(pureCircuits.reportIdOf(b(x), b(y))));
      expect(receiptOf(y, z)).toBe(bytesToHex(pureCircuits.receiptOf(b(y), b(z))));
      expect(anchorOf(x)).toBe(bytesToHex(pureCircuits.anchorOf(b(x))));
      expect(credCommitmentOf(z)).toBe(
        bytesToHex(pureCircuits.credCommitmentOf(b(z))),
      );
      for (const period of PERIODS) {
        expect(nullifierOf(x, period)).toBe(
          bytesToHex(pureCircuits.nullifierOf(b(x), period)),
        );
      }
    }
  });

  it("is order-sensitive in the same way the contract is", async () => {
    const { loadContract } = await import("../harness/simulator.js");
    const { pureCircuits } = await loadContract();
    const b = hexToBytes;
    const [x, y, z] = SAMPLES[3]!;
    const period = PERIODS[0]!;

    // Swapping operands must move the contract's digest too. If the contract were insensitive to
    // order here, `crypto.ts` agreeing with it would be agreement on a broken construction.
    expect(bytesToHex(pureCircuits.leafOf(b(x), b(y)))).not.toBe(
      bytesToHex(pureCircuits.leafOf(b(y), b(x))),
    );
    expect(bytesToHex(pureCircuits.receiptOf(b(x), b(y)))).not.toBe(
      bytesToHex(pureCircuits.receiptOf(b(y), b(x))),
    );
    expect(bytesToHex(pureCircuits.nullifierOf(b(x), period))).not.toBe(
      bytesToHex(pureCircuits.nullifierOf(b(z), period)),
    );
  });
});

describe.runIf(!compiled)("contract agreement", () => {
  it.skip("skipped — contract not compiled (run `npm run compile:fast --workspace=contracts`)", () => {});
});

/**
 * The differential test proper: drive every backend through one identical scenario and require
 * the resulting public ledgers to be indistinguishable.
 *
 * The per-circuit suites assert expected values case by case, which catches a backend computing
 * the wrong thing. This catches something they cannot: a backend that quietly accumulates
 * different STATE — an extra nullifier, a missing report, an organization that survived a failed
 * assert. It is also what surfaced the one real divergence between the two implementations (see
 * the note on the Merkle root in `types.ts`).
 */
describe("both backends reach the same public ledger", () => {
  it("agrees on the full snapshot after a scenario that exercises every circuit", async () => {
    const found = await backends();

    const snapshots = found.map(({ fresh }) => {
      const h = baseScenario(fresh());

      h.as(EMPLOYEE_A).report(ACME, AUGUST);
      h.as(EMPLOYEE_B).report(ACME, AUGUST);
      h.as(EMPLOYEE_BETA).report(BETA, AUGUST);
      // C0 pins `period` to the current epoch — advance the clock into SEPTEMBER first.
      h.advanceTime(Number(EPOCH_DURATION));
      h.as(withEvidence(EMPLOYEE_A, OTHER_EVIDENCE)).report(ACME, SEPTEMBER);

      const reportA = reportIdOf(EMPLOYEE_A.evidenceHash, EMPLOYEE_A.personalSecret);
      // Two prosecutors, two nonces, two distinct receipts.
      h.as(EMPLOYEE_A).revealAuthorship(reportA);
      h.as({ ...EMPLOYEE_A, prosecutorNonce: EMPLOYER_NONCE }).revealAuthorship(reportA);

      // Rejected calls too: a backend that let one of these through would end up with extra
      // state even though the per-case tests only assert that it threw.
      expect(() => h.as(IMPOSTOR).report(ACME, AUGUST)).toThrow();
      expect(() => h.as(EMPLOYEE_A).report(ACME, AUGUST)).toThrow();
      expect(() => h.as(EMPLOYEE_B).revealAuthorship(reportA)).toThrow();
      expect(() => h.as(EMPLOYEE_A).registerOrganization(ACME, "ff".repeat(32))).toThrow();

      const l = h.ledger();
      return {
        backend: h.backend,
        organizations: [...l.organizations].sort(),
        credentialsCount: l.credentialsCount,
        reports: [...l.reports].sort(),
        nullifiers: [...l.nullifiers].sort(),
        authorships: [...l.authorships].sort(),
      };
    });

    // Sanity: the scenario has to actually produce state, or "they agree" is vacuous.
    const first = snapshots[0]!;
    expect(first.organizations).toHaveLength(2);
    expect(first.credentialsCount).toBe(BASE_CREDENTIAL_COUNT);
    expect(first.reports).toHaveLength(4);
    expect(first.nullifiers).toHaveLength(4);
    expect(first.authorships).toHaveLength(2);

    for (const other of snapshots.slice(1)) {
      expect({ ...other, backend: first.backend }).toEqual(first);
    }
  });
});
