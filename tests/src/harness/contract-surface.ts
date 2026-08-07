/**
 * CONTRACT SURFACE — agreement between Block D (tests) and Block A (the contract).
 *
 * Identifiers stay in Spanish on purpose — they must match the compiled `.compact`
 * byte for byte. Everything else in `tests/` is English.
 *
 * Source of truth: `contracts/src/testigo.compact` (compiled 2026-08-07).
 */

/** Public ledger fields (§3 of 01-arquitectura). */
export const LEDGER = {
  organizaciones: "organizaciones",
  /** GLOBAL tree with orgId inside the leaf. HistoricMerkleTree<8, Bytes<32>>. */
  credenciales: "credenciales",
  denuncias: "denuncias",
  nullifiers: "nullifiers",
  autorias: "autorias",
} as const;

/** Credential tree depth (§5: 8 levels = 256 employees). */
export const MERKLE_DEPTH = 8;

/** Epoch length in seconds — must match `duracionEpoca()` in the contract. */
export const DUR_EPOCA = 86400n;

/**
 * Fixed Unix instant for deterministic epoch tests.
 * 2026-08-07T00:00:00Z — same anchor as `contracts/test/harness.mjs`.
 */
export const AHORA = 1_786_147_200;

export const EPOCA = BigInt(AHORA) / DUR_EPOCA;
export const EPOCA_NEXT = EPOCA + 1n;
export const AHORA_NEXT = Number(EPOCA_NEXT * DUR_EPOCA);

/** Exported impure circuits. */
export const CIRCUITS = {
  registrarOrganizacion: "registrarOrganizacion",
  emitirCredencial: "emitirCredencial",
  denunciar: "denunciar",
  revelarAutoria: "revelarAutoria",
} as const;

/** `export pure circuit`s — app can hash locally with no proof server. */
export const PURE_CIRCUITS = {
  credCommitmentDe: "credCommitmentDe",
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
 * Domain separation tags — must match `pad(32, "...")` helpers in the contract.
 */
export const DOMAIN_TAGS = {
  cred: "testigo:cred:v1",
  credcomm: "testigo:credcomm:v1",
  denuncia: "testigo:denuncia:v1",
  nullifier: "testigo:nullifier:v1",
  autoria: "testigo:autoria:v1",
} as const;

/**
 * `assert` messages — must match the contract LITERALLY.
 */
export const ASSERTS = {
  orgAlreadyRegistered: "organizacion ya registrada",
  orgNotFound: "organizacion no registrada",
  invalidCredential: "credencial no pertenece a la organizacion",
  periodNotStarted: "periodo aun no empezo",
  periodExpired: "periodo ya vencido",
  alreadyReportedThisPeriod: "ya denunciaste este periodo",
  reportAlreadyExists: "denuncia ya sellada",
  notTheAuthor: "no sos el autor",
  reportNotFound: "denuncia inexistente",
  authorshipAlreadyRevealed: "autoria ya revelada a este fiscal",
} as const;

/**
 * Nullifier secret choice — resolved as Opción A in the compiled contract:
 * `nullifierDe(credencialSecret, orgId, periodo)`.
 */
export const NULLIFIER_SECRET: "secretPersonal" | "credencialSecret" = "credencialSecret";
