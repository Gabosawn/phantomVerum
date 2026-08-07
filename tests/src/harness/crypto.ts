/**
 * The contract's pure hashes, computed with the SAME `persistentHash` the circuit uses.
 *
 * Encoding verified against Compact 0.5.1 / compact-runtime 0.16.0 and
 * `contracts/src/testigo.compact`.
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

/** Runtime type of `MerkleTreePath<8, Bytes<32>>`, to decode what the tree returns. */
export const MERKLE_PATH_TYPE = new CompactTypeMerkleTreePath(MERKLE_DEPTH, BYTES32);

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

export const padHex32 = (s: string): Hex32 => bytesToHex(pad32(s));

/**
 * Compact `(periodo as Field) as Bytes<32>` — little-endian field encoding into 32 bytes.
 * Verified against `pureCircuits.nullifierDe`.
 */
export function fieldAsBytes32(n: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let x = n;
  for (let i = 0; i < 32; i++) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

const alignedBytes32 = (b: Uint8Array): AlignedValue => ({
  value: BYTES32.toValue(b),
  alignment: BYTES32.alignment(),
});

/** Compact's Merkle leaf hash. What gets inserted, and what gets looked up. */
export const hojaHash = (hoja: Hex32): AlignedValue => leafHash(alignedBytes32(hexToBytes(hoja)));

/** `credCommitment = H(tag ‖ credSecret)` — only value the issuer ever sees. */
export function credCommitmentDe(credencialSecret: Hex32): Hex32 {
  return bytesToHex(
    persistentHash(VECTOR2, [pad32(DOMAIN_TAGS.credcomm), hexToBytes(credencialSecret)]),
  );
}

/** `hoja = H(tag ‖ orgId ‖ credCommitment)` — orgId lives INSIDE the leaf. */
export function hojaDe(orgId: Hex32, credCommitment: Hex32): Hex32 {
  return bytesToHex(
    persistentHash(VECTOR3, [pad32(DOMAIN_TAGS.cred), hexToBytes(orgId), hexToBytes(credCommitment)]),
  );
}

/** Convenience: leaf for an employee of `orgId`. */
export function hojaPara(orgId: Hex32, credencialSecret: Hex32): Hex32 {
  return hojaDe(orgId, credCommitmentDe(credencialSecret));
}

/** `denunciaId = H(tag ‖ evidenciaHash ‖ secret)` — the seal. */
export function denunciaIdDe(evidenciaHash: Hex32, secret: Hex32): Hex32 {
  return bytesToHex(
    persistentHash(VECTOR3, [
      pad32(DOMAIN_TAGS.denuncia),
      hexToBytes(evidenciaHash),
      hexToBytes(secret),
    ]),
  );
}

/** `nullifier = H(tag ‖ credSecret ‖ orgId ‖ fieldAsBytes(periodo))` — anti-spam. */
export function nullifierDe(credencialSecret: Hex32, orgId: Hex32, periodo: bigint): Hex32 {
  return bytesToHex(
    persistentHash(VECTOR4, [
      pad32(DOMAIN_TAGS.nullifier),
      hexToBytes(credencialSecret),
      hexToBytes(orgId),
      fieldAsBytes32(periodo),
    ]),
  );
}

/** `autoria = H(tag ‖ secret ‖ denunciaId ‖ fiscalPk)` — designated verifier binding. */
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
