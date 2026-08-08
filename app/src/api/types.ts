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
  readonly version: 2;
  /** Report whose authorship is being claimed. */
  readonly reportId: Hex32;
  /** sha-256 of the evidence. The file itself never leaves the machine. */
  readonly evidenceHash: Hex32;
  /** Public key of the target prosecutor — who this package is FOR. */
  readonly prosecutorPk: Hex32;
  /** `authorshipOf(reportSecret, reportId, prosecutorPk)`, precomputed. */
  readonly authorshipHash: Hex32;
  /**
   * `proveAuthorship` output. Demo build: the `authorshipHash`. Production:
   * proof bytes from the proof server, checked against the verifier key.
   */
  readonly proof: Hex32;
}

/**
 * Verdict of `verifyAuthorship`. Three states, not a boolean.
 *
 * A boolean forces every "I cannot tell" into one of the two answers, and the
 * safe-looking default is the wrong one. This build cannot check the ZK
 * binding between an authorship hash and the secret behind it (see
 * `VerificationResult.checks.proofVerified`), so the honest answer for a
 * well-formed package is `unavailable` — not `verified`.
 *
 * - `verified`    — positively established. Never returned while
 *                   `proofVerified` is `null`.
 * - `refuted`     — positively disproved: addressed to another key, or the
 *                   claimed records are not on the ledger. Both are decidable
 *                   from public data, so this verdict is real evidence.
 * - `unavailable` — nothing here contradicts the claim, and nothing here
 *                   establishes it either.
 */
export type AuthorshipVerdict = 'verified' | 'refuted' | 'unavailable';

/**
 * Result of `verifyAuthorship` (§3.1).
 *
 * The two headline fields are independent on purpose:
 *
 * - `verdict`  — what can be concluded about the claim. See `AuthorshipVerdict`.
 * - `onLedger` — whether that `authorshipHash` is actually published on-chain.
 *
 * They are separate because "the authorship IS on the chain, it is simply not
 * addressed to you" (the video's EMPLOYER ❌) is a different statement from
 * "there is no such authorship". Collapsing them erases the distinction that
 * carries the scene.
 *
 * ⚠️ SECURITY, and why `verdict` is not a boolean any more. The previous
 * version computed `ok = proofConsistent && designatedToVerifier` BEFORE
 * reading the ledger, and `proofConsistent` was `proof === authorshipHash` —
 * a tautology, since both fields come from whoever handed over the file.
 * Every input to that verdict was attacker-chosen, so an employer who scraped
 * a `reportId` and an `authorshipHash` off the public ledger and wrote their
 * own key into `prosecutorPk` got `ok: true` AND `onLedger: true`, and could
 * screenshot it as proof that the whistleblower revealed authorship to them.
 * Mixing the `reportId` of one report with the `authorshipHash` of another
 * passed just as well, because nothing bound the two together.
 */
export interface VerificationResult {
  readonly verdict: AuthorshipVerdict;
  readonly onLedger: boolean;
  /** Human-readable reason — what `verify-authorship.ts` (B4.5) prints. */
  readonly detail: string;
  /** Individual checks, for the UI panel. */
  readonly checks: {
    /**
     * Did the `proof` verify against the `proveAuthorship` verifier key?
     *
     * `null` — this build cannot answer. `exportKey` writes
     * `proof = authorshipHash` as a stand-in, so comparing the two proves
     * nothing about either. A real answer needs the proof bytes from the
     * proof server checked against the circuit's verifier key.
     */
    readonly proofVerified: boolean | null;
    /** `prosecutorPk` is the key of whoever is running the verification. */
    readonly designatedToVerifier: boolean;
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
