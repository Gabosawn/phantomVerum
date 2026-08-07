/**
 * Hardening: idempotency guards (§2.6) and domain separation (§2.2).
 */

import { CompactTypeBytes, CompactTypeVector, persistentHash } from "@midnight-ntwrk/compact-runtime";
import { describe, expect, it } from "vitest";

import { ASSERTS, DOMAIN_TAGS } from "../harness/contract-surface.js";
import {
  autoriaDe,
  bytesToHex,
  credCommitmentDe,
  denunciaIdDe,
  fieldAsBytes32,
  hexToBytes,
  hojaDe,
  nullifierDe,
  pad32,
  padHex32,
} from "../harness/crypto.js";
import type { Hex32 } from "../harness/types.js";
import {
  ACME,
  AHORA_NEXT,
  EMPLOYEE_A,
  EPOCA,
  EPOCA_NEXT,
  FISCAL_PK,
  baseScenario,
} from "../harness/fixtures.js";
import { backends } from "../harness/index.js";

const BACKENDS = await backends();

describe.each(BACKENDS)("[$name] hardening — idempotency guards (§2.6)", ({ fresh }) => {
  it("rejects resubmitting identical evidence, which Set.insert would otherwise swallow", () => {
    const h = baseScenario(fresh());
    h.as(EMPLOYEE_A).denunciar(ACME, EPOCA);

    // Different epoch clears the nullifier guard; same evidence ⇒ same denunciaId.
    h.at(AHORA_NEXT);
    expect(() => h.as(EMPLOYEE_A).denunciar(ACME, EPOCA_NEXT)).toThrow(ASSERTS.reportAlreadyExists);

    const l = h.ledger();
    expect(l.denuncias.size).toBe(1);
    expect(l.nullifiers.size).toBe(1);
  });

  it("rejects an exact replay in the same period", () => {
    const h = baseScenario(fresh());
    h.as(EMPLOYEE_A).denunciar(ACME, EPOCA);

    expect(() => h.as(EMPLOYEE_A).denunciar(ACME, EPOCA)).toThrow(
      ASSERTS.alreadyReportedThisPeriod,
    );

    expect(h.ledger().denuncias.size).toBe(1);
  });
});

describe("hardening — domain separation (§2.2)", () => {
  const secret = EMPLOYEE_A.secretPersonal;
  const cred = EMPLOYEE_A.credencialSecret;

  it("makes the nullifier/autoria cross-collision impossible", () => {
    const denunciaId = denunciaIdDe(EMPLOYEE_A.evidenciaHash, secret);
    const collidingOrgId = denunciaId;
    // Craft a periodo whose LE field encoding matches fiscalPk's first bytes isn't needed:
    // different domain tags already force distinct digests for same-arity Vector<4>.
    const nullifier = nullifierDe(secret, collidingOrgId, EPOCA);
    const autoria = autoriaDe(secret, denunciaId, FISCAL_PK);
    expect(nullifier).not.toBe(autoria);
  });

  it("separates the two same-arity hash pairs", () => {
    const a = cred;
    const b = secret;
    const commitment = credCommitmentDe(b);

    expect(hojaDe(a, commitment)).not.toBe(denunciaIdDe(a, b));
    expect(nullifierDe(a, b, EPOCA)).not.toBe(autoriaDe(a, b, b));
  });

  it("binds each hash to its own domain tag", () => {
    const a = cred;
    const b = secret;
    const c = EMPLOYEE_A.evidenciaHash;
    const commitment = credCommitmentDe(b);

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

    expect(credCommitmentDe(a)).toBe(h2(DOMAIN_TAGS.credcomm, a));
    expect(hojaDe(a, commitment)).toBe(h3(DOMAIN_TAGS.cred, a, commitment));
    expect(denunciaIdDe(a, b)).toBe(h3(DOMAIN_TAGS.denuncia, a, b));
    expect(nullifierDe(a, b, EPOCA)).toBe(
      h4(DOMAIN_TAGS.nullifier, a, b, fieldAsBytes32(EPOCA)),
    );
    expect(autoriaDe(a, b, c)).toBe(
      h4(DOMAIN_TAGS.autoria, a, b, hexToBytes(c)),
    );
  });

  it("matches the frozen golden vectors", () => {
    const x = "11".repeat(32);
    const y = "12".repeat(32);
    const z = "13".repeat(32);

    expect(credCommitmentDe(x)).toBe(
      "fd976a6d5c82d97f5a696cd716bddba40846febae0d03b9a9f108c5baf7f34a3",
    );
    expect(hojaDe(x, y)).toBe("a246fcb648fd138d700afb4034786de3de5788daf8a35616db6d92eaecee1632");
    expect(denunciaIdDe(x, y)).toBe(
      "679f959d4cbc524964ac5ba83a02b8e204771f405caa06a4643b99abf3d8bebd",
    );
    expect(nullifierDe(x, y, 1n)).toBe(
      "bada02b4cd1c8c6d7649b0ac7e7e06df35c8c21d6206edacc22e4a0b5df8186a",
    );
    expect(autoriaDe(x, y, z)).toBe(
      "d4f865312b25d27723c3765360f3116146e7296f211e1a369eaf028fe3d4a653",
    );
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
    expect(nullifierDe(secret, ACME, EPOCA)).not.toBe(nullifierDe(secret, ACME, EPOCA_NEXT));
  });
});
