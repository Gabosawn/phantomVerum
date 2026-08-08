/**
 * THE single TypeScript mirror of the six `export pure circuit`s in
 * `contracts/src/testigo.compact`.
 *
 * One implementation, two consumers:
 *
 *   - `tests/src/harness/crypto.ts`  — the differential backend, pinned by
 *     `contract-agreement.test.ts` against the compiled contract's own
 *     `pureCircuits` digest for digest.
 *   - `ui/shared/cripto.ts`          — the browser demo (ClienteMock).
 *
 * It uses compact-runtime's `persistentHash` — the SAME hash the circuit uses —
 * so these values are byte-identical to what the chain produces. Previously the
 * UI kept its own SHA-256 copy: same tags, same arity, different H, and pinned by
 * nothing. That divergence is exactly what this module removes.
 *
 * Browser-safe by construction:
 *   - `persistentHash` and `leafHash` run in WASM via `@midnight-ntwrk/onchain-runtime-v3`,
 *     whose `browser` export condition imports the `.wasm` directly (no Node builtins).
 *   - Hex conversion lives HERE on purpose: compact-runtime's `fromHex`/`toHex` use Node's
 *     `Buffer`, which would break the browser bundle. `pad32` uses `TextEncoder`.
 *
 * This is deliberately an independent reimplementation, not a call into the generated
 * contract — the agreement test must compare two implementations, or pinning would be
 * vacuous.
 */

import {
  CompactTypeBytes,
  CompactTypeMerkleTreePath,
  CompactTypeVector,
  type AlignedValue,
  leafHash,
  persistentHash,
} from "@midnight-ntwrk/compact-runtime";

/** 64 lowercase hex chars, no `0x` prefix. */
export type Hex32 = string;

/**
 * Credential tree depth (`HistoricMerkleTree<16, Bytes<32>>`).
 *
 * THE definition — `app/src/witnesses` imports this rather than repeating the
 * literal, because a witness that builds a path of the wrong length is rejected
 * by the circuit with an error that points nowhere near the mismatch.
 */
export const MERKLE_DEPTH = 16;

const BYTES32 = new CompactTypeBytes(32);
const VECTOR2 = new CompactTypeVector(2, BYTES32);
const VECTOR3 = new CompactTypeVector(3, BYTES32);

/** Runtime type of `MerkleTreePath<16, Bytes<32>>`. */
export const MERKLE_PATH_TYPE = new CompactTypeMerkleTreePath(MERKLE_DEPTH, BYTES32);

// ── Contract surface constants ──────────────────────────────────────────────

/**
 * `epochDuration()` in the contract: seconds per reporting epoch. Midnight's blockTime is
 * `secondsSinceEpoch` (Unix SECONDS), so 86400 = one day. `report`'s `period` argument is the
 * EPOCH INDEX — `floor(blockTime / EPOCH_DURATION)` — and the circuit's C0 pins it to the
 * chain clock: `period * duration <= blockTime < (period + 1) * duration`.
 */
export const EPOCH_DURATION = 86400n;

/**
 * Domain separation tags, in position 0 of every hash.
 *
 * Without them same-arity hashes collide across purposes: `reportIdOf` and `leafOf` are both
 * H(_, X, Y) over `Bytes<32>`, and so are `nullifierOf` and `receiptOf`. An attacker who gets
 * to choose one operand — and `orgId` is caller-chosen — could force a cross-domain collision.
 */
export const DOMAIN_TAGS = {
  cred: "phantomtrace:cred:v1",
  /** The commitment layer between `credentialSecret` and the leaf. */
  credcomm: "phantomtrace:credcomm:v1",
  report: "phantomtrace:report:v1",
  nullifier: "phantomtrace:nullifier:v1",
  /** The authorship receipt. Renamed from `authorship` when the secret left the preimage. */
  receipt: "phantomtrace:receipt:v1",
  /** The organization's issuer commitment, published as its `anchor`. */
  issuer: "phantomtrace:issuer:v1",
  /**
   * The organization's IDENTITY, derived from the same issuer secret (H-2).
   *
   * Distinct from `issuer` on purpose: `orgIdOf` and `anchorOf` hash the same preimage with
   * the same arity, so sharing a tag would make an org's id and its anchor the same 32 bytes.
   */
  org: "phantomtrace:org:v1",
} as const;

// ── conversions ─────────────────────────────────────────────────────────────

/** Browser-safe hex → bytes (compact-runtime's own `fromHex` uses Node `Buffer`). */
export function hexToBytes(hex: Hex32): Uint8Array {
  const limpio = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]*$/.test(limpio) || limpio.length % 2 !== 0) {
    throw new Error(`invalid hex: ${hex}`);
  }
  const bytes = new Uint8Array(limpio.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(limpio.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Browser-safe bytes → lowercase hex. */
export function bytesToHex(bytes: Uint8Array): Hex32 {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

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
 * index into a `Vector<3, Bytes<32>>` hash.
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

// ── the six pure circuits ───────────────────────────────────────────────────

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
 * `nullifier = H(tag ‖ credSecret ‖ periodBytes32(period))` — anti-spam, one report per epoch.
 * `period` is the epoch index the circuit's C0 pins to blockTime.
 *
 * `orgId` is deliberately NOT here. It is a caller-chosen public argument, and while C0 pins
 * `period` to the chain clock, nothing pinned `orgId` — so with free org registration the same
 * credential bought one report per phantom org per epoch. Org-independent is the only version
 * of this guard that holds.
 *
 * Note the secret: the CREDENTIAL one, not the personal one. That keeps anti-spam strong — one
 * credential is one report per period — and it is what keeps the issuer from scanning the
 * ledger to learn who reported: the issuer only ever held `credCommitmentOf(credSecret)`.
 */
export function nullifierOf(credSecret: Hex32, period: bigint): Hex32 {
  return bytesToHex(
    persistentHash(VECTOR3, [
      pad32(DOMAIN_TAGS.nullifier),
      hexToBytes(credSecret),
      periodBytes32(period),
    ]),
  );
}

/**
 * `receipt = H(tag ‖ reportId ‖ prosecutorNonce)` — the authorship receipt.
 *
 * No secret in the preimage, by design. The ZK proof behind `revealAuthorship` is what
 * establishes authorship; the hash only has to be recomputable by the prosecutor and by nobody
 * else. So the prosecutor is handed nothing secret — and cannot mint a receipt under a nonce of
 * their own choosing, which is what stops them from reselling the authorship.
 */
export function receiptOf(reportId: Hex32, prosecutorNonce: Hex32): Hex32 {
  return bytesToHex(
    persistentHash(VECTOR3, [
      pad32(DOMAIN_TAGS.receipt),
      hexToBytes(reportId),
      hexToBytes(prosecutorNonce),
    ]),
  );
}

/**
 * `anchor = H(tag ‖ issuerSecret)` — what `registerOrganization` publishes and
 * `issueCredential` checks against. Turns the org's anchor from decorative metadata into the
 * credential channel's access control.
 */
export function anchorOf(issuerSecret: Hex32): Hex32 {
  return bytesToHex(
    persistentHash(VECTOR2, [pad32(DOMAIN_TAGS.issuer), hexToBytes(issuerSecret)]),
  );
}

/**
 * `orgId = H(tag ‖ issuerSecret)` — an organization's id IS the fingerprint of its issuer
 * secret (H-2).
 *
 * `registerOrganization` used to accept any orgId, first-come and irreversible on an immutable
 * contract, so an attacker could take the label a real organization was about to use and deny
 * it permanently. Deriving the id removes the race: an id nobody can derive is an id nobody
 * can squat, and squatting your own is a no-op.
 */
export function orgIdOf(issuerSecret: Hex32): Hex32 {
  return bytesToHex(persistentHash(VECTOR2, [pad32(DOMAIN_TAGS.org), hexToBytes(issuerSecret)]));
}
