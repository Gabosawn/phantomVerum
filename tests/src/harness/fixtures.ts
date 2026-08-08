/**
 * Actors and constants for the suite. Everything DETERMINISTIC: a random secret hashes to a
 * different value on every run, and nothing can be asserted about it.
 */

import { EPOCH_DURATION } from "./contract-surface.js";
import { anchorOf, credCommitmentOf, orgIdOf, periodHex32 } from "./crypto.js";
import { GENESIS_BLOCK_TIME } from "./types.js";
import type { Actor, Hex32, TestigoHarness } from "./types.js";

const byte = (n: number): Hex32 => n.toString(16).padStart(2, "0").repeat(32);

// ── organizations ───────────────────────────────────────────────────────────────────────

/**
 * The secret behind each org's published anchor. `issueCredential` asserts against it, which
 * is what keeps the credential tree — finite, and unrecoverable once full — from being filled
 * by anyone at all.
 *
 * Since the H-2 fix this is also the ROOT of the org's identity: the secret comes first and
 * everything public about the org is derived from it.
 */
export const ACME_ISSUER: Hex32 = byte(0xa1);
export const BETA_ISSUER: Hex32 = byte(0xb1);

/**
 * H-2 — an orgId is derived, not chosen. `registerOrganization` asserts
 * `orgIdOf(issuerSecret()) == orgId`, so these can no longer be arbitrary labels: an id that
 * is a function of a secret is an id nobody can squat ahead of its owner.
 */
export const ACME: Hex32 = orgIdOf(ACME_ISSUER);
export const BETA: Hex32 = orgIdOf(BETA_ISSUER);

/**
 * The `anchor` argument: the commitment to the org's issuer secret. It used to be an inert
 * per-org marker — written by `registerOrganization`, read by no circuit — and is now what
 * `issueCredential` checks the caller against.
 */
export const ACME_ANCHOR: Hex32 = anchorOf(ACME_ISSUER);
export const BETA_ANCHOR: Hex32 = anchorOf(BETA_ISSUER);

// ── public keys ─────────────────────────────────────────────────────────────────────────

/** The designated verifier the reporter chooses. */
export const PROSECUTOR_PK: Hex32 = byte(0xf1);
/** The employer, who intercepts the proof and cannot use it. */
export const EMPLOYER_PK: Hex32 = byte(0xe1);

// ── periods ─────────────────────────────────────────────────────────────────────────────

/**
 * The epoch INDEX (`Uint<64>` → `bigint`) the demo runs in: `floor(GENESIS_BLOCK_TIME /
 * EPOCH_DURATION)`. `GENESIS_BLOCK_TIME` is exactly divisible, so this is the first window's
 * index and `report`'s C0 window (start <= blockTime < end) is load-bearing from the start.
 */
export const AUGUST = BigInt(GENESIS_BLOCK_TIME) / EPOCH_DURATION;
/** The next epoch. Callers must advance the harness clock first (`advanceTime(EPOCH_DURATION)`). */
export const SEPTEMBER = AUGUST + 1n;

/** The little-endian `Bytes<32>` encoding of the epoch index, for hash-operand comparisons. */
export const AUGUST_HEX = periodHex32(AUGUST);
export const SEPTEMBER_HEX = periodHex32(SEPTEMBER);

// ── issuer secrets and verifier nonces ──────────────────────────────────────────────────

/**
 * The nonce a prosecutor generates and sends to the whistleblower off-chain. It is what the
 * receipt is bound to, and it is deliberately NOT in the exported package: the verifier
 * supplies their own, which is what turns the verdict into a recomputation instead of a
 * comparison the holder of the file controls.
 */
export const PROSECUTOR_NONCE: Hex32 = byte(0x71);
/** A second verifier's nonce — the EMPLOYER of the demo. */
export const EMPLOYER_NONCE: Hex32 = byte(0x81);

// ── actors ──────────────────────────────────────────────────────────────────────────────

/** An ACME employee. The reporter in the demo. */
export const EMPLOYEE_A: Actor = {
  name: "employeeA (ACME)",
  orgId: ACME,
  credentialSecret: byte(0x11),
  personalSecret: byte(0x12),
  evidenceHash: byte(0x13),
  issuerSecret: ACME_ISSUER,
  prosecutorNonce: PROSECUTOR_NONCE,
};

/** Another ACME employee. Backs "two employees of one org do not interfere". */
export const EMPLOYEE_B: Actor = {
  name: "employeeB (ACME)",
  orgId: ACME,
  credentialSecret: byte(0x21),
  personalSecret: byte(0x22),
  evidenceHash: byte(0x23),
  issuerSecret: ACME_ISSUER,
  prosecutorNonce: PROSECUTOR_NONCE,
};

/** A BETA employee. Backs "two orgs do not interfere". */
export const EMPLOYEE_BETA: Actor = {
  name: "employeeBeta (BETA)",
  orgId: BETA,
  credentialSecret: byte(0x31),
  personalSecret: byte(0x32),
  evidenceHash: byte(0x33),
  issuerSecret: BETA_ISSUER,
  prosecutorNonce: PROSECUTOR_NONCE,
};

/**
 * Anonymous ACME crowd — the rest of the anonymity set. `report` (H-1) refuses to run while the
 * tree holds fewer than `minAnonymitySet()` credentials: proving membership in a tree of one
 * names exactly one person. The demo's three named employees are not enough, so `baseScenario`
 * tops the tree up to the floor with employees who never speak.
 */
const CROWD_SECRETS: readonly Hex32[] = [byte(0x51), byte(0x52), byte(0x53), byte(0x54), byte(0x55)];
export const CROWD: readonly Actor[] = CROWD_SECRETS.map((credentialSecret, i) => ({
  name: `crowd ${i + 1} (ACME)`,
  orgId: ACME,
  credentialSecret,
  personalSecret: byte(0x60 + i),
  evidenceHash: byte(0x70 + i),
  issuerSecret: ACME_ISSUER,
  prosecutorNonce: PROSECUTOR_NONCE,
}));
export const CROWD_CREDENTIAL_COUNT = CROWD_SECRETS.length;

/** Total named + crowd credentials issued by `baseScenario` — must clear the H-1 floor. */
export const BASE_CREDENTIAL_COUNT = 3 + CROWD_CREDENTIAL_COUNT;

/** Claims to be at ACME but never received a credential. Must fail C1. */
export const IMPOSTOR: Actor = {
  name: "impostor (no credential)",
  orgId: ACME,
  credentialSecret: byte(0x41),
  personalSecret: byte(0x42),
  evidenceHash: byte(0x43),
  issuerSecret: byte(0x4f),
  prosecutorNonce: PROSECUTOR_NONCE,
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

// ── base scenario ───────────────────────────────────────────────────────────────────────

/**
 * Stage 1 of the demo: ACME and BETA registered, credentials issued to all three employees.
 * The impostor is deliberately left out of the tree.
 */
export function baseScenario<T extends TestigoHarness>(h: T): T {
  // H-2: `registerOrganization` asserts the caller holds the secret behind the orgId/anchor,
  // so the org registers under the actor that owns its issuer secret.
  h.as(EMPLOYEE_A).registerOrganization(ACME, ACME_ANCHOR);
  h.as(EMPLOYEE_BETA).registerOrganization(BETA, BETA_ANCHOR);
  h.as(EMPLOYEE_A).issueCredential(ACME, credCommitmentOf(EMPLOYEE_A.credentialSecret));
  h.as(EMPLOYEE_B).issueCredential(ACME, credCommitmentOf(EMPLOYEE_B.credentialSecret));
  h.as(EMPLOYEE_BETA).issueCredential(BETA, credCommitmentOf(EMPLOYEE_BETA.credentialSecret));
  // H-1: top the tree up to the anonymity floor — see `CROWD`.
  for (const member of CROWD) {
    h.as(EMPLOYEE_A).issueCredential(ACME, credCommitmentOf(member.credentialSecret));
  }
  return h;
}
