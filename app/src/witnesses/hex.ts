// Hex <-> bytes conversion for the 32-byte values crossing the app <->
// contract boundary (docs/03-plan-ejecucion.md §3.1: `Hex32` = 64 lowercase
// hex chars, WITHOUT the `0x` prefix).
//
// Everything persisted in `secrets/denunciante.json` travels as Hex32;
// everything entering a circuit or a witness travels as a `Uint8Array` of
// exactly 32 bytes. This module is the only place where the translation
// happens.

import { randomBytes } from 'node:crypto';

/** 64 lowercase hex characters, without `0x`. */
export type Hex32 = string;

/** Size of every protocol value (Bytes<32> in Compact). */
export const BYTE_LENGTH = 32;

const RE_HEX32 = /^[0-9a-f]{64}$/;

export class InvalidHexError extends Error {
  constructor(field: string, value: unknown) {
    const seen =
      typeof value === 'string' ? `string of ${value.length} chars` : typeof value;
    super(`"${field}" is not a valid Hex32 (64 lowercase hex chars, no 0x): ${seen}`);
    this.name = 'InvalidHexError';
  }
}

export function isHex32(value: unknown): value is Hex32 {
  return typeof value === 'string' && RE_HEX32.test(value);
}

/** Bytes -> Hex32. Requires exactly 32 bytes: a short value would be a bug. */
export function toHex(bytes: Uint8Array): Hex32 {
  if (bytes.length !== BYTE_LENGTH) {
    throw new InvalidHexError('bytes', `Uint8Array of ${bytes.length} bytes`);
  }
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

/**
 * Hex32 -> bytes. Validates with a regex BEFORE converting: `Buffer.from(x,
 * 'hex')` silently truncates on invalid characters and would return a short
 * value that later blows up inside the circuit with an unreadable error.
 */
export function toBytes32(hex: string, field = 'hex'): Uint8Array {
  if (!isHex32(hex)) throw new InvalidHexError(field, hex);
  const bytes = new Uint8Array(BYTE_LENGTH);
  for (let i = 0; i < BYTE_LENGTH; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Accepts either representation and returns bytes. */
export function asBytes32(value: Uint8Array | Hex32, field = 'value'): Uint8Array {
  if (typeof value === 'string') return toBytes32(value, field);
  if (value.length !== BYTE_LENGTH) throw new InvalidHexError(field, value);
  return value;
}

/** Accepts either representation and returns Hex32. */
export function asHex32(value: Uint8Array | Hex32, field = 'value'): Hex32 {
  if (typeof value === 'string') {
    if (!isHex32(value)) throw new InvalidHexError(field, value);
    return value;
  }
  return toHex(value);
}

/**
 * 32 bytes of cryptographic system entropy.
 *
 * SECURITY (docs/03 §3.2): protocol secrets are ALWAYS generated here and
 * NEVER derived from a password, a mnemonic seed or the evidence. The entropy
 * of `reportSecret` is the only thing preventing a brute-force inversion of
 * `reportId = H(dom ‖ evidenceHash ‖ reportSecret)`: `evidenceHash` is
 * enumerable by the employer, who owns the reported documents and can hash
 * them all.
 */
export function randomBytes32(): Uint8Array {
  return Uint8Array.from(randomBytes(BYTE_LENGTH));
}
