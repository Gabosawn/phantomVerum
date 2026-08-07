/**
 * CONTRACT SURFACE — mirrors `contracts/src/testigo.compact`.
 *
 * Reconciled against the real contract on 2026-08-07, after Block A landed. Before that this
 * file held Block D's assumption of the surface; now it holds the surface itself, transcribed
 * from the compiled artifact. The `.compact` is the authority — if it changes, this file
 * follows, and the 22 test cases keep working untouched.
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

/** Exported impure circuits. */
export const CIRCUITS = {
  registerOrganization: "registerOrganization",
  issueCredential: "issueCredential",
  report: "report",
  revealAuthorship: "revealAuthorship",
} as const;

/** `export pure circuit`s — the app recomputes hashes locally, with no proof server. */
export const PURE_CIRCUITS = {
  leafOf: "leafOf",
  reportIdOf: "reportIdOf",
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
 * Domain separation tags, in position 0 of all four hashes.
 *
 * Without them `nullifierOf` and `authorshipOf` share a shape — H(sec, X, Y) — so an attacker
 * who registers an org whose `orgId` equals a victim's `reportId` forces a cross-domain
 * collision. `hardening.test.ts` reproduces that attack.
 */
export const DOMAIN_TAGS = {
  cred: "phantomtrace:cred:v1",
  report: "phantomtrace:report:v1",
  nullifier: "phantomtrace:nullifier:v1",
  authorship: "phantomtrace:authorship:v1",
} as const;

/** `assert` messages, copied verbatim from the contract. Tests match on these. */
export const ASSERTS = {
  orgAlreadyRegistered: "organization already registered",
  orgNotRegistered: "organization not registered",
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
 * ⚠️ Residual risk to state in the deck: whoever knows the issued `credentialSecret` values can
 * compute `nullifierOf(cred_i, orgId, period)` for each employee i and check the ledger to see
 * which one reported. It is only safe if the employee generates `credentialSecret` and the org
 * only ever receives the leaf. That is a property of the mock issuer, not of the circuit —
 * declare it alongside the other mock-issuer limits.
 */
export const NULLIFIER_SECRET = "credentialSecret" as const;

/** The report id is bound to the secret the issuer never learns. */
export const REPORT_ID_SECRET = "personalSecret" as const;
