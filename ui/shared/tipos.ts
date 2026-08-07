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
 * ⚠️ Limitación declarada del MVP: incluye `secret`, así que el verificador lo
 * aprende. Es lo que le permite recomputar el hash de autoría con SU clave y
 * obtener ✅ o ❌. En el roadmap esto se reemplaza por una prueba ZK dirigida
 * al fiscal, que le da la misma certeza sin entregarle el secret.
 */
export type ExportLlaveAutoria = {
  version: 1;
  denunciaId: Hex32;
  evidenciaHash: Hex32;
  secret: Hex32;
  fiscalPk: Hex32;
  autoriaHash: Hex32;
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

export type Empleado = {
  nombre: string;
  rol: string;
  credencialSecret: Hex32;
  hoja: Hex32;
};

export type Verificador = {
  id: string;
  nombre: string;
  pk: Hex32;
};

// ── Errores que fallan en proof time, sin emitir transacción ──────────────

export class CredencialInvalidaError extends Error {
  constructor() {
    super("la credencial no pertenece a la organización");
    this.name = "CredencialInvalidaError";
  }
}

export class NullifierRepetidoError extends Error {
  constructor() {
    super("ya denunciaste este período");
    this.name = "NullifierRepetidoError";
  }
}

export class DenunciaRepetidaError extends Error {
  constructor() {
    super("esa denuncia ya está sellada");
    this.name = "DenunciaRepetidaError";
  }
}

export class NoSosElAutorError extends Error {
  constructor() {
    super("no sos el autor de esa denuncia");
    this.name = "NoSosElAutorError";
  }
}

export class OrganizacionYaRegistradaError extends Error {
  constructor() {
    super("organización ya registrada");
    this.name = "OrganizacionYaRegistradaError";
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

  emitirCredencial(p: {
    orgId: Hex32;
  }): Promise<{ credencialSecret: Hex32; hojaIndex: number; tx: TxResult }>;

  /** Hashea la evidencia LOCALMENTE; el archivo no se transmite. */
  denunciar(
    p: { orgId: Hex32; periodo: string; evidencia: Uint8Array },
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
