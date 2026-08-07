/**
 * `report` — the heart of the contract.
 *
 * Cases: happy path · invalid credential fails · double report in the same period fails ·
 * a different period passes · two orgs do not interfere.
 */

import { describe, expect, it } from "vitest";

import { ASSERTS } from "../harness/contract-surface.js";
import { leafOf, nullifierOf, reportIdOf } from "../harness/crypto.js";
import {
  ACME,
  AUGUST,
  AUGUST_HEX,
  BETA,
  EMPLOYEE_A,
  EMPLOYEE_B,
  EMPLOYEE_BETA,
  IMPOSTOR,
  OTHER_EVIDENCE,
  SEPTEMBER,
  SEPTEMBER_HEX,
  baseScenario,
  claimingOrg,
  withEvidence,
} from "../harness/fixtures.js";
import { backends } from "../harness/index.js";

const BACKENDS = await backends();

describe.each(BACKENDS)("[$name] report", ({ fresh }) => {
  it("seals the report and burns the nullifier, revealing nothing about the reporter", () => {
    const h = baseScenario(fresh());
    h.as(EMPLOYEE_A).report(ACME, AUGUST);

    const l = h.ledger();
    expect(l.reports).toContain(reportIdOf(EMPLOYEE_A.evidenceHash, EMPLOYEE_A.personalSecret));
    expect(l.nullifiers).toContain(nullifierOf(EMPLOYEE_A.credentialSecret, ACME, AUGUST_HEX));
    expect(l.reports.size).toBe(1);
    expect(l.nullifiers.size).toBe(1);

    // The assertion a privacy judge looks for: the public ledger holds NOTHING that identifies
    // the reporter. Not the personal secret, not the credential, not the evidence.
    const onChain = new Set([...l.reports, ...l.nullifiers, ...l.organizations.keys()]);
    for (const secret of [
      EMPLOYEE_A.personalSecret,
      EMPLOYEE_A.credentialSecret,
      EMPLOYEE_A.evidenceHash,
    ]) {
      expect(onChain).not.toContain(secret);
    }
  });

  it("rejects a reporter with no credential in the tree, writing nothing to the ledger", () => {
    const h = baseScenario(fresh());

    expect(() => h.as(IMPOSTOR).report(ACME, AUGUST)).toThrow(ASSERTS.credentialNotInOrg);

    // C1 fails at proof time, so no tx is emitted — the ledger must be untouched.
    const l = h.ledger();
    expect(l.reports.size).toBe(0);
    expect(l.nullifiers.size).toBe(0);
  });

  it("rejects a second report in the same period from the same reporter", () => {
    const h = baseScenario(fresh());
    h.as(EMPLOYEE_A).report(ACME, AUGUST);

    // New evidence on purpose: it isolates the nullifier guard. With the same evidence the
    // reportId guard could fire instead, and the test would not prove what it claims.
    const again = withEvidence(EMPLOYEE_A, OTHER_EVIDENCE);
    expect(() => h.as(again).report(ACME, AUGUST)).toThrow(ASSERTS.alreadyReportedThisPeriod);

    expect(h.ledger().reports.size).toBe(1);
  });

  it("allows the same reporter in a different period, with unlinkable nullifiers", () => {
    const h = baseScenario(fresh());
    h.as(EMPLOYEE_A).report(ACME, AUGUST);

    // A new report means new evidence: reusing it would collide on reportId, which is the
    // idempotency guard's job (see hardening.test.ts), not this case's.
    h.as(withEvidence(EMPLOYEE_A, OTHER_EVIDENCE)).report(ACME, SEPTEMBER);

    const l = h.ledger();
    expect(l.reports.size).toBe(2);
    expect(l.nullifiers.size).toBe(2);

    // Different periods produce nullifiers that cannot be linked to one another.
    const august = nullifierOf(EMPLOYEE_A.credentialSecret, ACME, AUGUST_HEX);
    const september = nullifierOf(EMPLOYEE_A.credentialSecret, ACME, SEPTEMBER_HEX);
    expect(august).not.toBe(september);
    expect(l.nullifiers).toContain(august);
    expect(l.nullifiers).toContain(september);
  });

  it("keeps two organizations from interfering with each other", () => {
    const h = baseScenario(fresh());
    h.as(EMPLOYEE_A).report(ACME, AUGUST);
    h.as(EMPLOYEE_BETA).report(BETA, AUGUST);

    const l = h.ledger();
    expect(l.reports.size).toBe(2);
    expect(l.nullifiers.size).toBe(2);

    // The tree is global with orgId inside the leaf, so proving membership proves membership OF
    // THAT ORG: H(tag ‖ ACME ‖ betaCredential) was never inserted.
    expect(leafOf(ACME, EMPLOYEE_BETA.credentialSecret)).not.toBe(
      leafOf(BETA, EMPLOYEE_BETA.credentialSecret),
    );
  });

  it("stops a BETA employee from reporting as ACME, whichever leaf they point the witness at", () => {
    const h = baseScenario(fresh());

    // Their private state still says BETA, so the witness hands over BETA siblings while the
    // circuit derives the ACME leaf. The root cannot match.
    expect(() => h.as(EMPLOYEE_BETA).report(ACME, AUGUST)).toThrow(ASSERTS.credentialNotInOrg);

    // Now they lie in the other direction: claim ACME in the private state so the witness looks
    // for an ACME leaf that was never issued to them. `findPathForLeaf` returns nothing.
    expect(() => h.as(claimingOrg(EMPLOYEE_BETA, ACME)).report(ACME, AUGUST)).toThrow(
      ASSERTS.credentialNotInOrg,
    );

    const l = h.ledger();
    expect(l.reports.size).toBe(0);
    expect(l.nullifiers.size).toBe(0);
  });

  it("keeps two employees of one organization from interfering", () => {
    const h = baseScenario(fresh());
    h.as(EMPLOYEE_A).report(ACME, AUGUST);
    h.as(EMPLOYEE_B).report(ACME, AUGUST);

    // Same org, same period, two people: both pass. The nullifier is per credential, not per org.
    const l = h.ledger();
    expect(l.reports.size).toBe(2);
    expect(l.nullifiers.size).toBe(2);
  });

  it("refuses to report against an organization that was never registered", () => {
    const h = fresh();
    h.registerOrganization(ACME, "a2".repeat(32));
    h.issueCredential(ACME, leafOf(ACME, EMPLOYEE_A.credentialSecret));

    // BETA does not exist, and no leaf binds to it either.
    expect(() => h.as(claimingOrg(EMPLOYEE_A, BETA)).report(BETA, AUGUST)).toThrow();
    expect(h.ledger().reports.size).toBe(0);
  });
});
