/**
 * The contract's four hashes, recomputed in TypeScript with the SAME `persistentHash` the
 * circuit uses.
 *
 * This is deliberately an independent implementation of the four `export pure circuit`s, not a
 * call into them. The contract exposes `pureCircuits.leafOf` and friends, and
 * `hardening.test.ts` asserts these functions agree with them digest for digest. If it were a
 * thin wrapper the agreement would be vacuous; because it is independent, the comparison
 * actually pins the construction — tag, arity and operand order.
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

/** Like `pad32` but hex — for `period`, which is `Bytes<32>` in circuit. */
export const padHex32 = (s: string): Hex32 => bytesToHex(pad32(s));

/** Wraps a `Bytes<32>` as an `AlignedValue`, the shape `leafHash` expects. */
const alignedBytes32 = (b: Uint8Array): AlignedValue => ({
  value: BYTES32.toValue(b),
  alignment: BYTES32.alignment(),
});

/** Compact's Merkle leaf hash. What gets inserted, and what gets looked up. */
export const leafHashOf = (leaf: Hex32): AlignedValue => leafHash(alignedBytes32(hexToBytes(leaf)));

// ── the four pure circuits ──────────────────────────────────────────────────────────────

/** `leaf = H(tag ‖ orgId ‖ credSecret)` — orgId lives INSIDE the leaf, binding it to an org. */
export function leafOf(orgId: Hex32, credSecret: Hex32): Hex32 {
  return bytesToHex(
    persistentHash(VECTOR3, [pad32(DOMAIN_TAGS.cred), hexToBytes(orgId), hexToBytes(credSecret)]),
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
 * `nullifier = H(tag ‖ credSecret ‖ orgId ‖ period)` — anti-spam, one report per period.
 *
 * Note the secret: the CREDENTIAL one, not the personal one. See `NULLIFIER_SECRET` in
 * contract-surface.ts for why that is the stronger choice and what it costs.
 */
export function nullifierOf(credSecret: Hex32, orgId: Hex32, period: Hex32): Hex32 {
  return bytesToHex(
    persistentHash(VECTOR4, [
      pad32(DOMAIN_TAGS.nullifier),
      hexToBytes(credSecret),
      hexToBytes(orgId),
      hexToBytes(period),
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
