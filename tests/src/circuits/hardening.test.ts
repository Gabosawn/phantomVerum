/**
 * The two extra cases §4 of 03-plan-ejecucion.md adds on top of the README table:
 *
 *   1. An identical report resubmission fails      → the idempotency guards of §2.6
 *   2. A nullifier/autoria collision is impossible → the domain separation of §2.2
 *
 * Both exist because a judge who asks about them should get an answer backed by a test, not
 * by an assurance.
 */

import { CompactTypeBytes, CompactTypeVector, persistentHash } from "@midnight-ntwrk/compact-runtime";
import { describe, expect, it } from "vitest";

import { ASSERTS, DOMAIN_TAGS } from "../harness/contract-surface.js";
import {
  autoriaDe,
  bytesToHex,
  denunciaIdDe,
  hexToBytes,
  hojaDe,
  nullifierDe,
  pad32,
  padHex32,
} from "../harness/crypto.js";
import type { Hex32 } from "../harness/types.js";
import {
  ACME,
  AUGUST,
  AUGUST_HEX,
  EMPLOYEE_A,
  FISCAL_PK,
  SEPTEMBER,
  baseScenario,
} from "../harness/fixtures.js";
import { backends } from "../harness/index.js";

const BACKENDS = await backends();

describe.each(BACKENDS)("[$name] hardening — idempotency guards (§2.6)", ({ fresh }) => {
  it("rejects resubmitting identical evidence, which Set.insert would otherwise swallow", () => {
    const h = baseScenario(fresh());
    h.as(EMPLOYEE_A).denunciar(ACME, AUGUST);

    // A different period clears the nullifier guard, isolating the denuncia guard: same
    // evidence + same secret ⇒ the same denunciaId. `Set.insert` is idempotent, so WITHOUT
    // `assert(!denuncias.member(id))` this call would succeed silently and the reporter would
    // believe a second report had been sealed when the ledger never changed.
    expect(() => h.as(EMPLOYEE_A).denunciar(ACME, SEPTEMBER)).toThrow(ASSERTS.reportAlreadyExists);

    const l = h.ledger();
    expect(l.denuncias.size).toBe(1);
    expect(l.nullifiers.size).toBe(1);
  });

  it("rejects an exact replay in the same period", () => {
    const h = baseScenario(fresh());
    h.as(EMPLOYEE_A).denunciar(ACME, AUGUST);

    // Same everything: the nullifier guard is the first to fire.
    expect(() => h.as(EMPLOYEE_A).denunciar(ACME, AUGUST)).toThrow(
      ASSERTS.alreadyReportedThisPeriod,
    );

    expect(h.ledger().denuncias.size).toBe(1);
  });
});

describe("hardening — domain separation (§2.2)", () => {
  const secret = EMPLOYEE_A.secretPersonal;

  it("makes the nullifier/autoria cross-collision impossible", () => {
    // The attack §2.2 describes, reproduced exactly.
    //
    // `nullifier` and `autoria` share their shape — H(secret, X, Y) — with the same secret in
    // position 0. An attacker registers an organization whose `orgId` equals a victim's
    // `denunciaId`, then picks `periodo` equal to the prosecutor's key. Without domain tags
    // both hashes are literally the same bytes, so burning a nullifier would forge an
    // authorship record (or vice versa).
    const denunciaId = denunciaIdDe(EMPLOYEE_A.evidenciaHash, secret);
    const collidingOrgId = denunciaId;
    const collidingPeriodo = FISCAL_PK;

    const nullifier = nullifierDe(secret, collidingOrgId, collidingPeriodo);
    const autoria = autoriaDe(secret, denunciaId, FISCAL_PK);

    // Identical arguments in identical positions, yet different digests — only the position-0
    // domain tag separates them.
    expect(nullifier).not.toBe(autoria);
  });

  it("separates the two same-arity hash pairs", () => {
    const a = EMPLOYEE_A.credencialSecret;
    const b = secret;

    // Comparing across arities proves nothing: a Vector<3> digest differs from a Vector<4>
    // digest whatever the tags are. Only same-arity pairs isolate the tag.
    expect(hojaDe(a, b)).not.toBe(denunciaIdDe(a, b)); // both Vector<3>
    expect(nullifierDe(a, b, b)).not.toBe(autoriaDe(a, b, b)); // both Vector<4>
  });

  it("binds each hash to its own domain tag", () => {
    // The same-arity checks above cannot catch a tag swapped ACROSS arities — e.g. the
    // nullifier reusing `testigo:denuncia:v1`. Mutation testing found exactly that gap. So
    // recompute each digest here from its expected tag and require an exact match: any
    // function reaching for the wrong tag now diverges.
    const a = EMPLOYEE_A.credencialSecret;
    const b = secret;
    const c = EMPLOYEE_A.evidenciaHash;

    const bytes32 = new CompactTypeBytes(32);
    const h3 = (tag: string, x: Hex32, y: Hex32) =>
      bytesToHex(
        persistentHash(new CompactTypeVector(3, bytes32), [pad32(tag), hexToBytes(x), hexToBytes(y)]),
      );
    const h4 = (tag: string, x: Hex32, y: Hex32, z: Hex32) =>
      bytesToHex(
        persistentHash(new CompactTypeVector(4, bytes32), [
          pad32(tag),
          hexToBytes(x),
          hexToBytes(y),
          hexToBytes(z),
        ]),
      );

    expect(hojaDe(a, b)).toBe(h3(DOMAIN_TAGS.hoja, a, b));
    expect(denunciaIdDe(a, b)).toBe(h3(DOMAIN_TAGS.denuncia, a, b));
    expect(nullifierDe(a, b, c)).toBe(h4(DOMAIN_TAGS.nullifier, a, b, c));
    expect(autoriaDe(a, b, c)).toBe(h4(DOMAIN_TAGS.autoria, a, b, c));
  });

  it("matches the frozen golden vectors", () => {
    // Locks tag, arity AND operand order at once. These are also the values Block A's
    // exported pure circuits must reproduce — if the `contract` backend disagrees with any of
    // them, the contract and this model have drifted apart.
    const x = "11".repeat(32);
    const y = "12".repeat(32);
    const z = "13".repeat(32);

    expect(hojaDe(x, y)).toBe("26c7c1fe64cff2308811f5aad922c7bca69ea1c37e8b8a03c7c013ebc06f6fe3");
    expect(denunciaIdDe(x, y)).toBe("679f959d4cbc524964ac5ba83a02b8e204771f405caa06a4643b99abf3d8bebd");
    expect(nullifierDe(x, y, z)).toBe("2e618dd8ec3c6ad3c9f095dc4c1440286e10ec14fd85847146cb353ba2e9235a");
    expect(autoriaDe(x, y, z)).toBe("d4f865312b25d27723c3765360f3116146e7296f211e1a369eaf028fe3d4a653");
  });

  it("keeps the four domain tags distinct and inside 32 bytes", () => {
    const tags = Object.values(DOMAIN_TAGS);
    expect(new Set(tags).size).toBe(tags.length);

    // `pad(32, ...)` throws above 32 bytes; a tag that does not fit would not compile.
    for (const tag of tags) {
      expect(new TextEncoder().encode(tag).length).toBeLessThanOrEqual(32);
      expect(() => padHex32(tag)).not.toThrow();
    }
  });

  it("makes the period part of the nullifier, not decoration", () => {
    // If `periodo` did not reach the digest, every period would share one nullifier and the
    // "different period passes" case would be a false positive.
    expect(nullifierDe(secret, ACME, AUGUST_HEX)).not.toBe(
      nullifierDe(secret, ACME, padHex32("2026-09")),
    );
  });
});
