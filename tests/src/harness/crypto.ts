/**
 * The contract's four hashes, computed with the SAME `persistentHash` the circuit uses.
 *
 * This is what makes the `model` backend a real oracle rather than a mock: the bytes coming
 * out of here are byte-identical to what the compiled `.compact` produces, because it is the
 * same implementation (`@midnight-ntwrk/compact-runtime`), not a reimplementation of it.
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

/** Runtime type of `MerkleTreePath<8, Bytes<32>>`, to decode what the tree returns. */
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

/** Like `pad32` but hex — for `periodo`, which is `Bytes<32>` in circuit (§2.5). */
export const padHex32 = (s: string): Hex32 => bytesToHex(pad32(s));

/** Wraps a `Bytes<32>` as an `AlignedValue`, the shape `leafHash` expects. */
const alignedBytes32 = (b: Uint8Array): AlignedValue => ({
  value: BYTES32.toValue(b),
  alignment: BYTES32.alignment(),
});

/** Compact's Merkle leaf hash. What gets inserted, and what gets looked up. */
export const hojaHash = (hoja: Hex32): AlignedValue => leafHash(alignedBytes32(hexToBytes(hoja)));

// ── the four pure circuits (§2.4) ───────────────────────────────────────────────────────

/** `hoja = H(tag ‖ orgId ‖ credencialSecret)` — §2.1: orgId lives INSIDE the leaf. */
export function hojaDe(orgId: Hex32, credencialSecret: Hex32): Hex32 {
  return bytesToHex(
    persistentHash(VECTOR3, [pad32(DOMAIN_TAGS.hoja), hexToBytes(orgId), hexToBytes(credencialSecret)]),
  );
}

/** `denunciaId = H(tag ‖ evidenciaHash ‖ secret)` — the seal. Only the author knows the preimage. */
export function denunciaIdDe(evidenciaHash: Hex32, secret: Hex32): Hex32 {
  return bytesToHex(
    persistentHash(VECTOR3, [pad32(DOMAIN_TAGS.denuncia), hexToBytes(evidenciaHash), hexToBytes(secret)]),
  );
}

/** `nullifier = H(tag ‖ secret ‖ orgId ‖ periodo)` — anti-spam, one report per period. */
export function nullifierDe(secret: Hex32, orgId: Hex32, periodo: Hex32): Hex32 {
  return bytesToHex(
    persistentHash(VECTOR4, [
      pad32(DOMAIN_TAGS.nullifier),
      hexToBytes(secret),
      hexToBytes(orgId),
      hexToBytes(periodo),
    ]),
  );
}

/** `autoria = H(tag ‖ secret ‖ denunciaId ‖ fiscalPk)` — the designated verifier binding. */
export function autoriaDe(secret: Hex32, denunciaId: Hex32, fiscalPk: Hex32): Hex32 {
  return bytesToHex(
    persistentHash(VECTOR4, [
      pad32(DOMAIN_TAGS.autoria),
      hexToBytes(secret),
      hexToBytes(denunciaId),
      hexToBytes(fiscalPk),
    ]),
  );
}
