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

/** Public ledger fields. */
export const LEDGER = {
  organizations: "organizations",
  /** Global `HistoricMerkleTree<8, Bytes<32>>` — orgId lives inside each leaf. */
  credentials: "credentials",
  reports: "reports",
  nullifiers: "nullifiers",
  authorships: "authorships",
} as const;

/** Credential tree depth. */
export const MERKLE_DEPTH = 8;

/**
 * `epochDuration()` in the contract: seconds per reporting epoch. Midnight's blockTime is
 * `secondsSinceEpoch` (Unix SECONDS, not milliseconds), so 86400 = one day. `report`'s `period`
 * argument is the EPOCH INDEX — `floor(blockTime / EPOCH_DURATION)` — and C0 pins it to the
 * chain clock: `period * duration <= blockTime < (period + 1) * duration`.
 */
export const EPOCH_DURATION = 86400n;

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
  /** `H(nullifierTag ‖ sec ‖ orgId ‖ (period as Field) as Bytes<32>)` — period is `bigint`. */
  nullifierOf: "nullifierOf",
  authorshipOf: "authorshipOf",
} as const;

/** Witnesses declared in Compact, implemented in TypeScript. */
export const WITNESSES = {
  credentialSecret: "credentialSecret",
  /** Takes NO argument and returns only the siblings — see `witnesses.ts`. */
  credentialPath: "credentialPath",
  personalSecret: "personalSecret",
  evidenceHash: "evidenceHash",
} as const;

/**
 * Domain separation tags, in position 0 of all five hashes.
 *
 * Without them `nullifierOf` and `authorshipOf` share a shape — H(sec, X, Y) — so an attacker
 * who registers an org whose `orgId` equals a victim's `reportId` forces a cross-domain
 * collision. `hardening.test.ts` reproduces that attack.
 */
export const DOMAIN_TAGS = {
  cred: "phantomtrace:cred:v1",
  /** The commitment layer between `credentialSecret` and the leaf. */
  credcomm: "phantomtrace:credcomm:v1",
  report: "phantomtrace:report:v1",
  nullifier: "phantomtrace:nullifier:v1",
  authorship: "phantomtrace:authorship:v1",
} as const;

/** `assert` messages, copied verbatim from the contract. Tests match on these. */
export const ASSERTS = {
  orgAlreadyRegistered: "organization already registered",
  orgNotRegistered: "organization not registered",
  /** C0 — `period` is ahead of the chain clock: `blockTime < period * duration`. */
  periodNotStarted: "period not started yet",
  /** C0 — `period` is stale: `blockTime >= (period + 1) * duration`. */
  periodAlreadyOver: "period already over",
  credentialNotInOrg: "credential does not belong to the organization",
  alreadyReportedThisPeriod: "already reported this period",
  reportAlreadySealed: "report already sealed",
  notTheAuthor: "not the author",
  reportDoesNotExist: "report does not exist",
  authorshipAlreadyRevealed: "authorship already revealed to this prosecutor",
} as const;

/**
 * Which secret feeds the nullifier — RESOLVED, and worth knowing why.
 *
 * `01-arquitectura.md` contradicted itself: §4.2's pseudocode fed it `personalSecret`, §5
 * (Option A) said `credencialSecret`. Block D's model originally implemented §4.2. The
 * contract chose §5 — `report()` calls `nullifierOf(cred, orgId, period)` — so the model was
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
 * `nullifierOf(cred, orgId, period)` — the issuer cannot scan the ledger to see who reported.
 * (A MALICIOUS mock issuer could still ask for the secret out of band; that remains a declared
 * mock-issuer limitation, not a circuit property.)
 */
export const NULLIFIER_SECRET = "credentialSecret" as const;

/** The report id is bound to the secret the issuer never learns. */
export const REPORT_ID_SECRET = "personalSecret" as const;
