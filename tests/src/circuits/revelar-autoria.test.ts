/**
 * `revelarAutoria` — §4.3, the differentiator. Deferred authorship, designated verifier.
 */

import { describe, expect, it } from "vitest";

import { ASSERTS } from "../harness/contract-surface.js";
import { autoriaDe, denunciaIdDe } from "../harness/crypto.js";
import {
  ACME,
  EMPLOYEE_A,
  EMPLOYEE_B,
  EMPLOYER_PK,
  EPOCA,
  FISCAL_PK,
  baseScenario,
  withSecret,
} from "../harness/fixtures.js";
import { backends } from "../harness/index.js";

const BACKENDS = await backends();

const DENUNCIA_A = denunciaIdDe(EMPLOYEE_A.evidenciaHash, EMPLOYEE_A.secretPersonal);

describe.each(BACKENDS)("[$name] revelarAutoria", ({ fresh }) => {
  const reported = () => {
    const h = baseScenario(fresh());
    h.as(EMPLOYEE_A).denunciar(ACME, EPOCA);
    return h;
  };

  it("lets the real author prove authorship, bound to the prosecutor's key", () => {
    const h = reported();
    h.as(EMPLOYEE_A).revelarAutoria(DENUNCIA_A, FISCAL_PK);

    const l = h.ledger();
    expect(l.autorias).toContain(autoriaDe(EMPLOYEE_A.secretPersonal, DENUNCIA_A, FISCAL_PK));
    expect(l.autorias.size).toBe(1);

    expect(l.denuncias).toContain(DENUNCIA_A);
    expect(l.denuncias.size).toBe(1);
  });

  it("rejects someone who knows the denunciaId but not the author's secret", () => {
    const h = reported();

    const thief = withSecret(EMPLOYEE_A, EMPLOYEE_B.secretPersonal);
    expect(() => h.as(thief).revelarAutoria(DENUNCIA_A, FISCAL_PK)).toThrow(ASSERTS.notTheAuthor);

    expect(() => h.as(EMPLOYEE_B).revelarAutoria(DENUNCIA_A, FISCAL_PK)).toThrow(ASSERTS.notTheAuthor);

    expect(h.ledger().autorias.size).toBe(0);
  });

  it("rejects proving authorship of a report that was never filed", () => {
    const h = baseScenario(fresh());

    const nonexistent = denunciaIdDe(EMPLOYEE_B.evidenciaHash, EMPLOYEE_B.secretPersonal);
    expect(() => h.as(EMPLOYEE_B).revelarAutoria(nonexistent, FISCAL_PK)).toThrow(
      ASSERTS.reportNotFound,
    );

    expect(h.ledger().autorias.size).toBe(0);
  });

  it("produces a different hash per prosecutor — the designated-verifier property", () => {
    const h = reported();
    h.as(EMPLOYEE_A).revelarAutoria(DENUNCIA_A, FISCAL_PK);
    h.as(EMPLOYEE_A).revelarAutoria(DENUNCIA_A, EMPLOYER_PK);

    const forFiscal = autoriaDe(EMPLOYEE_A.secretPersonal, DENUNCIA_A, FISCAL_PK);
    const forEmployer = autoriaDe(EMPLOYEE_A.secretPersonal, DENUNCIA_A, EMPLOYER_PK);

    expect(forFiscal).not.toBe(forEmployer);

    const l = h.ledger();
    expect(l.autorias).toContain(forFiscal);
    expect(l.autorias).toContain(forEmployer);
    expect(l.autorias.size).toBe(2);
  });

  it("rejects revealing the same authorship twice to the same prosecutor", () => {
    const h = reported();
    h.as(EMPLOYEE_A).revelarAutoria(DENUNCIA_A, FISCAL_PK);

    expect(() => h.as(EMPLOYEE_A).revelarAutoria(DENUNCIA_A, FISCAL_PK)).toThrow(
      ASSERTS.authorshipAlreadyRevealed,
    );

    expect(h.ledger().autorias.size).toBe(1);
  });
});
