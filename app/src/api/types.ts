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
 * ⚠️ DECLARED LIMITATION (H-2, docs/03 §3.4): whoever holds this package can
 * verify the authorship **and also act as the author** — republish the
 * authorship towards another `prosecutorPk` and burn the slot. The
 * PER-REPORT secret bounds the damage to this single report (in v1, one
 * export compromised all of them). The real mitigation — a ZK proof to the
 * prosecutor instead of the package — is roadmap, and it is declared as such
 * in the deck. It is not presented as non-transferable.
 */
export interface AuthorshipKeyExport {
  readonly version: 2;
  /** Report whose authorship is being claimed. */
  readonly reportId: Hex32;
  /** sha-256 of the evidence. The file itself never leaves the machine. */
  readonly evidenceHash: Hex32;
  /** Secret of THIS report. It is the sensitive part of the package. */
  readonly reportSecret: Hex32;
  /** Public key of the target prosecutor. */
  readonly prosecutorPk: Hex32;
  /** `authorshipOf(reportSecret, reportId, prosecutorPk)`, precomputed. */
  readonly authorshipHash: Hex32;
}

/**
 * Result of `verifyAuthorship` (§3.1).
 *
 * The two fields are independent on purpose:
 *
 * - `ok`       — the arithmetic closes: the package's `reportSecret`
 *                reconstructs the declared `reportId` AND `authorshipHash`.
 *                100% local.
 * - `onLedger` — that `authorshipHash` is actually published on-chain.
 *
 * A package can be `ok: true, onLedger: false` (valid arithmetic but the
 * authorship was never published, or was published for ANOTHER prosecutor).
 * It is exactly the EMPLOYER ❌ case of the video: the hash produced with
 * their pk is not on the ledger. Collapsing them into a single boolean would
 * erase that distinction.
 */
export interface VerificationResult {
  readonly ok: boolean;
  readonly onLedger: boolean;
  /** Human-readable reason — what `verify-authorship.ts` (B4.5) prints. */
  readonly detail: string;
  /** Individual checks, for the UI panel. */
  readonly checks: {
    /** `reportIdOf(evidenceHash, reportSecret) == reportId` */
    readonly reportIdMatches: boolean;
    /** `authorshipOf(reportSecret, reportId, prosecutorPk) == authorshipHash` */
    readonly authorshipHashMatches: boolean;
    /** The `reportId` is sealed on the ledger. */
    readonly reportOnLedger: boolean;
    /** The `authorshipHash` is published on the ledger. */
    readonly authorshipOnLedger: boolean;
  };
}

// ── Parameters of the 5 methods of §3.1 ─────────────────────────────────

export interface RegisterOrganizationParams {
  readonly orgId: Bytes32Input;
  readonly anchor: Bytes32Input;
}

export interface IssueCredentialParams {
  readonly orgId: Bytes32Input;
  /**
   * `credCommitmentOf(credSecret)` — the commitment, NEVER the secret.
   *
   * SECURITY (H-4, §3.1): the client generates the secret and it never
   * leaves their machine. If the issuer had it, it could recompute
   * `nullifierOf(credSecret, orgId, period)` for any employee and learn who
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
  readonly prosecutorPk: Bytes32Input;
}

export interface RevealAuthorshipResult {
  readonly authorshipHash: Hex32;
  readonly tx: TxResult;
}
