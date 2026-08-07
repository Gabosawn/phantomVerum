/**
 * `registrarOrganizacion` — §4.1. The scaffold for the rest of the contract.
 * Cases from the README table: registers ok · re-registration fails.
 */

import { describe, expect, it } from "vitest";

import { ACME, ACME_ANCHOR, BETA, BETA_ANCHOR } from "../harness/fixtures.js";
import { ASSERTS } from "../harness/contract-surface.js";
import { backends } from "../harness/index.js";

const BACKENDS = await backends();

describe.each(BACKENDS)("[$name] registrarOrganizacion", ({ fresh }) => {
  it("registers the organization and anchors its credential root", () => {
    const h = fresh();
    h.registrarOrganizacion(ACME, ACME_ANCHOR);

    const l = h.ledger();
    expect(l.organizaciones.size).toBe(1);
    expect(l.organizaciones.get(ACME)).toBe(ACME_ANCHOR);
  });

  it("rejects re-registering the same orgId, leaving the original anchor intact", () => {
    const h = fresh();
    h.registrarOrganizacion(ACME, ACME_ANCHOR);

    expect(() => h.registrarOrganizacion(ACME, BETA_ANCHOR)).toThrow(ASSERTS.orgAlreadyRegistered);

    // The point of the assert is not just "it throws": it must prevent an anchor overwrite.
    // Without it, anyone could repoint an org's credential anchor at a tree they control.
    expect(h.ledger().organizaciones.get(ACME)).toBe(ACME_ANCHOR);
  });

  it("keeps two organizations independent", () => {
    const h = fresh();
    h.registrarOrganizacion(ACME, ACME_ANCHOR);
    h.registrarOrganizacion(BETA, BETA_ANCHOR);

    const l = h.ledger();
    expect(l.organizaciones.get(ACME)).toBe(ACME_ANCHOR);
    expect(l.organizaciones.get(BETA)).toBe(BETA_ANCHOR);
  });
});
