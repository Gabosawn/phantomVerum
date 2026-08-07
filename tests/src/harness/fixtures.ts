/**
 * Actors and constants for the suite. Everything DETERMINISTIC: a random secret hashes to a
 * different value on every run, and nothing can be asserted about it.
 */

import { hojaDe, padHex32 } from "./crypto.js";
import type { Actor, Hex32, TestigoHarness } from "./types.js";

const byte = (n: number): Hex32 => n.toString(16).padStart(2, "0").repeat(32);

// ── organizations ───────────────────────────────────────────────────────────────────────

export const ACME: Hex32 = byte(0xa1);
export const BETA: Hex32 = byte(0xb1);

/** The `ancla` of §4.1. With the global tree (§2.1) it is a per-org marker, not the root. */
export const ACME_ANCHOR: Hex32 = byte(0xa2);
export const BETA_ANCHOR: Hex32 = byte(0xb2);

// ── public keys ─────────────────────────────────────────────────────────────────────────

/** The designated verifier the reporter chooses. */
export const FISCAL_PK: Hex32 = byte(0xf1);
/** The employer, who intercepts the proof and cannot use it. */
export const EMPLOYER_PK: Hex32 = byte(0xe1);

// ── periods ─────────────────────────────────────────────────────────────────────────────

export const AUGUST = "2026-08";
export const SEPTEMBER = "2026-09";
export const AUGUST_HEX = padHex32(AUGUST);
export const SEPTEMBER_HEX = padHex32(SEPTEMBER);

// ── actors ──────────────────────────────────────────────────────────────────────────────

/** An ACME employee. The reporter in the demo. */
export const EMPLOYEE_A: Actor = {
  name: "employeeA (ACME)",
  credencialSecret: byte(0x11),
  secretPersonal: byte(0x12),
  evidenciaHash: byte(0x13),
};

/** Another ACME employee. Backs "two employees of one org do not interfere". */
export const EMPLOYEE_B: Actor = {
  name: "employeeB (ACME)",
  credencialSecret: byte(0x21),
  secretPersonal: byte(0x22),
  evidenciaHash: byte(0x23),
};

/** A BETA employee. Backs "two orgs do not interfere". */
export const EMPLOYEE_BETA: Actor = {
  name: "employeeBeta (BETA)",
  credencialSecret: byte(0x31),
  secretPersonal: byte(0x32),
  evidenciaHash: byte(0x33),
};

/** Never received a credential from anyone. Their report must fail C1. */
export const IMPOSTOR: Actor = {
  name: "impostor (no credential)",
  credencialSecret: byte(0x41),
  secretPersonal: byte(0x42),
  evidenciaHash: byte(0x43),
};

/** New evidence for an existing actor — used by the "different period passes" case. */
export const OTHER_EVIDENCE: Hex32 = byte(0x99);

/** Same actor, different evidence. */
export function withEvidence(actor: Actor, evidenciaHash: Hex32): Actor {
  return { ...actor, evidenciaHash };
}

/** Someone who copied a `denunciaId` but does not know the author's `secretPersonal`. */
export function withSecret(actor: Actor, secretPersonal: Hex32): Actor {
  return { ...actor, secretPersonal };
}

// ── base scenario ───────────────────────────────────────────────────────────────────────

/**
 * T1 of the demo: ACME and BETA registered, credentials issued to all three employees.
 * The impostor is deliberately left out of the tree.
 */
export function baseScenario<T extends TestigoHarness>(h: T): T {
  h.registrarOrganizacion(ACME, ACME_ANCHOR);
  h.registrarOrganizacion(BETA, BETA_ANCHOR);
  h.emitirCredencial(ACME, hojaDe(ACME, EMPLOYEE_A.credencialSecret));
  h.emitirCredencial(ACME, hojaDe(ACME, EMPLOYEE_B.credencialSecret));
  h.emitirCredencial(BETA, hojaDe(BETA, EMPLOYEE_BETA.credencialSecret));
  return h;
}
