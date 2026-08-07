/**
 * `revealAuthorship` — §4.3, the differentiator. Deferred authorship, designated verifier.
 */

import { describe, expect, it } from "vitest";

import { ASSERTS } from "../harness/contract-surface.js";
import { authorshipOf, reportIdOf } from "../harness/crypto.js";
import {
  ACME,
  EMPLOYEE_A,
  EMPLOYEE_B,
  EMPLOYER_PK,
  EPOCH,
  PROSECUTOR_PK,
  baseScenario,
  withPersonalSecret,
} from "../harness/fixtures.js";
import { backends } from "../harness/index.js";

const BACKENDS = await backends();

const DENUNCIA_A = reportIdOf(EMPLOYEE_A.evidenceHash, EMPLOYEE_A.personalSecret);

describe.each(BACKENDS)("[$name] revealAuthorship", ({ fresh }) => {
  const reported = () => {
    const h = baseScenario(fresh());
    h.as(EMPLOYEE_A).report(ACME, EPOCH);
    return h;
  };

  it("lets the real author prove authorship, bound to the prosecutor's key", () => {
    const h = reported();
    h.as(EMPLOYEE_A).revealAuthorship(DENUNCIA_A, PROSECUTOR_PK);

    const l = h.ledger();
    expect(l.authorships).toContain(authorshipOf(EMPLOYEE_A.personalSecret, DENUNCIA_A, PROSECUTOR_PK));
    expect(l.authorships.size).toBe(1);

    expect(l.reports).toContain(DENUNCIA_A);
    expect(l.reports.size).toBe(1);
  });

  it("rejects someone who knows the denunciaId but not the author's secret", () => {
    const h = reported();

    const thief = withPersonalSecret(EMPLOYEE_A, EMPLOYEE_B.personalSecret);
    expect(() => h.as(thief).revealAuthorship(DENUNCIA_A, PROSECUTOR_PK)).toThrow(ASSERTS.notTheAuthor);

    expect(() => h.as(EMPLOYEE_B).revealAuthorship(DENUNCIA_A, PROSECUTOR_PK)).toThrow(ASSERTS.notTheAuthor);

    expect(h.ledger().authorships.size).toBe(0);
  });

  it("rejects proving authorship of a report that was never filed", () => {
    const h = baseScenario(fresh());

    const nonexistent = reportIdOf(EMPLOYEE_B.evidenceHash, EMPLOYEE_B.personalSecret);
    expect(() => h.as(EMPLOYEE_B).revealAuthorship(nonexistent, PROSECUTOR_PK)).toThrow(
      ASSERTS.reportDoesNotExist,
    );

    expect(h.ledger().authorships.size).toBe(0);
  });

  it("produces a different hash per prosecutor — the designated-verifier property", () => {
    const h = reported();
    h.as(EMPLOYEE_A).revealAuthorship(DENUNCIA_A, PROSECUTOR_PK);
    h.as(EMPLOYEE_A).revealAuthorship(DENUNCIA_A, EMPLOYER_PK);

    const forFiscal = authorshipOf(EMPLOYEE_A.personalSecret, DENUNCIA_A, PROSECUTOR_PK);
    const forEmployer = authorshipOf(EMPLOYEE_A.personalSecret, DENUNCIA_A, EMPLOYER_PK);

    expect(forFiscal).not.toBe(forEmployer);

    const l = h.ledger();
    expect(l.authorships).toContain(forFiscal);
    expect(l.authorships).toContain(forEmployer);
    expect(l.authorships.size).toBe(2);
  });

  it("rejects revealing the same authorship twice to the same prosecutor", () => {
    const h = reported();
    h.as(EMPLOYEE_A).revealAuthorship(DENUNCIA_A, PROSECUTOR_PK);

    expect(() => h.as(EMPLOYEE_A).revealAuthorship(DENUNCIA_A, PROSECUTOR_PK)).toThrow(
      ASSERTS.authorshipAlreadyRevealed,
    );

    expect(h.ledger().authorships.size).toBe(1);
  });
});
