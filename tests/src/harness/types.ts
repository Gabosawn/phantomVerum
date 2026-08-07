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
 * An actor and their private state.
 *
 * `orgId` is here because the contract's `credentialPath()` witness takes no argument: it has
 * to work out which leaf to find a path for on its own, which means the org has to be part of
 * what the reporter keeps locally. That matches §3.2's `secrets/denunciante.json`, which
 * persists `orgId` alongside the secrets.
 *
 * Keeping it in the actor is also what makes the "an employee of another org cannot report
 * here" case meaningful: the witness produces a path for `leafOf(actor.orgId, cred)` while the
 * circuit hashes `leafOf(argOrgId, cred)`. If those differ, the root cannot match.
 */
export interface Actor {
  readonly name: string;
  readonly orgId: Hex32;
  readonly credentialSecret: Hex32;
  readonly personalSecret: Hex32;
  readonly evidenceHash: Hex32;
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
 * Nothing in the product depends on the root's value: the app's `leerEstadoLedger` returns
 * counts and hashes, and `anchor` is a separate per-org marker.
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

  registerOrganization(orgId: Hex32, anchor: Hex32): void;
  /** Inserts the employee's leaf into the global tree. Mock issuer, no access control. */
  issueCredential(orgId: Hex32, leaf: Hex32): void;
  /** `period` is a coarse readable epoch ("2026-08"); padded to `Bytes<32>` internally. */
  report(orgId: Hex32, period: string): void;
  revealAuthorship(reportId: Hex32, prosecutorPk: Hex32): void;

  ledger(): LedgerSnapshot;
}
