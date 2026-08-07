/**
 * `report` — the heart of the contract.
 */

import { describe, expect, it } from "vitest";

import { ASSERTS } from "../harness/contract-surface.js";
import { reportIdOf, nullifierOf } from "../harness/crypto.js";
import {
  ACME,
  NEXT_TIME,
  BETA,
  EMPLOYEE_A,
  EMPLOYEE_B,
  EMPLOYEE_BETA,
  EPOCH,
  EPOCH_NEXT,
  IMPOSTOR,
  OTHER_EVIDENCE,
  baseScenario,
  leafFor,
  withEvidence,
} from "../harness/fixtures.js";
import { backends } from "../harness/index.js";

const BACKENDS = await backends();

describe.each(BACKENDS)("[$name] report", ({ fresh }) => {
  it("seals the report and burns the nullifier, revealing nothing about the reporter", () => {
    const h = baseScenario(fresh());
    h.as(EMPLOYEE_A).report(ACME, EPOCH);

    const l = h.ledger();
    expect(l.reports).toContain(reportIdOf(EMPLOYEE_A.evidenceHash, EMPLOYEE_A.personalSecret));
    expect(l.nullifiers).toContain(nullifierOf(EMPLOYEE_A.credentialSecret, ACME, EPOCH));
    expect(l.reports.size).toBe(1);
    expect(l.nullifiers.size).toBe(1);

    const onChain = JSON.stringify([
      ...l.reports,
      ...l.nullifiers,
      ...l.organizations.keys(),
    ]);
    expect(onChain).not.toContain(EMPLOYEE_A.personalSecret);
    expect(onChain).not.toContain(EMPLOYEE_A.credentialSecret);
    expect(onChain).not.toContain(EMPLOYEE_A.evidenceHash);
  });

  it("rejects a reporter with no credential in the tree, writing nothing to the ledger", () => {
    const h = baseScenario(fresh());

    expect(() => h.as(IMPOSTOR).report(ACME, EPOCH)).toThrow(ASSERTS.credentialNotInOrg);

    const l = h.ledger();
    expect(l.reports.size).toBe(0);
    expect(l.nullifiers.size).toBe(0);
  });

  it("rejects a second report in the same period from the same reporter", () => {
    const h = baseScenario(fresh());
    h.as(EMPLOYEE_A).report(ACME, EPOCH);

    const again = withEvidence(EMPLOYEE_A, OTHER_EVIDENCE);
    expect(() => h.as(again).report(ACME, EPOCH)).toThrow(ASSERTS.alreadyReportedThisPeriod);

    expect(h.ledger().reports.size).toBe(1);
  });

  it("allows the same reporter in a different period, with unlinkable nullifiers", () => {
    const h = baseScenario(fresh());
    h.as(EMPLOYEE_A).report(ACME, EPOCH);

    h.setBlockTime(NEXT_TIME);
    h.as(withEvidence(EMPLOYEE_A, OTHER_EVIDENCE)).report(ACME, EPOCH_NEXT);

    const l = h.ledger();
    expect(l.reports.size).toBe(2);
    expect(l.nullifiers.size).toBe(2);

    const first = nullifierOf(EMPLOYEE_A.credentialSecret, ACME, EPOCH);
    const second = nullifierOf(EMPLOYEE_A.credentialSecret, ACME, EPOCH_NEXT);
    expect(first).not.toBe(second);
    expect(l.nullifiers).toContain(first);
    expect(l.nullifiers).toContain(second);
  });

  it("keeps two organizations from interfering with each other", () => {
    const h = baseScenario(fresh());
    h.as(EMPLOYEE_A).report(ACME, EPOCH);
    h.as(EMPLOYEE_BETA).report(BETA, EPOCH);

    const l = h.ledger();
    expect(l.reports.size).toBe(2);
    expect(l.nullifiers.size).toBe(2);

    expect(leafFor(ACME, EMPLOYEE_BETA.credentialSecret)).not.toBe(
      leafFor(BETA, EMPLOYEE_BETA.credentialSecret),
    );
    h.setBlockTime(NEXT_TIME);
    expect(() => h.as(EMPLOYEE_BETA).report(ACME, EPOCH_NEXT)).toThrow(ASSERTS.credentialNotInOrg);
  });

  it("keeps two employees of one organization from interfering", () => {
    const h = baseScenario(fresh());
    h.as(EMPLOYEE_A).report(ACME, EPOCH);
    h.as(EMPLOYEE_B).report(ACME, EPOCH);

    const l = h.ledger();
    expect(l.reports.size).toBe(2);
    expect(l.nullifiers.size).toBe(2);
  });
});
