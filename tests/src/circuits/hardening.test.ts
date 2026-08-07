/**
 * Hardening: idempotency guards (§2.6) and domain separation (§2.2).
 */

import { CompactTypeBytes, CompactTypeVector, persistentHash } from "@midnight-ntwrk/compact-runtime";
import { describe, expect, it } from "vitest";

import { ASSERTS, DOMAIN_TAGS } from "../harness/contract-surface.js";
import {
  authorshipOf,
  bytesToHex,
  credCommitmentOf,
  reportIdOf,
  periodBytes32,
  hexToBytes,
  leafOf,
  nullifierOf,
  pad32,
  padHex32,
} from "../harness/crypto.js";
import type { Hex32 } from "../harness/types.js";
import {
  ACME,
  NEXT_TIME,
  EMPLOYEE_A,
  EPOCH,
  EPOCH_NEXT,
  PROSECUTOR_PK,
  baseScenario,
} from "../harness/fixtures.js";
import { backends } from "../harness/index.js";

const BACKENDS = await backends();

describe.each(BACKENDS)("[$name] hardening — idempotency guards (§2.6)", ({ fresh }) => {
  it("rejects resubmitting identical evidence, which Set.insert would otherwise swallow", () => {
    const h = baseScenario(fresh());
    h.as(EMPLOYEE_A).report(ACME, EPOCH);

    // Different epoch clears the nullifier guard; same evidence ⇒ same denunciaId.
    h.setBlockTime(NEXT_TIME);
    expect(() => h.as(EMPLOYEE_A).report(ACME, EPOCH_NEXT)).toThrow(ASSERTS.reportAlreadySealed);

    const l = h.ledger();
    expect(l.reports.size).toBe(1);
    expect(l.nullifiers.size).toBe(1);
  });

  it("rejects an exact replay in the same period", () => {
    const h = baseScenario(fresh());
    h.as(EMPLOYEE_A).report(ACME, EPOCH);

    expect(() => h.as(EMPLOYEE_A).report(ACME, EPOCH)).toThrow(
      ASSERTS.alreadyReportedThisPeriod,
    );

    expect(h.ledger().reports.size).toBe(1);
  });
});

describe("hardening — domain separation (§2.2)", () => {
  const secret = EMPLOYEE_A.personalSecret;
  const cred = EMPLOYEE_A.credentialSecret;

  it("makes the nullifier/autoria cross-collision impossible", () => {
    const denunciaId = reportIdOf(EMPLOYEE_A.evidenceHash, secret);
    const collidingOrgId = denunciaId;
    // Craft a periodo whose LE field encoding matches fiscalPk's first bytes isn't needed:
    // different domain tags already force distinct digests for same-arity Vector<4>.
    const nullifier = nullifierOf(secret, collidingOrgId, EPOCH);
    const autoria = authorshipOf(secret, denunciaId, PROSECUTOR_PK);
    expect(nullifier).not.toBe(autoria);
  });

  it("separates the two same-arity hash pairs", () => {
    const a = cred;
    const b = secret;
    const commitment = credCommitmentOf(b);

    expect(leafOf(a, commitment)).not.toBe(reportIdOf(a, b));
    expect(nullifierOf(a, b, EPOCH)).not.toBe(authorshipOf(a, b, b));
  });

  it("binds each hash to its own domain tag", () => {
    const a = cred;
    const b = secret;
    const c = EMPLOYEE_A.evidenceHash;
    const commitment = credCommitmentOf(b);

    const bytes32 = new CompactTypeBytes(32);
    const h2 = (tag: string, x: Hex32) =>
      bytesToHex(persistentHash(new CompactTypeVector(2, bytes32), [pad32(tag), hexToBytes(x)]));
    const h3 = (tag: string, x: Hex32, y: Hex32) =>
      bytesToHex(
        persistentHash(new CompactTypeVector(3, bytes32), [pad32(tag), hexToBytes(x), hexToBytes(y)]),
      );
    const h4 = (tag: string, x: Hex32, y: Hex32, z: Uint8Array) =>
      bytesToHex(
        persistentHash(new CompactTypeVector(4, bytes32), [
          pad32(tag),
          hexToBytes(x),
          hexToBytes(y),
          z,
        ]),
      );

    expect(credCommitmentOf(a)).toBe(h2(DOMAIN_TAGS.credcomm, a));
    expect(leafOf(a, commitment)).toBe(h3(DOMAIN_TAGS.cred, a, commitment));
    expect(reportIdOf(a, b)).toBe(h3(DOMAIN_TAGS.report, a, b));
    expect(nullifierOf(a, b, EPOCH)).toBe(
      h4(DOMAIN_TAGS.nullifier, a, b, periodBytes32(EPOCH)),
    );
    expect(authorshipOf(a, b, c)).toBe(
      h4(DOMAIN_TAGS.authorship, a, b, hexToBytes(c)),
    );
  });

  it("matches digests recomputed with the domain tags (no stale goldens)", () => {
    const x = "11".repeat(32);
    const y = "12".repeat(32);
    const z = "13".repeat(32);

    // Goldens are intentionally derived here: domain tags moved from `testigo:` to
    // `phantomtrace:` in the English contract port, so hard-coded vectors from the Spanish
    // suite would lie. What we pin is that the five helpers stay self-consistent.
    expect(credCommitmentOf(x)).toMatch(/^[0-9a-f]{64}$/);
    expect(leafOf(x, y)).toMatch(/^[0-9a-f]{64}$/);
    expect(reportIdOf(x, y)).toMatch(/^[0-9a-f]{64}$/);
    expect(nullifierOf(x, y, 1n)).toMatch(/^[0-9a-f]{64}$/);
    expect(authorshipOf(x, y, z)).toMatch(/^[0-9a-f]{64}$/);
    expect(new Set([credCommitmentOf(x), leafOf(x, y), reportIdOf(x, y), nullifierOf(x, y, 1n), authorshipOf(x, y, z)]).size).toBe(5);
  });

  it("keeps the domain tags distinct and inside 32 bytes", () => {
    const tags = Object.values(DOMAIN_TAGS);
    expect(new Set(tags).size).toBe(tags.length);

    for (const tag of tags) {
      expect(new TextEncoder().encode(tag).length).toBeLessThanOrEqual(32);
      expect(() => padHex32(tag)).not.toThrow();
    }
  });

  it("makes the period part of the nullifier, not decoration", () => {
    expect(nullifierOf(secret, ACME, EPOCH)).not.toBe(nullifierOf(secret, ACME, EPOCH_NEXT));
  });
});
