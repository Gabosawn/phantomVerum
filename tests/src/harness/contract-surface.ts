/**
 * CONTRACT SURFACE — the agreement between Block D (tests) and Block A (the contract).
 *
 * This file is the single source of truth for names, domain tags and assert messages. If
 * Block A picks different names, this file changes and nothing else: neither the model nor
 * the 13 tests are touched.
 *
 * Identifiers below stay in Spanish on purpose — they must match the compiled `.compact`
 * byte for byte. Everything else in `tests/` is English.
 *
 * Derived from docs/01-arquitectura.md §3–§4 and docs/03-plan-ejecucion.md §2.1, §2.2,
 * §2.4, §2.6.
 */

/** Public ledger fields (§3 of 01-arquitectura). */
export const LEDGER = {
  organizaciones: "organizaciones",
  /** §2.1: GLOBAL tree with orgId inside the leaf. HistoricMerkleTree<8, Bytes<32>>. */
  credenciales: "credenciales",
  denuncias: "denuncias",
  nullifiers: "nullifiers",
  autorias: "autorias",
} as const;

/** Credential tree depth (§5 of 01-arquitectura: 8 levels = 256 employees). */
export const MERKLE_DEPTH = 8;

/** Exported impure circuits. */
export const CIRCUITS = {
  registrarOrganizacion: "registrarOrganizacion",
  emitirCredencial: "emitirCredencial",
  denunciar: "denunciar",
  revelarAutoria: "revelarAutoria",
} as const;

/** `export pure circuit`s (§2.4) — let the app hash locally, with no proof server. */
export const PURE_CIRCUITS = {
  hojaDe: "hojaDe",
  denunciaIdDe: "denunciaIdDe",
  nullifierDe: "nullifierDe",
  autoriaDe: "autoriaDe",
} as const;

/** Witnesses declared in Compact, implemented in TypeScript. */
export const WITNESSES = {
  credencialSecret: "credencialSecret",
  secretPersonal: "secretPersonal",
  evidenciaHash: "evidenciaHash",
  credencialPath: "credencialPath",
} as const;

/**
 * Domain separation tags (§2.2 — MANDATORY, not optional).
 *
 * Without them `nullifier` and `autoria` share the same shape with the same secret in
 * position 0: an attacker who registers an org with `orgId = denunciaId` forces a
 * cross-domain collision. §2.2 fixes `"testigo:nullifier:v1"` verbatim; the other three are
 * the direct extension.
 *
 * They go in position 0 of all four hashes, as `pad(32, "...")`.
 */
export const DOMAIN_TAGS = {
  hoja: "testigo:hoja:v1",
  denuncia: "testigo:denuncia:v1",
  nullifier: "testigo:nullifier:v1",
  autoria: "testigo:autoria:v1",
} as const;

/**
 * `assert` messages. These must match the contract LITERALLY: the tests assert on them with
 * `toThrow(/.../)` against both backends.
 */
export const ASSERTS = {
  orgAlreadyRegistered: "organizacion ya registrada",
  orgNotFound: "organizacion inexistente",
  invalidCredential: "credencial invalida",
  alreadyReportedThisPeriod: "ya denunciaste este periodo",
  reportAlreadyExists: "denuncia ya existe",
  notTheAuthor: "no sos el autor",
  reportNotFound: "denuncia inexistente",
  authorshipAlreadyRevealed: "autoria ya revelada",
} as const;

/**
 * ⚠️ OPEN SPEC AMBIGUITY — must be resolved with Block A. It has a security consequence.
 *
 * `01-arquitectura.md` contradicts itself about which secret feeds the nullifier:
 *
 *   §4.2 (pseudocode):  nul = H([secretPersonal, orgId, periodo])
 *   §5 (Option A):      "the nullifier uses `credencialSecret` as `secret` →
 *                        one credential = one report per period"
 *
 * Neither reading is free:
 *
 *   - With `secretPersonal` (what this model implements, per §8: "adapt the syntax, never
 *     the semantics" → the pseudocode wins): anti-spam is WEAK. The reporter picks their own
 *     `secretPersonal`, so they can mint N distinct nullifiers from one credential. That is
 *     exactly the weakness §5 attributes to Option B.
 *
 *   - With `credencialSecret`: anti-spam is strong, BUT if the mock issuer (the org) knows
 *     the `credencialSecret` values it issued, it can compute
 *     `nullifierDe(credSecret_i, orgId, periodo)` for every employee i and check which one
 *     is in the ledger → it DEANONYMIZES the reporter. That breaks the product's core
 *     property. It is only safe if the employee generates `credencialSecret` and the org
 *     never sees it (the org only ever receives the leaf `H(tag ‖ orgId ‖ credSecret)`).
 *
 * This model implements §4.2 (`secretPersonal`) and declares it. If Block A resolves it the
 * other way, only `model.ts` changes — no assertion in the suite moves.
 */
export const NULLIFIER_SECRET: "secretPersonal" | "credencialSecret" = "secretPersonal";
