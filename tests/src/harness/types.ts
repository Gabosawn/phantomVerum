/**
 * The seam. Tests depend on THIS ONLY — never on a concrete backend.
 *
 * Hard rule: if a test needs to know which backend is running, the test is written wrong.
 * The one legitimate exception is printing the backend name in a log line.
 */

/** 64 hex chars, no `0x`. */
export type Hex32 = string;

export type BackendName = "model" | "contract";

/**
 * The block time both backends boot with: 2026-08-07T00:00:00Z, in Unix SECONDS — the same
 * fixed instant `contracts/test/harness.mjs` uses. Deterministic on purpose: `report`'s C0
 * compares the epoch index against this clock, and a suite keyed to `Date.now()` would assert
 * different things on different days.
 *
 * It is exactly divisible by `EPOCH_DURATION`, so the harness starts on an epoch BOUNDARY.
 * That is deliberate too: it makes `blockTimeGte(windowStart)` — the `>=`, not `>` — load-
 * bearing from the very first `report` call.
 */
export const GENESIS_BLOCK_TIME = 1786147200;

/**
 * An actor and their private state.
 *
 * `orgId` is here because the contract's `credentialPath()` witness takes no argument: it has
 * to work out which leaf to find a path for on its own, which means the org has to be part of
 * what the reporter keeps locally. That matches §3.2's `secrets/denunciante.json`, which
 * persists `orgId` alongside the secrets.
 *
 * Keeping it in the actor is also what makes the "an employee of another org cannot report
 * here" case meaningful: the witness produces a path for `leafOf(actor.orgId, commitment)`
 * while the circuit hashes `leafOf(argOrgId, commitment)`. If those differ, the root cannot
 * match.
 */
export interface Actor {
  readonly name: string;
  readonly orgId: Hex32;
  readonly credentialSecret: Hex32;
  readonly personalSecret: Hex32;
  readonly evidenceHash: Hex32;
  /** The secret behind the org's published anchor. Only an ISSUER needs a real one. */
  readonly issuerSecret: Hex32;
  /** The nonce the prosecutor sent for the pending reveal. Never on-chain. */
  readonly prosecutorNonce: Hex32;
}

/**
 * Everything a public-ledger observer can see, and everything the two backends are required to
 * agree on. `contract-agreement.test.ts` compares whole snapshots after a full scenario.
 *
 * The credential tree's ROOT DIGEST is deliberately absent. The contract inserts leaves through
 * the on-chain VM's state ops (`StateValue.newCell(leafHash(leaf)).encode()`), while the model
 * drives `StateBoundedMerkleTree.update()` directly. The two agree on membership — which leaf is
 * provably in the tree — but reach different internal root digests, so the root is not a
 * cross-backend fact and putting it here would make every snapshot comparison fail for a reason
 * that means nothing. `contract-agreement.test.ts` pins that divergence as a named, tested fact
 * rather than leaving it to be rediscovered.
 *
 * Nothing in the product depends on the root's value: the app's ledger reader returns counts
 * and hashes, and `anchor` is a separate per-org marker.
 */
export interface LedgerSnapshot {
  readonly organizations: ReadonlyMap<Hex32, Hex32>;
  /** Number of credentials issued into the global tree. */
  readonly credentialsCount: number;
  readonly reports: ReadonlySet<Hex32>;
  readonly nullifiers: ReadonlySet<Hex32>;
  readonly authorships: ReadonlySet<Hex32>;
}

/** A failed circuit `assert`. On the real network this fails at proof time, emitting no tx. */
export class AssertError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssertError";
  }
}

/**
 * The interface both backends implement.
 *
 * Synchronous on purpose: compact-runtime circuits are, and the local simulator touches
 * neither the network nor a proof server.
 */
export interface TestigoHarness {
  readonly backend: BackendName;

  /** Sets the private state for the next circuit call. Returns `this` so calls can chain. */
  as(actor: Actor): TestigoHarness;

  /**
   * The clock `report`'s C0 checks the period against. Both backends start at
   * `GENESIS_BLOCK_TIME`; the harness owns the clock the way the chain owns blockTime — a
   * caller can pick any `period` they like, but only the one matching THIS value passes.
   */
  setBlockTime(secondsSinceEpoch: number): void;
  /** Moves the clock forward. `advanceTime(Number(EPOCH_DURATION))` = next epoch. */
  advanceTime(seconds: number): void;

  registerOrganization(orgId: Hex32, anchor: Hex32): void;
  /**
   * Inserts the employee's credential into the global tree. Mock issuer, no access control.
   * Takes the COMMITMENT (`credCommitmentOf(credSecret)`) — the leaf is built in-circuit from
   * the validated `orgId`, so a foreign-org leaf cannot be smuggled in (the phantom-org fix).
   */
  issueCredential(orgId: Hex32, credCommitment: Hex32): void;
  /** `period` is the epoch index (`Uint<64>` → `bigint`), forced by C0 to be the current one. */
  report(orgId: Hex32, period: bigint): void;
  revealAuthorship(reportId: Hex32): void;

  ledger(): LedgerSnapshot;
}
