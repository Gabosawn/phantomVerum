/**
 * The contract's five hashes, recomputed in TypeScript with the SAME `persistentHash` the
 * circuit uses.
 *
 * This is deliberately an independent implementation of the five `export pure circuit`s, not a
 * call into them. The contract exposes `pureCircuits.leafOf` and friends, and
 * `contract-agreement.test.ts` asserts these functions agree with them digest for digest. If it
 * were a thin wrapper the agreement would be vacuous; because it is independent, the comparison
 * actually pins the construction — tag, arity, operand order and the period encoding.
 *
 * Signature verified against compact-runtime 0.16.0:
 *   persistentHash<A>(rtType: CompactType<A>, value: A): Uint8Array
 */

import {
  CompactTypeBytes,
  CompactTypeMerkleTreePath,
  CompactTypeVector,
  leafHash,
  persistentHash,
  fromHex,
  toHex,
} from "@midnight-ntwrk/compact-runtime";
import type { AlignedValue } from "@midnight-ntwrk/onchain-runtime-v3";

import { DOMAIN_TAGS, MERKLE_DEPTH } from "./contract-surface.js";
import type { Hex32 } from "./types.js";

const BYTES32 = new CompactTypeBytes(32);
const VECTOR2 = new CompactTypeVector(2, BYTES32);
const VECTOR3 = new CompactTypeVector(3, BYTES32);
const VECTOR4 = new CompactTypeVector(4, BYTES32);

/** Runtime type of `MerkleTreePath<8, Bytes<32>>`. */
export const MERKLE_PATH_TYPE = new CompactTypeMerkleTreePath(MERKLE_DEPTH, BYTES32);

// ── conversions ─────────────────────────────────────────────────────────────────────────

export const hexToBytes = (h: Hex32): Uint8Array => fromHex(h);
export const bytesToHex = (b: Uint8Array): Hex32 => toHex(b);

/** Compact's `pad(32, "...")`: UTF-8 left-aligned, zero-filled to the right. */
export function pad32(s: string): Uint8Array {
  const utf8 = new TextEncoder().encode(s);
  if (utf8.length > 32) throw new Error(`pad32: "${s}" does not fit in 32 bytes`);
  const out = new Uint8Array(32);
  out.set(utf8);
  return out;
}

/** Like `pad32` but hex. */
export const padHex32 = (s: string): Hex32 => bytesToHex(pad32(s));

/**
 * The circuit's `(period as Field) as Bytes<32>` — how `nullifierOf` feeds a `Uint<64>` epoch
 * index into a `Vector<4, Bytes<32>>` hash.
 *
 * Reimplemented, not imported: compact-runtime's `convertFieldToBytes` (dist/casts.js) writes
 * the value LITTLE-ENDIAN, least significant byte first, zero-padded to the width. Mirroring it
 * by hand keeps this module independent of the contract, so the agreement test pins the
 * encoding too — an accidental big-endian flip on either side would surface as a digest
 * mismatch, not silently agree.
 */
export function periodBytes32(period: bigint): Uint8Array {
  if (period < 0n || period >= 2n ** 64n) {
    throw new RangeError(`periodBytes32: ${period} is outside the contract's Uint<64> domain`);
  }
  const out = new Uint8Array(32);
  let x = period;
  for (let i = 0; x > 0n; i += 1) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

/** Hex form of `periodBytes32`, for tests that compare hash operands. */
export const periodHex32 = (period: bigint): Hex32 => bytesToHex(periodBytes32(period));

/** Wraps a `Bytes<32>` as an `AlignedValue`, the shape `leafHash` expects. */
const alignedBytes32 = (b: Uint8Array): AlignedValue => ({
  value: BYTES32.toValue(b),
  alignment: BYTES32.alignment(),
});

/** Compact's Merkle leaf hash. What gets inserted, and what gets looked up. */
export const leafHashOf = (leaf: Hex32): AlignedValue => leafHash(alignedBytes32(hexToBytes(leaf)));

// ── the five pure circuits ──────────────────────────────────────────────────────────────

/**
 * `commitment = H(tag ‖ credSecret)` — the ONLY thing the employee hands to the issuer.
 * The org never sees `credentialSecret`, which is what keeps the nullifier unscannable by it.
 */
export function credCommitmentOf(credSecret: Hex32): Hex32 {
  return bytesToHex(persistentHash(VECTOR2, [pad32(DOMAIN_TAGS.credcomm), hexToBytes(credSecret)]));
}

/**
 * `leaf = H(tag ‖ orgId ‖ credCommitment)` — orgId lives INSIDE the leaf, binding it to an org.
 *
 * The second argument is the COMMITMENT, not the raw secret: that is what lets
 * `issueCredential` rebuild the leaf in-circuit from the orgId it just validated.
 */
export function leafOf(orgId: Hex32, credCommitment: Hex32): Hex32 {
  return bytesToHex(
    persistentHash(VECTOR3, [
      pad32(DOMAIN_TAGS.cred),
      hexToBytes(orgId),
      hexToBytes(credCommitment),
    ]),
  );
}

/** `reportId = H(tag ‖ evidenceHash ‖ personalSecret)` — the seal. Only the author knows it. */
export function reportIdOf(evidenceHash: Hex32, personalSecret: Hex32): Hex32 {
  return bytesToHex(
    persistentHash(VECTOR3, [
      pad32(DOMAIN_TAGS.report),
      hexToBytes(evidenceHash),
      hexToBytes(personalSecret),
    ]),
  );
}

/**
 * `nullifier = H(tag ‖ credSecret ‖ orgId ‖ periodBytes32(period))` — anti-spam, one report
 * per epoch. `period` is the epoch index the circuit's C0 pins to blockTime.
 *
 * Note the secret: the CREDENTIAL one, not the personal one. See `NULLIFIER_SECRET` in
 * contract-surface.ts for why that is the stronger choice.
 */
export function nullifierOf(credSecret: Hex32, orgId: Hex32, period: bigint): Hex32 {
  return bytesToHex(
    persistentHash(VECTOR4, [
      pad32(DOMAIN_TAGS.nullifier),
      hexToBytes(credSecret),
      hexToBytes(orgId),
      periodBytes32(period),
    ]),
  );
}

/** `authorship = H(tag ‖ personalSecret ‖ reportId ‖ prosecutorPk)` — the verifier binding. */
export function authorshipOf(
  personalSecret: Hex32,
  reportId: Hex32,
  prosecutorPk: Hex32,
): Hex32 {
  return bytesToHex(
    persistentHash(VECTOR4, [
      pad32(DOMAIN_TAGS.authorship),
      hexToBytes(personalSecret),
      hexToBytes(reportId),
      hexToBytes(prosecutorPk),
    ]),
  );
}
