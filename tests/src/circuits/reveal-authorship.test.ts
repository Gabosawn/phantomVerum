/**
 * `revealAuthorship` — the differentiator. Deferred authorship, designated verifier.
 *
 * Cases: the real author passes · a foreign secret fails · a nonexistent report fails ·
 * same author + different prosecutor ⇒ a different hash.
 */

import { describe, expect, it } from "vitest";

import { ASSERTS } from "../harness/contract-surface.js";
import { receiptOf, reportIdOf } from "../harness/crypto.js";
import {
  ACME,
  AUGUST,
  EMPLOYEE_A,
  EMPLOYEE_B,
  EMPLOYER_NONCE,
  PROSECUTOR_NONCE,
  baseScenario,
  withPersonalSecret,
} from "../harness/fixtures.js";
import { backends } from "../harness/index.js";

const BACKENDS = await backends();

const REPORT_A = reportIdOf(EMPLOYEE_A.evidenceHash, EMPLOYEE_A.personalSecret);

describe.each(BACKENDS)("[$name] revealAuthorship", ({ fresh }) => {
  /** Stage 2 of the demo: the report is already on chain, months earlier. */
  const reported = () => {
    const h = baseScenario(fresh());
    h.as(EMPLOYEE_A).report(ACME, AUGUST);
    return h;
  };

  it("lets the real author prove authorship, bound to the prosecutor's nonce", () => {
    const h = reported();
    h.as(EMPLOYEE_A).revealAuthorship(REPORT_A);

    const l = h.ledger();
    // Note what the prosecutor needs to recompute this: the public reportId and
    // the nonce they generated themselves. No secret is handed over.
    expect(l.authorships).toContain(receiptOf(REPORT_A, PROSECUTOR_NONCE));
    expect(l.authorships.size).toBe(1);

    // Revealing authorship must not disturb the seal itself.
    expect(l.reports).toContain(REPORT_A);
    expect(l.reports.size).toBe(1);
  });

  it("rejects someone who knows the reportId but not the author's personal secret", () => {
    const h = reported();

    // The thief copied reportId off the public ledger and has the evidence, but the preimage
    // needs the personal secret too. This is what stops a reward grab.
    const thief = withPersonalSecret(EMPLOYEE_A, EMPLOYEE_B.personalSecret);
    expect(() => h.as(thief).revealAuthorship(REPORT_A)).toThrow(
      ASSERTS.notTheAuthor,
    );

    // A completely unrelated colleague fares no better.
    expect(() => h.as(EMPLOYEE_B).revealAuthorship(REPORT_A)).toThrow(
      ASSERTS.notTheAuthor,
    );

    expect(h.ledger().authorships.size).toBe(0);
  });

  it("rejects proving authorship of a report that was never filed", () => {
    const h = baseScenario(fresh());

    // EMPLOYEE_B never reported. They are the genuine author of this reportId (C1 passes), but
    // it is not on chain, so C2 must reject it.
    const nonexistent = reportIdOf(EMPLOYEE_B.evidenceHash, EMPLOYEE_B.personalSecret);
    expect(() => h.as(EMPLOYEE_B).revealAuthorship(nonexistent)).toThrow(
      ASSERTS.reportDoesNotExist,
    );

    expect(h.ledger().authorships.size).toBe(0);
  });

  it("produces a different receipt per nonce — one binding per verifier", () => {
    const h = reported();
    h.as(EMPLOYEE_A).revealAuthorship(REPORT_A);
    h.as({ ...EMPLOYEE_A, prosecutorNonce: EMPLOYER_NONCE }).revealAuthorship(REPORT_A);

    const forProsecutor = receiptOf(REPORT_A, PROSECUTOR_NONCE);
    const forEmployer = receiptOf(REPORT_A, EMPLOYER_NONCE);

    // Same author, same report, different verifier ⇒ different record. This is why the employer
    // cannot replay the prosecutor's proof: the entry it would need to point at is not the one
    // that exists for it.
    expect(forProsecutor).not.toBe(forEmployer);

    const l = h.ledger();
    expect(l.authorships).toContain(forProsecutor);
    expect(l.authorships).toContain(forEmployer);
    expect(l.authorships.size).toBe(2);
  });

  it("rejects revealing the same authorship twice to the same prosecutor", () => {
    const h = reported();
    h.as(EMPLOYEE_A).revealAuthorship(REPORT_A);

    // Without the guard, Set.insert would silently no-op and the caller would believe a second,
    // distinct revelation had been recorded.
    expect(() => h.as(EMPLOYEE_A).revealAuthorship(REPORT_A)).toThrow(
      ASSERTS.authorshipAlreadyRevealed,
    );

    expect(h.ledger().authorships.size).toBe(1);
  });
});
