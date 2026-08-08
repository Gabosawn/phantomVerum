/**
 * Contratos de datos congelados entre bloques — `docs/03-plan-ejecucion.md` §3.
 *
 * Los nombres de acá son los de la API de `app/` (en castellano, tal como se
 * congelaron antes de arrancar), no los de los circuitos. Los circuitos viven
 * espejados en `cripto.ts` con sus nombres en inglés. Las vistas hablan sólo
 * este dialecto, así que cuando entre el Bloque B no cambia ninguna vista.
 */

import type { Hex32 } from "./cripto";

export type { Hex32 };

export type TxResult = {
  txId: string;
  blockHeight: number;
};

/**
 * §3.2 — el material que el denunciante exporta y le entrega al verificador
 * por fuera de la cadena.
 *
 * NO contiene el `secret` del denunciante. En su lugar incluye `proof`: una
 * prueba ZK generada por el proof server local contra el circuito
 * `proveAuthorship`. El verificador usa `/check` contra su propio proof
 * server para verificar la prueba sin aprender el secret.
 *
 * En modo mock (demo), `proof` es el `autoriaHash` — suficiente para
 * verificar contra el ledger. En producción es la proof ZK real.
 */
export type ExportLlaveAutoria = {
  version: 2;
  denunciaId: Hex32;
  evidenciaHash: Hex32;
  fiscalPk: Hex32;
  autoriaHash: Hex32;
  /** ZK proof (mock: autoriaHash; producción: proof bytes del proof server). */
  proof: Hex32;
};

/** §3.2 — estado privado del denunciante. Nunca sale de esta máquina. */
export type SecretsDenunciante = {
  version: 1;
  secretPersonal: Hex32;
  credencialSecret: Hex32;
  orgId: Hex32;
  hojaIndex: number;
};

/** §3.1 — lo que el panel de la UI lee del ledger vía indexer. */
export type EstadoLedger = {
  organizaciones: number;
  denuncias: Hex32[];
  nullifiers: number;
  autorias: Hex32[];
};

/**
 * Fila del explorador. `denunciaId` y `nullifier` aparecen juntos porque los
 * inserta la MISMA transacción `report()`, así que el indexer los ve en el
 * mismo bloque. Que estén pareados no le sirve a nadie para saber quién fue.
 */
export type FilaDenuncia = {
  denunciaId: Hex32;
  nullifier: Hex32;
  bloque: number;
};

/**
 * A directory row as the ISSUER sees it: the employee derives
 * `credCommitment = credCommitmentOf(credSecret)` on their own machine and
 * hands over only the commitment. The org never learns `credSecret`.
 */
export type Empleado = {
  nombre: string;
  rol: string;
  credCommitment: Hex32;
  hoja: Hex32;
};

export type Verificador = {
  id: string;
  nombre: string;
  pk: Hex32;
};

// ── Errores que fallan en proof time, sin emitir transacción ──────────────
// Each message is the VERBATIM assert string of `contracts/src/testigo.compact`
// — what the proof server would report. The views wrap them in their own copy.

export class CredencialInvalidaError extends Error {
  constructor() {
    super("credential does not belong to the organization");
    this.name = "CredencialInvalidaError";
  }
}

export class NullifierRepetidoError extends Error {
  constructor() {
    super("already reported this period");
    this.name = "NullifierRepetidoError";
  }
}

export class DenunciaRepetidaError extends Error {
  constructor() {
    super("report already sealed");
    this.name = "DenunciaRepetidaError";
  }
}

export class NoSosElAutorError extends Error {
  constructor() {
    super("not the author");
    this.name = "NoSosElAutorError";
  }
}

export class OrganizacionYaRegistradaError extends Error {
  constructor() {
    super("organization already registered");
    this.name = "OrganizacionYaRegistradaError";
  }
}

export class OrganizationNotRegisteredError extends Error {
  constructor() {
    super("organization not registered");
    this.name = "OrganizationNotRegisteredError";
  }
}

/** C0 — the public `period` argument is below the current epoch window. */
export class PeriodNotStartedError extends Error {
  constructor() {
    super("period not started yet");
    this.name = "PeriodNotStartedError";
  }
}

/** C0 — the public `period` argument is above the current epoch window. */
export class PeriodOverError extends Error {
  constructor() {
    super("period already over");
    this.name = "PeriodOverError";
  }
}

export class ReportDoesNotExistError extends Error {
  constructor() {
    super("report does not exist");
    this.name = "ReportDoesNotExistError";
  }
}

export class AuthorshipAlreadyRevealedError extends Error {
  constructor() {
    super("authorship already revealed to this prosecutor");
    this.name = "AuthorshipAlreadyRevealedError";
  }
}

/** Reporta el avance del proof server para que la vista lo muestre en vivo. */
export type Progreso = (paso: string) => void;

/**
 * §3.1 — la API de `app/`. Hoy la implementa `ClienteMock`; cuando entren los
 * Bloques A y B aparece `ClienteReal` con esta misma interfaz y se cambia una
 * línea en el provider.
 */
export interface TestigoClient {
  registrarOrganizacion(p: { orgId: Hex32; ancla: Hex32 }): Promise<TxResult>;

  /**
   * The issuer receives the COMMITMENT (`credCommitmentOf(credSecret)`), never
   * the secret, and derives the leaf itself — mirror of `issueCredential`.
   */
  emitirCredencial(p: {
    orgId: Hex32;
    credCommitment: Hex32;
  }): Promise<{ hojaIndex: number; tx: TxResult }>;

  /**
   * Hashea la evidencia LOCALMENTE; el archivo no se transmite.
   * `periodo` is the EPOCH INDEX (`epochIndexOf(unixSeconds)`); the contract's
   * C0 forces it to be the CURRENT epoch, so callers derive it from the clock.
   */
  denunciar(
    p: { orgId: Hex32; periodo: number; evidencia: Uint8Array },
    onPaso?: Progreso,
  ): Promise<{ denunciaId: Hex32; nullifier: Hex32; tx: TxResult }>;

  revelarAutoria(
    p: { denunciaId: Hex32; fiscalPk: Hex32 },
    onPaso?: Progreso,
  ): Promise<{ autoriaHash: Hex32; tx: TxResult }>;

  /** 100 % off-chain: recomputa con los pure circuits y lee el ledger. */
  verificarAutoria(p: ExportLlaveAutoria): Promise<{ ok: boolean; enLedger: boolean }>;

  leerEstadoLedger(): Promise<EstadoLedger>;
}
