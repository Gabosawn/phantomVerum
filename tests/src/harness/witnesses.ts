/**
 * TypeScript bodies for the four witnesses the `.compact` declares.
 *
 * Mirrors `app/src/witnesses/index.ts`: `credencialPath` returns only the siblings,
 * and needs `orgId` in private state to locate the leaf.
 */

import { MERKLE_DEPTH } from "./contract-surface.js";
import { bytesToHex, credCommitmentDe, hexToBytes, hojaDe } from "./crypto.js";
import type { Hex32 } from "./types.js";

/** What the reporter keeps on their own machine. Never leaves it. */
export interface TestigoPrivateState {
  readonly credencialSecret: Uint8Array;
  readonly secretPersonal: Uint8Array;
  readonly evidenciaHash: Uint8Array;
  /** Org bound to the credential — must match the public `orgId` of `denunciar`. */
  readonly orgId: Uint8Array;
}

interface MerkleTreeDigest {
  readonly field: bigint;
}
interface MerkleTreePathEntry {
  readonly sibling: MerkleTreeDigest;
  /** snake_case is Compact's stdlib spelling — do not "fix" it. */
  readonly goes_left: boolean;
}
interface MerkleTreePath {
  readonly leaf: Uint8Array;
  readonly path: readonly MerkleTreePathEntry[];
}

interface LedgerView {
  readonly credenciales: {
    findPathForLeaf(leaf: Uint8Array): MerkleTreePath | undefined;
  };
}

interface WitnessCtx {
  readonly ledger: LedgerView;
  readonly privateState: TestigoPrivateState;
}

function unsatisfiableHermanos(): MerkleTreePathEntry[] {
  return Array.from({ length: MERKLE_DEPTH }, () => ({
    sibling: { field: 0n },
    goes_left: false,
  }));
}

export const witnesses = {
  credencialSecret: (ctx: WitnessCtx): [TestigoPrivateState, Uint8Array] => [
    ctx.privateState,
    ctx.privateState.credencialSecret,
  ],

  secretPersonal: (ctx: WitnessCtx): [TestigoPrivateState, Uint8Array] => [
    ctx.privateState,
    ctx.privateState.secretPersonal,
  ],

  evidenciaHash: (ctx: WitnessCtx): [TestigoPrivateState, Uint8Array] => [
    ctx.privateState,
    ctx.privateState.evidenciaHash,
  ],

  /**
   * Returns only the siblings. The circuit rebuilds the leaf from the public `orgId`
   * + `credCommitmentDe(cred)`, so the witness cannot lie about which org it belongs to.
   */
  credencialPath: (ctx: WitnessCtx): [TestigoPrivateState, MerkleTreePathEntry[]] => {
    const { credencialSecret, orgId } = ctx.privateState;
    const hoja = hexToBytes(
      hojaDe(bytesToHex(orgId), credCommitmentDe(bytesToHex(credencialSecret))),
    );
    const camino = ctx.ledger.credenciales.findPathForLeaf(hoja);
    return [ctx.privateState, camino !== undefined ? [...camino.path] : unsatisfiableHermanos()];
  },
};

export function privateStateFor(
  a: {
    credencialSecret: Hex32;
    secretPersonal: Hex32;
    evidenciaHash: Hex32;
  },
  orgId: Hex32 = "00".repeat(32),
): TestigoPrivateState {
  const b = (h: Hex32): Uint8Array => Uint8Array.from(Buffer.from(h, "hex"));
  return {
    credencialSecret: b(a.credencialSecret),
    secretPersonal: b(a.secretPersonal),
    evidenciaHash: b(a.evidenciaHash),
    orgId: b(orgId),
  };
}
