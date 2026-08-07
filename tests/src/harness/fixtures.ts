/**
 * Actors and constants for the suite. Everything DETERMINISTIC: a random secret hashes to a
 * different value on every run, and nothing can be asserted about it.
 */

import { EPOCH, EPOCH_NEXT, NEXT_TIME, NOW } from "./contract-surface.js";
import { credCommitmentOf, leafOf } from "./crypto.js";
import type { Actor, Hex32, TestigoHarness } from "./types.js";

const byte = (n: number): Hex32 => n.toString(16).padStart(2, "0").repeat(32);

export { EPOCH, EPOCH_NEXT, NEXT_TIME, NOW };

// ── organizations ───────────────────────────────────────────────────────────────────────

export const ACME: Hex32 = byte(0xa1);
export const BETA: Hex32 = byte(0xb1);

/** The `anchor` argument. With the global tree it is a per-org marker, not the root. */
export const ACME_ANCHOR: Hex32 = byte(0xa2);
export const BETA_ANCHOR: Hex32 = byte(0xb2);

// ── public keys ─────────────────────────────────────────────────────────────────────────

/** The designated verifier the reporter chooses. */
export const PROSECUTOR_PK: Hex32 = byte(0xf1);
/** The employer, who intercepts the proof and cannot use it. */
export const EMPLOYER_PK: Hex32 = byte(0xe1);

// ── actors ──────────────────────────────────────────────────────────────────────────────

/** An ACME employee. The reporter in the demo. */
export const EMPLOYEE_A: Actor = {
  name: "employeeA (ACME)",
  orgId: ACME,
  credentialSecret: byte(0x11),
  personalSecret: byte(0x12),
  evidenceHash: byte(0x13),
};

/** Another ACME employee. Backs "two employees of one org do not interfere". */
export const EMPLOYEE_B: Actor = {
  name: "employeeB (ACME)",
  orgId: ACME,
  credentialSecret: byte(0x21),
  personalSecret: byte(0x22),
  evidenceHash: byte(0x23),
};

/** A BETA employee. Backs "two orgs do not interfere". */
export const EMPLOYEE_BETA: Actor = {
  name: "employeeBeta (BETA)",
  orgId: BETA,
  credentialSecret: byte(0x31),
  personalSecret: byte(0x32),
  evidenceHash: byte(0x33),
};

/** Claims to be at ACME but never received a credential. Must fail C1. */
export const IMPOSTOR: Actor = {
  name: "impostor (no credential)",
  orgId: ACME,
  credentialSecret: byte(0x41),
  personalSecret: byte(0x42),
  evidenceHash: byte(0x43),
};

/** New evidence for an existing actor — used by the "different period passes" case. */
export const OTHER_EVIDENCE: Hex32 = byte(0x99);

/** Same actor, different evidence. */
export function withEvidence(actor: Actor, evidenceHash: Hex32): Actor {
  return { ...actor, evidenceHash };
}

/** Someone who copied a `reportId` but does not know the author's `personalSecret`. */
export function withPersonalSecret(actor: Actor, personalSecret: Hex32): Actor {
  return { ...actor, personalSecret };
}

/**
 * The same actor claiming to belong to a different org.
 *
 * Only `orgId` in the private state moves, which is what the `credentialPath()` witness reads.
 * The circuit still hashes the leaf from its public argument, so this is how "supply one org's
 * siblings while claiming another" gets expressed.
 */
export function claimingOrg(actor: Actor, orgId: Hex32): Actor {
  return { ...actor, orgId };
}

/** Leaf the circuit builds for this employee in `orgId` (`leafOf(org, credCommitmentOf(sec))`). */
export function leafFor(orgId: Hex32, credentialSecret: Hex32): Hex32 {
  return leafOf(orgId, credCommitmentOf(credentialSecret));
}

// ── base scenario ───────────────────────────────────────────────────────────────────────

/**
 * Stage 1 of the demo: ACME and BETA registered, credentials issued to all three employees.
 * The impostor is deliberately left out of the tree.
 */
export function baseScenario<T extends TestigoHarness>(h: T): T {
  h.setBlockTime(NOW);
  h.registerOrganization(ACME, ACME_ANCHOR);
  h.registerOrganization(BETA, BETA_ANCHOR);
  h.issueCredential(ACME, credCommitmentOf(EMPLOYEE_A.credentialSecret));
  h.issueCredential(ACME, credCommitmentOf(EMPLOYEE_B.credentialSecret));
  h.issueCredential(BETA, credCommitmentOf(EMPLOYEE_BETA.credentialSecret));
  return h;
}
