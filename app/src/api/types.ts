/**
 * B3 — Types of the Testigo API.
 *
 * The shapes here are FROZEN in `docs/03-plan-ejecucion.md` §3.1 and §3.2:
 * `ui/` (block C) and `tests/` (block D) mock against them. If anything
 * changes, every block is notified — nothing changes silently.
 *
 * Boundary convention (same as B2): everything that ENTERS accepts
 * `Uint8Array | Hex32` and is normalized with `asBytes32`; everything that
 * LEAVES is `Hex32` (64 lowercase hex chars, no `0x`). A single format in
 * the JSONs crossing machines.
 */
import type { Hex32 } from '../witnesses/hex.js';

export type { Hex32 };

/** Either of the two representations of a 32-byte value. */
export type Bytes32Input = Uint8Array | Hex32;

/**
 * Result of a transaction.
 *
 * `txId` and `blockHeight` are the fields frozen in §3.1. The other two are
 * additive and optional: they do not break anyone already mocking the type.
 */
export interface TxResult {
  /** Transaction identifier. */
  readonly txId: string;
  /** Height of the block that included it. Absent while unknown. */
  readonly blockHeight?: number;
  /**
   * `true` when the tx did NOT touch a real chain: it was produced by the
   * simulator executor. Lets the CLI and the UI avoid showing a fake txId as
   * if it were verifiable in an explorer.
   */
  readonly simulated?: boolean;
  /** Status reported by the chain (`SucceedEntirely`, etc.). */
  readonly status?: string;
}

/**
 * Public state of the contract, as the UI panel consumes it.
 *
 * Frozen in §3.1: `organizations` and `nullifiers` are COUNTS (not lists) on
 * purpose. Listing the nullifiers would add nothing to the demo, and
 * publishing them in a UI invites correlating them with the reports.
 */
export interface LedgerState {
  /** Number of registered organizations. */
  readonly organizations: number;
  /** The `reportId`s sealed on-chain. */
  readonly reports: Hex32[];
  /** Number of burned nullifiers. */
  readonly nullifiers: number;
  /** The `authorshipHash`es revealed on-chain. */
  readonly authorships: Hex32[];
  /**
   * Occupied leaves in the credential tree (`firstFree`). Additive: the
   * panel uses it to show "N credentials issued" without exposing which.
   */
  readonly issuedCredentials?: number;
}

/**
 * Package the whistleblower hands to the prosecutor (§3.2, v2 format).
 *
 * **The `reportSecret` is NOT in here.** It never leaves the whistleblower's
 * machine. What travels instead is `proof`: the output of the
 * `proveAuthorship` circuit (`contracts/src/testigo.compact` §4.4), which
 * demonstrates knowledge of a secret satisfying
 * `reportIdOf(evidenceHash, secret) == reportId` without revealing it.
 *
 * That is what makes the package non-usable as an authorship credential:
 * holding it does not let you run `revealAuthorship`, because that circuit
 * needs the secret as a witness and the secret is not in the file.
 *
 * ⚠️ Residual limitation, declared: in the demo build `proof` is the
 * `authorshipHash` itself, not proof bytes from the proof server. That is
 * enough for the video scene (an intercepted package does not verify against
 * the interceptor's key) but it does NOT bind the bearer to the author: a
 * copier who saw the pair on-chain can replay it. Closing that requires
 * `/prove` and `/check` against the `proveAuthorship` verifier key. The
 * secret-free format is the part that is real today; the ZK binding is not.
 */
export interface AuthorshipKeyExport {
  readonly version: 3;
  readonly reportId: Hex32;
  /** `receiptOf(reportId, prosecutorNonce)` — public, it is on the ledger. */
  readonly receipt: Hex32;
}

/**
 * Result of `verifyAuthorship` (§3.1).
 *
 * The two headline fields are independent on purpose:
 *
 * - `ok`       — the package is internally consistent AND designated to the
 *                key of whoever is verifying. 100% local.
 * - `onLedger` — that `authorshipHash` is actually published on-chain.
 *
 * A package can be `ok: true, onLedger: false` (consistent and addressed to
 * me, but the authorship was never published) and — the video's EMPLOYER ❌ —
 * `ok: false, onLedger: true`: the authorship IS on the chain, it is simply
 * not addressed to the employer's key. Collapsing them into a single boolean
 * would erase that distinction, which is the whole point of the scene.
 */
export interface VerificationResult {
  readonly ok: boolean;
  readonly onLedger: boolean;
  /** Human-readable reason — what `verify-authorship.ts` (B4.5) prints. */
  readonly detail: string;
  /** Individual checks, for the UI panel. */
  readonly checks: {
    /** `receiptOf(reportId, myNonce)` reproduces the receipt in the package. */
    readonly designatedToVerifier: boolean;
    /** That RECOMPUTED receipt is published on the ledger. */
    readonly receiptOnLedger: boolean;
    /** The `reportId` is sealed on the ledger. */
    readonly reportOnLedger: boolean;
  };
}

// ── Parameters of the 5 methods of §3.1 ─────────────────────────────────

export interface RegisterOrganizationParams {
  readonly orgId: Bytes32Input;
  /**
   * The org's issuer secret. The published `anchor` is `anchorOf(issuerSecret)`,
   * derived here rather than accepted raw: registering an anchor whose secret
   * you do not hold would produce an org that can never issue anything.
   */
  readonly issuerSecret: Bytes32Input;
}

export interface IssueCredentialParams {
  readonly orgId: Bytes32Input;
  /**
   * The same issuer secret used to register the org. `issueCredential`
   * asserts `organizations.lookup(orgId) == anchorOf(issuerSecret)`, which is
   * what keeps the credential tree — finite and unrecoverable — from being
   * filled by anyone who feels like it.
   */
  readonly issuerSecret: Bytes32Input;
  /**
   * `credCommitmentOf(credSecret)` — the commitment, NEVER the secret.
   *
   * SECURITY (H-4, §3.1): the client generates the secret and it never
   * leaves their machine. If the issuer had it, it could recompute
   * `nullifierOf(credSecret, period)` for any employee and learn who
   * reported in each period.
   */
  readonly credCommitment: Bytes32Input;
}

export interface IssueCredentialResult {
  /** Index of the leaf just inserted into the global tree. */
  readonly leafIndex: number;
  readonly tx: TxResult;
}

export interface ReportParams {
  readonly orgId: Bytes32Input;
  /**
   * Epoch index (`Uint<64>`), NOT the string "2026-08".
   *
   * The contract binds it to the chain clock with
   * `blockTimeGte`/`blockTimeLt`, so **only the current epoch is valid**.
   * Compute it with `currentEpoch()` from `witnesses/epoch.ts` — SECONDS,
   * not milliseconds.
   */
  readonly period: bigint;
  /**
   * The evidence. Hashed LOCALLY; the file never leaves the machine.
   *
   * `Uint8Array` is the shape frozen in §3.1. The `{filePath}` variant is
   * additive: it lets the CLI (B4.3) stream-hash a large PDF without
   * loading it whole into memory.
   */
  readonly evidence: Uint8Array | { readonly filePath: string };
}

export interface ReportResult {
  readonly reportId: Hex32;
  readonly nullifier: Hex32;
  /**
   * Fresh secret of this report. Already persisted in the local store
   * BEFORE the tx was submitted (see `TestigoApi.report`): it is returned
   * for display/export, not for the caller to take charge of storing it.
   */
  readonly reportSecret: Hex32;
  readonly evidenceHash: Hex32;
  readonly tx: TxResult;
}

export interface RevealAuthorshipParams {
  readonly reportId: Bytes32Input;
  /**
   * The nonce the prosecutor generated and sent over off-chain.
   *
   * It replaced `prosecutorPk` when the receipt stopped carrying the personal
   * secret. It is not a secret of ours, but it must not reach the transcript:
   * a public nonce would let anyone who scraped the pair (reportId, nonce)
   * recompute the receipt and pass themselves off as its addressee. So it
   * travels as a witness, staged with `stageNonce()`.
   */
  readonly prosecutorNonce: Bytes32Input;
}

export interface RevealAuthorshipResult {
  /** `receiptOf(reportId, prosecutorNonce)` — what landed in `authorships`. */
  readonly receipt: Hex32;
  readonly tx: TxResult;
}
