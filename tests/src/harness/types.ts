/**
 * The seam. Tests depend on THIS ONLY — never on a concrete backend.
 */

/** 64 hex chars, no `0x`. */
export type Hex32 = string;

export type BackendName = "model" | "contract";

/**
 * An actor and its witnesses. Swapping actors means swapping the private state.
 */
export interface Actor {
  readonly name: string;
  readonly credencialSecret: Hex32;
  readonly secretPersonal: Hex32;
  readonly evidenciaHash: Hex32;
}

/** Everything a public-ledger observer can see. Nothing more. */
export interface LedgerSnapshot {
  readonly organizaciones: ReadonlyMap<Hex32, Hex32>;
  /** Root of the global credential tree. `null` while the tree is empty. */
  readonly credencialesRoot: Hex32 | null;
  readonly credencialesCount: number;
  readonly denuncias: ReadonlySet<Hex32>;
  readonly nullifiers: ReadonlySet<Hex32>;
  readonly autorias: ReadonlySet<Hex32>;
}

/** A failed circuit `assert`. On the real network this happens at proof time. */
export class AssertError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssertError";
  }
}

/**
 * The interface both backends implement.
 *
 * Synchronous on purpose: compact-runtime circuits are, and the local simulator
 * touches neither the network nor a proof server.
 */
export interface TestigoHarness {
  readonly backend: BackendName;

  /** Sets the witnesses for the next circuit call. Returns `this` so calls can chain. */
  as(actor: Actor): TestigoHarness;

  /**
   * Sets the simulated block time (Unix seconds). Required for epoch-gated `denunciar`.
   */
  at(unixSeconds: number): TestigoHarness;

  registrarOrganizacion(orgId: Hex32, ancla: Hex32): void;
  /**
   * Mock issuer: inserts the leaf built from `(orgId, credCommitment)`.
   * Pass `credCommitmentDe(credSecret)`, never the secret.
   */
  emitirCredencial(orgId: Hex32, credCommitment: Hex32): void;
  /** `periodo` is the epoch index (`blockTime / duracionEpoca`). */
  denunciar(orgId: Hex32, periodo: bigint): void;
  revelarAutoria(denunciaId: Hex32, fiscalPk: Hex32): void;

  ledger(): LedgerSnapshot;
}
