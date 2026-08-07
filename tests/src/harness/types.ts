/**
 * The seam. Tests depend on THIS ONLY — never on a concrete backend.
 *
 * Hard rule: if a test needs to know which backend is running, the test is written wrong.
 * The one legitimate exception is printing the backend name in a log line.
 */

/** 64 hex chars, no `0x` — the format frozen in §3.1 of 03-plan-ejecucion.md. */
export type Hex32 = string;

export type BackendName = "model" | "contract";

/**
 * An actor and its three witnesses. Swapping actors means swapping the private state, which
 * is exactly how the compact-runtime simulator models "who is acting".
 */
export interface Actor {
  readonly name: string;
  readonly credencialSecret: Hex32;
  readonly secretPersonal: Hex32;
  readonly evidenciaHash: Hex32;
}

/** Everything a public-ledger observer can see. Nothing more than this. */
export interface LedgerSnapshot {
  readonly organizaciones: ReadonlyMap<Hex32, Hex32>;
  /** Root of the global credential tree. `null` while the tree is empty. */
  readonly credencialesRoot: Hex32 | null;
  readonly credencialesCount: number;
  readonly denuncias: ReadonlySet<Hex32>;
  readonly nullifiers: ReadonlySet<Hex32>;
  readonly autorias: ReadonlySet<Hex32>;
}

/** A failed circuit `assert`. On the real network this happens at proof time, emitting no tx. */
export class AssertError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssertError";
  }
}

/**
 * The interface both backends implement.
 *
 * Synchronous on purpose: compact-runtime circuits are, and the local simulator touches
 * neither the network nor a proof server.
 */
export interface TestigoHarness {
  readonly backend: BackendName;

  /** Sets the witnesses for the next circuit call. Returns `this` so calls can chain. */
  as(actor: Actor): TestigoHarness;

  registrarOrganizacion(orgId: Hex32, ancla: Hex32): void;
  /** Inserts the employee's leaf into the global tree. Mock issuer, no access control (§2.6). */
  emitirCredencial(orgId: Hex32, hoja: Hex32): void;
  /** `periodo` is a coarse readable epoch ("2026-08"); padded to `Bytes<32>` internally. */
  denunciar(orgId: Hex32, periodo: string): void;
  revelarAutoria(denunciaId: Hex32, fiscalPk: Hex32): void;

  ledger(): LedgerSnapshot;
}
