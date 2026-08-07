/**
 * `revelarAutoria` — §4.3, the differentiator. Deferred authorship, designated verifier.
 *
 * Cases from the README table: the real author passes · a foreign secret fails · a
 * nonexistent report fails · same author + different prosecutor ⇒ a different hash.
 */

import { describe, expect, it } from "vitest";

import { ASSERTS } from "../harness/contract-surface.js";
import { autoriaDe, denunciaIdDe } from "../harness/crypto.js";
import {
  ACME,
  AUGUST,
  EMPLOYEE_A,
  EMPLOYEE_B,
  EMPLOYER_PK,
  FISCAL_PK,
  baseScenario,
  withSecret,
} from "../harness/fixtures.js";
import { backends } from "../harness/index.js";

const BACKENDS = await backends();

const DENUNCIA_A = denunciaIdDe(EMPLOYEE_A.evidenciaHash, EMPLOYEE_A.secretPersonal);

describe.each(BACKENDS)("[$name] revelarAutoria", ({ fresh }) => {
  /** T2 of the demo: the report already exists on chain, months earlier. */
  const reported = () => {
    const h = baseScenario(fresh());
    h.as(EMPLOYEE_A).denunciar(ACME, AUGUST);
    return h;
  };

  it("lets the real author prove authorship, bound to the prosecutor's key", () => {
    const h = reported();
    h.as(EMPLOYEE_A).revelarAutoria(DENUNCIA_A, FISCAL_PK);

    const l = h.ledger();
    expect(l.autorias).toContain(autoriaDe(EMPLOYEE_A.secretPersonal, DENUNCIA_A, FISCAL_PK));
    expect(l.autorias.size).toBe(1);

    // Revealing authorship must not disturb the seal itself.
    expect(l.denuncias).toContain(DENUNCIA_A);
    expect(l.denuncias.size).toBe(1);
  });

  it("rejects someone who knows the denunciaId but not the author's secret", () => {
    const h = reported();

    // The thief copied denunciaId off the public ledger and has the evidence, but the
    // preimage needs the personal secret too. This is what stops a reward grab.
    const thief = withSecret(EMPLOYEE_A, EMPLOYEE_B.secretPersonal);
    expect(() => h.as(thief).revelarAutoria(DENUNCIA_A, FISCAL_PK)).toThrow(ASSERTS.notTheAuthor);

    // A completely unrelated colleague fares no better.
    expect(() => h.as(EMPLOYEE_B).revelarAutoria(DENUNCIA_A, FISCAL_PK)).toThrow(ASSERTS.notTheAuthor);

    expect(h.ledger().autorias.size).toBe(0);
  });

  it("rejects proving authorship of a report that was never filed", () => {
    const h = baseScenario(fresh());

    // EMPLOYEE_B never reported. They are the genuine author of this denunciaId (C1 passes),
    // but it is not on chain, so C2 must reject it.
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

    // Same author, same report, different verifier ⇒ different record. This is why the
    // employer cannot replay the prosecutor's proof: the on-chain entry it would need to
    // point at is not the one that exists for it.
    expect(forFiscal).not.toBe(forEmployer);

    const l = h.ledger();
    expect(l.autorias).toContain(forFiscal);
    expect(l.autorias).toContain(forEmployer);
    expect(l.autorias.size).toBe(2);
  });

  it("rejects revealing the same authorship twice to the same prosecutor", () => {
    const h = reported();
    h.as(EMPLOYEE_A).revelarAutoria(DENUNCIA_A, FISCAL_PK);

    // §2.6: without the guard, Set.insert would silently no-op and the caller would believe
    // a second, distinct revelation had been recorded.
    expect(() => h.as(EMPLOYEE_A).revelarAutoria(DENUNCIA_A, FISCAL_PK)).toThrow(
      ASSERTS.authorshipAlreadyRevealed,
    );

    expect(h.ledger().autorias.size).toBe(1);
  });
});
