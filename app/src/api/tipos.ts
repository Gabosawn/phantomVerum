/**
 * B3 — Tipos de la API de Testigo.
 *
 * Las formas de acá están CONGELADAS en `docs/03-plan-ejecucion.md` §3.1 y
 * §3.2: `ui/` (bloque C) y `tests/` (bloque D) mockean contra ellas. Si algo
 * cambia, se avisa a todos los bloques — no se cambia en silencio.
 *
 * Convención de bordes (misma que B2): todo lo que ENTRA acepta
 * `Uint8Array | Hex32` y se normaliza con `comoBytes32`; todo lo que SALE es
 * `Hex32` (64 chars hex minúscula, sin `0x`). Un solo formato en los JSON que
 * cruzan máquinas.
 */
import type { Hex32 } from '../witnesses/hex.js';

export type { Hex32 };

/** Cualquiera de las dos representaciones de un valor de 32 bytes. */
export type Bytes32Entrada = Uint8Array | Hex32;

/**
 * Resultado de una transacción.
 *
 * `txId` y `blockHeight` son los campos congelados en §3.1. Los otros dos son
 * aditivos y opcionales: no rompen a quien ya mockeaba el tipo.
 */
export interface TxResult {
  /** Identificador de la transacción. */
  readonly txId: string;
  /** Altura del bloque que la incluyó. Ausente si todavía no se sabe. */
  readonly blockHeight?: number;
  /**
   * `true` cuando la tx NO tocó una cadena real: la produjo el ejecutor de
   * simulador. Sirve para que el CLI y la UI no muestren un txId falso como si
   * fuera verificable en un explorer.
   */
  readonly simulado?: boolean;
  /** Estado que reportó la cadena (`SucceedEntirely`, etc.). */
  readonly status?: string;
}

/**
 * Estado público del contrato, tal como lo consume el panel de la UI.
 *
 * Congelado en §3.1: `organizaciones` y `nullifiers` son CONTEOS (no listas) a
 * propósito. Listar los nullifiers no aportaría nada a la demo y publicarlos
 * en una UI invita a correlacionarlos con las denuncias.
 */
export interface EstadoLedger {
  /** Cantidad de organizaciones registradas. */
  readonly organizaciones: number;
  /** Los `denunciaId` sellados on-chain. */
  readonly denuncias: Hex32[];
  /** Cantidad de nullifiers quemados. */
  readonly nullifiers: number;
  /** Los `autoriaHash` revelados on-chain. */
  readonly autorias: Hex32[];
  /**
   * Hojas ocupadas en el árbol de credenciales (`firstFree`). Aditivo: el
   * panel lo usa para mostrar "N credenciales emitidas" sin exponer cuáles.
   */
  readonly credencialesEmitidas?: number;
}

/**
 * Paquete que el denunciante le entrega al fiscal (§3.2, formato v2).
 *
 * ⚠️ LIMITACIÓN DECLARADA (H-2, docs/03 §3.4): quien tiene este paquete puede
 * verificar la autoría **y también actuar como el autor** — republicar la
 * autoría hacia otra `fiscalPk` y quemar el slot. El secret POR DENUNCIA acota
 * el daño a esta sola denuncia (en v1, un solo export comprometía todas).
 * La mitigación real —una prueba ZK al fiscal en vez del paquete— es roadmap,
 * y así está declarado en el deck. No se presenta como no-transferible.
 */
export interface ExportLlaveAutoria {
  readonly version: 2;
  /** Denuncia cuya autoría se reclama. */
  readonly denunciaId: Hex32;
  /** sha-256 de la evidencia. El archivo en sí nunca sale de la máquina. */
  readonly evidenciaHash: Hex32;
  /** Secret de ESTA denuncia. Es lo sensible del paquete. */
  readonly secretDenuncia: Hex32;
  /** Clave pública del fiscal destinatario. */
  readonly fiscalPk: Hex32;
  /** `autoriaDe(secretDenuncia, denunciaId, fiscalPk)`, precomputado. */
  readonly autoriaHash: Hex32;
}

/**
 * Resultado de `verificarAutoria` (§3.1).
 *
 * Los dos campos son independientes a propósito:
 *
 * - `ok`   — la aritmética cierra: el `secretDenuncia` del paquete reconstruye
 *            el `denunciaId` Y el `autoriaHash` declarados. 100 % local.
 * - `enLedger` — ese `autoriaHash` está efectivamente publicado on-chain.
 *
 * Un paquete puede tener `ok: true, enLedger: false` (aritmética válida pero
 * la autoría nunca se publicó, o se publicó para OTRO fiscal). Es exactamente
 * el caso EMPLEADOR ❌ del video: el hash que sale con su pk no está en el
 * ledger. Colapsarlos en un solo booleano borraría esa distinción.
 */
export interface ResultadoVerificacion {
  readonly ok: boolean;
  readonly enLedger: boolean;
  /** Motivo legible — es lo que imprime `verificar-autoria.ts` (B4.5). */
  readonly detalle: string;
  /** Chequeos individuales, para el panel de la UI. */
  readonly checks: {
    /** `denunciaIdDe(evidenciaHash, secretDenuncia) == denunciaId` */
    readonly denunciaIdCoincide: boolean;
    /** `autoriaDe(secretDenuncia, denunciaId, fiscalPk) == autoriaHash` */
    readonly autoriaHashCoincide: boolean;
    /** El `denunciaId` está sellado en el ledger. */
    readonly denunciaEnLedger: boolean;
    /** El `autoriaHash` está publicado en el ledger. */
    readonly autoriaEnLedger: boolean;
  };
}

// ── Parámetros de los 5 métodos de §3.1 ─────────────────────────────────

export interface ParamsRegistrarOrganizacion {
  readonly orgId: Bytes32Entrada;
  readonly ancla: Bytes32Entrada;
}

export interface ParamsEmitirCredencial {
  readonly orgId: Bytes32Entrada;
  /**
   * `credCommitmentDe(credSecret)` — el commitment, NUNCA el secret.
   *
   * SEGURIDAD (H-4, §3.1): el secret lo genera el cliente y no sale de su
   * máquina. Si el emisor lo tuviera, podría recomputar
   * `nullifierDe(credSecret, orgId, periodo)` de cualquier empleado y saber
   * quién denunció en cada período.
   */
  readonly credCommitment: Bytes32Entrada;
}

export interface ResultadoEmitirCredencial {
  /** Índice de la hoja recién insertada en el árbol global. */
  readonly hojaIndex: number;
  readonly tx: TxResult;
}

export interface ParamsDenunciar {
  readonly orgId: Bytes32Entrada;
  /**
   * Índice de época (`Uint<64>`), NO el string "2026-08".
   *
   * El contrato lo ata al reloj de la cadena con `blockTimeGte`/`blockTimeLt`,
   * así que **solo la época actual es válida**. Se calcula con `epocaActual()`
   * de `witnesses/epoca.ts` — SEGUNDOS, no milisegundos.
   */
  readonly periodo: bigint;
  /**
   * La evidencia. Se hashea LOCAL y el archivo nunca sale de la máquina.
   *
   * `Uint8Array` es la forma congelada en §3.1. La variante `{rutaArchivo}` es
   * aditiva: deja que el CLI (B4.3) hashee por stream un PDF grande sin
   * cargarlo entero en memoria.
   */
  readonly evidencia: Uint8Array | { readonly rutaArchivo: string };
}

export interface ResultadoDenunciar {
  readonly denunciaId: Hex32;
  readonly nullifier: Hex32;
  /**
   * Secret fresco de esta denuncia. Ya quedó persistido en el almacén local
   * ANTES de emitir la tx (ver `ApiTestigo.denunciar`): se devuelve para
   * mostrarlo/exportarlo, no para que el llamador se encargue de guardarlo.
   */
  readonly secretDenuncia: Hex32;
  readonly evidenciaHash: Hex32;
  readonly tx: TxResult;
}

export interface ParamsRevelarAutoria {
  readonly denunciaId: Bytes32Entrada;
  readonly fiscalPk: Bytes32Entrada;
}

export interface ResultadoRevelarAutoria {
  readonly autoriaHash: Hex32;
  readonly tx: TxResult;
}
