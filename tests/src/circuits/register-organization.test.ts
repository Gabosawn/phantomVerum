/**
 * `registerOrganization` — the scaffold for the rest of the contract.
 * Cases: registers ok · re-registration fails.
 */

import { describe, expect, it } from "vitest";

import { ASSERTS } from "../harness/contract-surface.js";
import { ACME, ACME_ANCHOR, BETA, BETA_ANCHOR } from "../harness/fixtures.js";
import { backends } from "../harness/index.js";

const BACKENDS = await backends();

describe.each(BACKENDS)("[$name] registerOrganization", ({ fresh }) => {
  it("registers the organization and anchors its credential root", () => {
    const h = fresh();
    h.registerOrganization(ACME, ACME_ANCHOR);

    const l = h.ledger();
    expect(l.organizations.size).toBe(1);
    expect(l.organizations.get(ACME)).toBe(ACME_ANCHOR);
  });

  it("rejects re-registering the same orgId, leaving the original anchor intact", () => {
    const h = fresh();
    h.registerOrganization(ACME, ACME_ANCHOR);

    expect(() => h.registerOrganization(ACME, BETA_ANCHOR)).toThrow(ASSERTS.orgAlreadyRegistered);

    // The point of the assert is not just "it throws": it must prevent an anchor overwrite.
    // Without it, anyone could repoint an org's credential anchor at a tree they control.
    expect(h.ledger().organizations.get(ACME)).toBe(ACME_ANCHOR);
  });

  it("keeps two organizations independent", () => {
    const h = fresh();
    h.registerOrganization(ACME, ACME_ANCHOR);
    h.registerOrganization(BETA, BETA_ANCHOR);

    const l = h.ledger();
    expect(l.organizations.get(ACME)).toBe(ACME_ANCHOR);
    expect(l.organizations.get(BETA)).toBe(BETA_ANCHOR);
  });

  it("refuses to issue a credential for an unregistered organization", () => {
    const h = fresh();
    expect(() => h.issueCredential(ACME, "aa".repeat(32))).toThrow(ASSERTS.orgNotRegistered);
    expect(h.ledger().credentialsCount).toBe(0);
  });
});
