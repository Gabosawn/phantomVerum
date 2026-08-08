/**
 * The `model` backend — an implementation of the spec, written from the spec.
 *
 * It is not a mock. Two things make it a real oracle:
 *
 *   1. Hashes come from compact-runtime's `persistentHash` (see crypto.ts) → byte-identical to
 *      the circuit's, and `contract-agreement.test.ts` asserts that against the contract's own
 *      `pureCircuits`.
 *   2. The credential tree is `StateBoundedMerkleTree`, the same structure Compact uses for
 *      `HistoricMerkleTree<8, Bytes<32>>` → real roots, real paths.
 *
 * What it does NOT do is run the constraints inside a ZK circuit. Only the `contract` backend
 * proves the `.compact` enforces them. Running both over one suite is the point.
 */

import { StateBoundedMerkleTree } from "@midnight-ntwrk/compact-runtime";

import { ASSERTS, EPOCH_DURATION, MERKLE_DEPTH } from "./contract-surface.js";
import {
  anchorOf,
  credCommitmentOf,
  leafHashOf,
  leafOf,
  nullifierOf,
  receiptOf,
  reportIdOf,
} from "./crypto.js";
import { AssertError, GENESIS_BLOCK_TIME } from "./types.js";
import type { Actor, Hex32, LedgerSnapshot, TestigoHarness } from "./types.js";

/** Compact's `assert(cond, msg)`. On the real network this fails at proof time, emitting no tx. */
function assert(condition: boolean, message: string): void {
  if (!condition) throw new AssertError(message);
}

export class ModelHarness implements TestigoHarness {
  readonly backend = "model" as const;

  private readonly organizations = new Map<Hex32, Hex32>();
  private readonly reports = new Set<Hex32>();
  private readonly nullifiers = new Set<Hex32>();
  private readonly authorships = new Set<Hex32>();

  private credentials = new StateBoundedMerkleTree(MERKLE_DEPTH);
  private nextLeaf = 0n;

  /** The chain clock, in Unix seconds. `report`'s C0 reads this, never the caller's word. */
  private blockTime = BigInt(GENESIS_BLOCK_TIME);

  private actor: Actor | undefined;

  as(actor: Actor): this {
    this.actor = actor;
    return this;
  }

  setBlockTime(secondsSinceEpoch: number): void {
    this.blockTime = BigInt(Math.floor(secondsSinceEpoch));
  }

  advanceTime(seconds: number): void {
    this.blockTime += BigInt(Math.floor(seconds));
  }

  private privateState(): Actor {
    if (this.actor === undefined) {
      throw new Error("harness: call .as(actor) before a circuit that takes witnesses");
    }
    return this.actor;
  }

  // ── registerOrganization ──────────────────────────────────────────────────────────────

  registerOrganization(orgId: Hex32, anchor: Hex32): void {
    assert(!this.organizations.has(orgId), ASSERTS.orgAlreadyRegistered);
    this.organizations.set(orgId, anchor);
  }

  /**
   * Mock issuer: no access control. Declared up front, consistent with "the issuer is a mock".
   *
   * Takes the COMMITMENT and builds the leaf HERE, from the same orgId the assert above just
   * validated — mirroring the contract's phantom-org fix. If the leaf arrived precomputed, the
   * assert would be decorative: one could pass a registered orgId while smuggling in the leaf
   * of an organization that never registered.
   */
  issueCredential(orgId: Hex32, credCommitment: Hex32): void {
    assert(this.organizations.has(orgId), ASSERTS.orgNotRegistered);
    // The anchor stops being decoration: only whoever holds the secret behind
    // it can fill the tree, which is a finite and unrecoverable resource.
    assert(
      this.organizations.get(orgId) === anchorOf(this.privateState().issuerSecret),
      ASSERTS.notTheIssuer,
    );
    const leaf = leafOf(orgId, credCommitment);
    this.credentials = this.credentials.update(this.nextLeaf, leafHashOf(leaf)).rehash();
    this.nextLeaf += 1n;
  }

  // ── report — the heart ────────────────────────────────────────────────────────────────

  report(orgId: Hex32, period: bigint): void {
    const state = this.privateState();

    // C0 — the period is NOT freely chosen by the caller: it must be the CURRENT epoch,
    //   start <= blockTime < start + duration.
    // Were it a free label, one credential would mint N distinct nullifiers by varying the
    // period and the anti-spam below would be worth nothing. Assert order mirrors the
    // contract: a future period fails the first message, a stale one the second.
    const windowStart = period * EPOCH_DURATION;
    assert(this.blockTime >= windowStart, ASSERTS.periodNotStarted);
    assert(this.blockTime < windowStart + EPOCH_DURATION, ASSERTS.periodAlreadyOver);

    // C1 — membership.
    //
    // The contract splits this in a way worth mirroring exactly. `credentialPath()` gets no
    // arguments, so the witness can only produce siblings for the leaf it derives from its OWN
    // private state — `leafOf(state.orgId, commitment)`. The circuit then hashes the leaf
    // itself from the PUBLIC argument — `leafOf(orgId, credCommitmentOf(credentialSecret))` —
    // and checks that leaf against those siblings.
    //
    // So a witness cannot lie about which org it is proving membership of: supply BETA's
    // siblings while claiming ACME and the recomputed root simply will not match. Rather than
    // reimplement merkleTreePathRoot to show that, the model states the equivalent condition —
    // for a collision-resistant tree, the root matches iff the witness leaf is in the tree AND
    // it is the same leaf the circuit derived.
    const commitment = credCommitmentOf(state.credentialSecret);
    const witnessLeaf = leafOf(state.orgId, commitment);
    const circuitLeaf = leafOf(orgId, commitment);
    const siblingsExist = this.credentials.findPathForLeaf(leafHashOf(witnessLeaf)) !== undefined;
    assert(siblingsExist && witnessLeaf === circuitLeaf, ASSERTS.credentialNotInOrg);

    // C2 — one report per (credential, epoch). Keyed on the CREDENTIAL secret, so a reporter
    // cannot mint extra nullifiers by picking a new personal secret — and NOT keyed on orgId,
    // which is caller-chosen: with free org registration that bought one extra report per
    // phantom org per epoch, and the guard was decorative.
    const nullifier = nullifierOf(state.credentialSecret, period);
    assert(!this.nullifiers.has(nullifier), ASSERTS.alreadyReportedThisPeriod);

    // Idempotency guard: `Set.insert` is idempotent, so without this assert a resubmission of
    // the same evidence would pass SILENTLY and the reporter would believe it had been sealed
    // twice.
    const reportId = reportIdOf(state.evidenceHash, state.personalSecret);
    assert(!this.reports.has(reportId), ASSERTS.reportAlreadySealed);

    this.reports.add(reportId);
    this.nullifiers.add(nullifier);
  }

  // ── revealAuthorship — the differentiator ─────────────────────────────────────────────

  revealAuthorship(reportId: Hex32): void {
    const state = this.privateState();

    // C1 — only the author knows the preimage of reportId.
    assert(
      reportIdOf(state.evidenceHash, state.personalSecret) === reportId,
      ASSERTS.notTheAuthor,
    );
    // C2 — the report exists.
    assert(this.reports.has(reportId), ASSERTS.reportDoesNotExist);

    // No secret in the preimage: the proof above is what establishes authorship,
    // so the prosecutor needs nothing secret to recompute this and look it up.
    const receipt = receiptOf(reportId, state.prosecutorNonce);
    assert(!this.authorships.has(receipt), ASSERTS.authorshipAlreadyRevealed);

    this.authorships.add(receipt);
  }

  // ── the only thing the world gets to see ──────────────────────────────────────────────

  ledger(): LedgerSnapshot {
    return {
      organizations: new Map(this.organizations),
      credentialsCount: Number(this.nextLeaf),
      reports: new Set(this.reports),
      nullifiers: new Set(this.nullifiers),
      authorships: new Set(this.authorships),
    };
  }
}
