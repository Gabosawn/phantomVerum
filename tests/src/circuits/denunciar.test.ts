/**
 * `denunciar` — §4.2, the heart of the contract.
 */

import { describe, expect, it } from "vitest";

import { ASSERTS } from "../harness/contract-surface.js";
import { denunciaIdDe, hojaPara, nullifierDe } from "../harness/crypto.js";
import {
  ACME,
  AHORA_NEXT,
  BETA,
  EMPLOYEE_A,
  EMPLOYEE_B,
  EMPLOYEE_BETA,
  EPOCA,
  EPOCA_NEXT,
  IMPOSTOR,
  OTHER_EVIDENCE,
  baseScenario,
  withEvidence,
} from "../harness/fixtures.js";
import { backends } from "../harness/index.js";

const BACKENDS = await backends();

describe.each(BACKENDS)("[$name] denunciar", ({ fresh }) => {
  it("seals the report and burns the nullifier, revealing nothing about the reporter", () => {
    const h = baseScenario(fresh());
    h.as(EMPLOYEE_A).denunciar(ACME, EPOCA);

    const l = h.ledger();
    expect(l.denuncias).toContain(denunciaIdDe(EMPLOYEE_A.evidenciaHash, EMPLOYEE_A.secretPersonal));
    expect(l.nullifiers).toContain(nullifierDe(EMPLOYEE_A.credencialSecret, ACME, EPOCA));
    expect(l.denuncias.size).toBe(1);
    expect(l.nullifiers.size).toBe(1);

    const onChain = JSON.stringify([...l.denuncias, ...l.nullifiers, ...l.organizaciones]);
    expect(onChain).not.toContain(EMPLOYEE_A.secretPersonal);
    expect(onChain).not.toContain(EMPLOYEE_A.credencialSecret);
    expect(onChain).not.toContain(EMPLOYEE_A.evidenciaHash);
  });

  it("rejects a reporter with no credential in the tree, writing nothing to the ledger", () => {
    const h = baseScenario(fresh());

    expect(() => h.as(IMPOSTOR).denunciar(ACME, EPOCA)).toThrow(ASSERTS.invalidCredential);

    const l = h.ledger();
    expect(l.denuncias.size).toBe(0);
    expect(l.nullifiers.size).toBe(0);
  });

  it("rejects a second report in the same period from the same reporter", () => {
    const h = baseScenario(fresh());
    h.as(EMPLOYEE_A).denunciar(ACME, EPOCA);

    const again = withEvidence(EMPLOYEE_A, OTHER_EVIDENCE);
    expect(() => h.as(again).denunciar(ACME, EPOCA)).toThrow(ASSERTS.alreadyReportedThisPeriod);

    expect(h.ledger().denuncias.size).toBe(1);
  });

  it("allows the same reporter in a different period, with unlinkable nullifiers", () => {
    const h = baseScenario(fresh());
    h.as(EMPLOYEE_A).denunciar(ACME, EPOCA);

    h.at(AHORA_NEXT);
    h.as(withEvidence(EMPLOYEE_A, OTHER_EVIDENCE)).denunciar(ACME, EPOCA_NEXT);

    const l = h.ledger();
    expect(l.denuncias.size).toBe(2);
    expect(l.nullifiers.size).toBe(2);

    const first = nullifierDe(EMPLOYEE_A.credencialSecret, ACME, EPOCA);
    const second = nullifierDe(EMPLOYEE_A.credencialSecret, ACME, EPOCA_NEXT);
    expect(first).not.toBe(second);
    expect(l.nullifiers).toContain(first);
    expect(l.nullifiers).toContain(second);
  });

  it("keeps two organizations from interfering with each other", () => {
    const h = baseScenario(fresh());
    h.as(EMPLOYEE_A).denunciar(ACME, EPOCA);
    h.as(EMPLOYEE_BETA).denunciar(BETA, EPOCA);

    const l = h.ledger();
    expect(l.denuncias.size).toBe(2);
    expect(l.nullifiers.size).toBe(2);

    expect(hojaPara(ACME, EMPLOYEE_BETA.credencialSecret)).not.toBe(
      hojaPara(BETA, EMPLOYEE_BETA.credencialSecret),
    );
    h.at(AHORA_NEXT);
    expect(() => h.as(EMPLOYEE_BETA).denunciar(ACME, EPOCA_NEXT)).toThrow(ASSERTS.invalidCredential);
  });

  it("keeps two employees of one organization from interfering", () => {
    const h = baseScenario(fresh());
    h.as(EMPLOYEE_A).denunciar(ACME, EPOCA);
    h.as(EMPLOYEE_B).denunciar(ACME, EPOCA);

    const l = h.ledger();
    expect(l.denuncias.size).toBe(2);
    expect(l.nullifiers.size).toBe(2);
  });
});
