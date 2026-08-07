/**
 * TypeScript bodies for the four witnesses the `.compact` declares.
 *
 * These belong to Block D on purpose. Block B owns `app/src/witnesses/` for the real dApp;
 * duplicating ~30 lines here keeps the test suite from blocking on B's schedule. If the two
 * ever disagree, the contract surface is the arbiter, not either copy.
 *
 * A witness returns `[newPrivateState, value]`.
 */

import { MERKLE_DEPTH } from "./contract-surface.js";
import type { Hex32 } from "./types.js";

/** What the reporter keeps on their own machine. Never leaves it. */
export interface TestigoPrivateState {
  readonly credencialSecret: Uint8Array;
  readonly secretPersonal: Uint8Array;
  readonly evidenciaHash: Uint8Array;
}

interface MerkleTreeDigest {
  readonly field: bigint;
}
interface MerkleTreePathEntry {
  readonly sibling: MerkleTreeDigest;
  /** snake_case is Compact's one stdlib inconsistency (§2.5) — do not "fix" it. */
  readonly goes_left: boolean;
}
interface MerkleTreePath {
  readonly leaf: Uint8Array;
  readonly path: readonly MerkleTreePathEntry[];
}

/** The generated ledger wrapper, narrowed to what the witnesses actually touch. */
interface LedgerView {
  readonly credenciales: {
    findPathForLeaf(leaf: Uint8Array): MerkleTreePath | undefined;
  };
}

interface WitnessCtx {
  readonly ledger: LedgerView;
  readonly privateState: TestigoPrivateState;
}

/**
 * A path that cannot validate against any real root.
 *
 * §2.1 flags handling `undefined` from `findPathForLeaf` as "you are not an employee". A
 * witness cannot return `undefined` — the circuit expects a `MerkleTreePath`. So we hand back
 * a zero path and let the in-circuit `checkRoot` reject it, which surfaces as the contract's
 * own "credencial invalida" assert rather than a TypeScript crash. That is the correct shape:
 * an invalid witness must fail the constraint, not the harness.
 */
function unsatisfiablePath(leaf: Uint8Array): MerkleTreePath {
  return {
    leaf,
    path: Array.from({ length: MERKLE_DEPTH }, () => ({
      sibling: { field: 0n },
      goes_left: false,
    })),
  };
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

  /** §2.1: the generated TS gives us `findPathForLeaf` for free — this is the whole witness. */
  credencialPath: (ctx: WitnessCtx, hoja: Uint8Array): [TestigoPrivateState, MerkleTreePath] => [
    ctx.privateState,
    ctx.ledger.credenciales.findPathForLeaf(hoja) ?? unsatisfiablePath(hoja),
  ],
};

export function privateStateFor(a: {
  credencialSecret: Hex32;
  secretPersonal: Hex32;
  evidenciaHash: Hex32;
}): TestigoPrivateState {
  const b = (h: Hex32): Uint8Array => Uint8Array.from(Buffer.from(h, "hex"));
  return {
    credencialSecret: b(a.credencialSecret),
    secretPersonal: b(a.secretPersonal),
    evidenciaHash: b(a.evidenciaHash),
  };
}
