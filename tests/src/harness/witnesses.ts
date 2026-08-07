/**
 * TypeScript bodies for the four witnesses `testigo.compact` declares.
 *
 * Shapes verified against `contracts/output/contract/index.d.ts`. A witness returns
 * `[newPrivateState, value]`.
 *
 * These belong to Block D on purpose. Block B owns `app/src/witnesses/` for the real dApp;
 * duplicating ~40 lines here keeps the suite from blocking on B's schedule. If the two ever
 * disagree, the contract is the arbiter, not either copy.
 */

import { MERKLE_DEPTH } from "./contract-surface.js";
import { credCommitmentOf, hexToBytes, leafOf } from "./crypto.js";
import type { Actor, Hex32 } from "./types.js";

/** What the reporter keeps on their own machine. Never leaves it. */
export interface TestigoPrivateState {
  readonly orgId: Uint8Array;
  readonly credentialSecret: Uint8Array;
  readonly personalSecret: Uint8Array;
  readonly evidenceHash: Uint8Array;
  /** Hex form of `orgId`, so `credentialPath` can derive its leaf without re-encoding. */
  readonly orgIdHex: Hex32;
  readonly credentialSecretHex: Hex32;
}

interface MerkleTreePathEntry {
  readonly sibling: { readonly field: bigint };
  /** snake_case is Compact's one stdlib inconsistency — do not "fix" it. */
  readonly goes_left: boolean;
}

/** The generated ledger wrapper, narrowed to what the witnesses touch. */
interface LedgerView {
  readonly credentials: {
    findPathForLeaf(leaf: Uint8Array): { path: MerkleTreePathEntry[] } | undefined;
  };
}

interface WitnessCtx {
  readonly ledger: LedgerView;
  readonly privateState: TestigoPrivateState;
}

/**
 * Siblings that cannot validate against any real root.
 *
 * `findPathForLeaf` returns `undefined` when the leaf is not in the tree — "you are not an
 * employee". A witness cannot return `undefined`, because the circuit expects the siblings
 * vector. So we hand back zeroes and let the in-circuit `checkRoot` reject them, which surfaces
 * as the contract's own "credential does not belong to the organization" assert rather than a
 * TypeScript crash. That is the right shape: an invalid witness must fail the constraint, not
 * the harness.
 */
const UNSATISFIABLE_SIBLINGS: MerkleTreePathEntry[] = Array.from(
  { length: MERKLE_DEPTH },
  () => ({ sibling: { field: 0n }, goes_left: false }),
);

export const witnesses = {
  credentialSecret: (ctx: WitnessCtx): [TestigoPrivateState, Uint8Array] => [
    ctx.privateState,
    ctx.privateState.credentialSecret,
  ],

  personalSecret: (ctx: WitnessCtx): [TestigoPrivateState, Uint8Array] => [
    ctx.privateState,
    ctx.privateState.personalSecret,
  ],

  evidenceHash: (ctx: WitnessCtx): [TestigoPrivateState, Uint8Array] => [
    ctx.privateState,
    ctx.privateState.evidenceHash,
  ],

  /**
   * Returns ONLY the siblings — the circuit derives the leaf itself from the public `orgId`,
   * so the witness cannot choose which leaf gets proven.
   *
   * It takes no argument, which means it has to work out its own leaf. That is why `orgId`
   * lives in the private state: `leafOf(orgId, credCommitmentOf(credSecret))` is the leaf this
   * reporter can legitimately produce a path for — the same commitment the issuer was handed.
   */
  credentialPath: (ctx: WitnessCtx): [TestigoPrivateState, MerkleTreePathEntry[]] => {
    const { orgIdHex, credentialSecretHex } = ctx.privateState;
    const leaf = leafOf(orgIdHex, credCommitmentOf(credentialSecretHex));
    const found = ctx.ledger.credentials.findPathForLeaf(hexToBytes(leaf));
    return [ctx.privateState, found?.path ?? UNSATISFIABLE_SIBLINGS];
  },
};

export function privateStateFor(a: Actor): TestigoPrivateState {
  return {
    orgId: hexToBytes(a.orgId),
    credentialSecret: hexToBytes(a.credentialSecret),
    personalSecret: hexToBytes(a.personalSecret),
    evidenceHash: hexToBytes(a.evidenceHash),
    orgIdHex: a.orgId,
    credentialSecretHex: a.credentialSecret,
  };
}
