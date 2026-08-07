/**
 * Actors and constants for the suite. Everything DETERMINISTIC.
 */

import { AHORA, EPOCA, EPOCA_NEXT, AHORA_NEXT } from "./contract-surface.js";
import { credCommitmentDe, hojaPara } from "./crypto.js";
import type { Actor, Hex32, TestigoHarness } from "./types.js";

const byte = (n: number): Hex32 => n.toString(16).padStart(2, "0").repeat(32);

export { AHORA, EPOCA, EPOCA_NEXT, AHORA_NEXT };

// ── organizations ───────────────────────────────────────────────────────────────────────

export const ACME: Hex32 = byte(0xa1);
export const BETA: Hex32 = byte(0xb1);

export const ACME_ANCHOR: Hex32 = byte(0xa2);
export const BETA_ANCHOR: Hex32 = byte(0xb2);

// ── public keys ─────────────────────────────────────────────────────────────────────────

export const FISCAL_PK: Hex32 = byte(0xf1);
export const EMPLOYER_PK: Hex32 = byte(0xe1);

// ── actors ──────────────────────────────────────────────────────────────────────────────

export const EMPLOYEE_A: Actor = {
  name: "employeeA (ACME)",
  credencialSecret: byte(0x11),
  secretPersonal: byte(0x12),
  evidenciaHash: byte(0x13),
};

export const EMPLOYEE_B: Actor = {
  name: "employeeB (ACME)",
  credencialSecret: byte(0x21),
  secretPersonal: byte(0x22),
  evidenciaHash: byte(0x23),
};

export const EMPLOYEE_BETA: Actor = {
  name: "employeeBeta (BETA)",
  credencialSecret: byte(0x31),
  secretPersonal: byte(0x32),
  evidenciaHash: byte(0x33),
};

export const IMPOSTOR: Actor = {
  name: "impostor (no credential)",
  credencialSecret: byte(0x41),
  secretPersonal: byte(0x42),
  evidenciaHash: byte(0x43),
};

export const OTHER_EVIDENCE: Hex32 = byte(0x99);

export function withEvidence(actor: Actor, evidenciaHash: Hex32): Actor {
  return { ...actor, evidenciaHash };
}

export function withSecret(actor: Actor, secretPersonal: Hex32): Actor {
  return { ...actor, secretPersonal };
}

/**
 * T1 of the demo: ACME and BETA registered, commitments issued to all three employees.
 * The impostor is deliberately left out of the tree.
 */
export function baseScenario<T extends TestigoHarness>(h: T): T {
  h.at(AHORA);
  h.registrarOrganizacion(ACME, ACME_ANCHOR);
  h.registrarOrganizacion(BETA, BETA_ANCHOR);
  h.emitirCredencial(ACME, credCommitmentDe(EMPLOYEE_A.credencialSecret));
  h.emitirCredencial(ACME, credCommitmentDe(EMPLOYEE_B.credencialSecret));
  h.emitirCredencial(BETA, credCommitmentDe(EMPLOYEE_BETA.credencialSecret));
  return h;
}

/** Leaf that the circuit builds for this employee in `orgId`. */
export const leafFor = hojaPara;
