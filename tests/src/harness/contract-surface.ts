/**
 * CONTRACT SURFACE — mirrors `contracts/src/testigo.compact`.
 *
 * Reconciled against the real contract on 2026-08-07, after Block A landed, and again after the
 * two halves of the merge were unified into a single contract. Before that this file held Block
 * D's assumption of the surface; now it holds the surface itself, transcribed from the compiled
 * artifact. The `.compact` is the authority — if it changes, this file follows, and the test
 * cases keep working untouched.
 *
 * Everything here is verified against `contracts/output/contract/index.d.ts`.
 */

// The three crypto-facing constants live with the crypto in `@phantomtrace/shared` (the single
// implementation the agreement test pins). Re-exported so every existing import site keeps its
// path.
export {
  EPOCH_DURATION,
  MERKLE_DEPTH,
  DOMAIN_TAGS,
} from "@phantomtrace/shared/crypto";

/**
 * The anonymity floor H-1 enforces: `report` refuses to run while the credential tree holds
 * fewer credentials than this — proving membership in a tree of one names exactly one person.
 *
 * Mirrors `minAnonymitySet()` in `contracts/src/testigo.compact` (currently `8`). Read straight
 * off the compiled `pureCircuits` by `contract-agreement.test.ts`, so a change in the contract
 * drifts THIS constant rather than silently diverging the model.
 */
export const MIN_ANONYMITY_SET = 8;

/** Public ledger fields. */
export const LEDGER = {
  organizations: "organizations",
  /** Global `HistoricMerkleTree<16, Bytes<32>>` — orgId lives inside each leaf. */
  credentials: "credentials",
  reports: "reports",
  nullifiers: "nullifiers",
  authorships: "authorships",
} as const;

/** Exported impure circuits. */
export const CIRCUITS = {
  registerOrganization: "registerOrganization",
  /**
   * Takes `(orgId, credCommitment)` — the COMMITMENT `credCommitmentOf(credSecret)`, not a
   * precomputed leaf. The leaf is built IN-CIRCUIT from the orgId that was just validated
   * against `organizations`, which closes the phantom-org hole: with a caller-supplied leaf one
   * could pass a registered orgId and smuggle in `leafOf(neverRegisteredOrg, …)`, then report
   * on behalf of that phantom org. It also means the issuer never sees `credentialSecret`.
   */
  issueCredential: "issueCredential",
  /** Takes `(orgId, period)` where `period` is a `Uint<64>` epoch index — `bigint` in TS. */
  report: "report",
  revealAuthorship: "revealAuthorship",
} as const;

/** `export pure circuit`s — the app recomputes hashes locally, with no proof server. */
export const PURE_CIRCUITS = {
  /** `H(credcommTag ‖ credSecret)` — what the employee hands to the issuer. */
  credCommitmentOf: "credCommitmentOf",
  /** `H(credTag ‖ orgId ‖ credCommitment)` — takes the COMMITMENT, not the raw secret. */
  leafOf: "leafOf",
  reportIdOf: "reportIdOf",
  /** `H(nullifierTag ‖ sec ‖ (period as Field) as Bytes<32>)` — period is `bigint`. */
  nullifierOf: "nullifierOf",
  /** `H(receiptTag ‖ reportId ‖ prosecutorNonce)` — no secret in the preimage. */
  receiptOf: "receiptOf",
  /** `H(issuerTag ‖ issuerSecret)` — the org's published anchor. */
  anchorOf: "anchorOf",
} as const;

/** Witnesses declared in Compact, implemented in TypeScript. */
export const WITNESSES = {
  credentialSecret: "credentialSecret",
  /** Takes NO argument and returns only the siblings — see `witnesses.ts`. */
  credentialPath: "credentialPath",
  personalSecret: "personalSecret",
  evidenceHash: "evidenceHash",
  /** Checked by `issueCredential` against the org's published anchor. */
  issuerSecret: "issuerSecret",
  /** Kept out of the transcript on purpose — see `receiptOf`. */
  prosecutorNonce: "prosecutorNonce",
} as const;

/** `assert` messages, copied verbatim from the contract. Tests match on these. */
export const ASSERTS = {
  /** H-2 — `registerOrganization` asserts the id is the fingerprint of the caller's secret. */
  orgIdNotDerived: "orgId is not derived from this issuer secret",
  /** H-2 — `registerOrganization` asserts the anchor commits to the caller's secret. */
  anchorNotCommitted: "anchor does not commit to this issuer secret",
  orgAlreadyRegistered: "organization already registered",
  orgNotRegistered: "organization not registered",
  /** C0 — `period` is ahead of the chain clock: `blockTime < period * duration`. */
  periodNotStarted: "period not started yet",
  /** C0 — `period` is stale: `blockTime >= (period + 1) * duration`. */
  periodAlreadyOver: "period already over",
  /** C0b — H-1: `report` refuses while the anonymity set is below the floor. */
  anonymitySetTooSmall: "anonymity set too small — not enough credentials issued yet",
  credentialNotInOrg: "credential does not belong to the organization",
  alreadyReportedThisPeriod: "already reported this period",
  reportAlreadySealed: "report already sealed",
  notTheAuthor: "not the author",
  reportDoesNotExist: "report does not exist",
  notTheIssuer: "not the issuer of this organization",
  authorshipAlreadyRevealed: "authorship already revealed to this prosecutor",
} as const;

/**
 * Which secret feeds the nullifier — RESOLVED, and worth knowing why.
 *
 * `01-arquitectura.md` contradicted itself: §4.2's pseudocode fed it `personalSecret`, §5
 * (Option A) said `credencialSecret`. Block D's model originally implemented §4.2. The
 * contract chose §5 — `report()` calls `nullifierOf(cred, period)` — so the model was
 * changed to match.
 *
 * §5 is the better call, and the split matters:
 *
 *   - the NULLIFIER uses `credentialSecret`, so anti-spam is strong: one credential is one
 *     report per period. With `personalSecret` the reporter picks their own value and can mint
 *     N nullifiers from one credential, which is the weakness §5 attributes to Option B.
 *   - the REPORT ID uses `personalSecret`, which the mock issuer never sees. That is what
 *     keeps authorship unforgeable by the org that issued the credential.
 *
 * The unified contract goes one step further on the residual risk the old surface carried:
 * `issueCredential` now receives `credCommitmentOf(credSecret)` instead of anything derived
 * directly from the secret, so a well-behaved issuer never holds `credentialSecret` at all.
 * The employee generates it, hands over the commitment, and only they can ever compute
 * `nullifierOf(cred, period)` — the issuer cannot scan the ledger to see who reported.
 * (A MALICIOUS mock issuer could still ask for the secret out of band; that remains a declared
 * mock-issuer limitation, not a circuit property.)
 */
export const NULLIFIER_SECRET = "credentialSecret" as const;

/** The report id is bound to the secret the issuer never learns. */
export const REPORT_ID_SECRET = "personalSecret" as const;
