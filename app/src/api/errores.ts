/**
 * B3 — Errores tipados de la API.
 *
 * ── Por qué mapear por mensaje y no por clase ────────────────────────────
 * Los `assert` de Compact no viajan como clases de error: el runtime los
 * levanta como un error genérico cuyo mensaje contiene el texto literal del
 * `assert` en el `.compact`. No hay un código ni un tag que consultar. Así que
 * el mapeo es por fragmento de texto, y los fragmentos de `MENSAJES_CONTRATO`
 * están copiados uno a uno de `contracts/src/testigo.compact`.
 *
 * Eso lo hace frágil ante un cambio de redacción en el contrato, y por eso
 * `contracts/src/testigo.compact` es la fuente: si alguien reescribe un
 * `assert`, el selftest de B3 (`selftest-simulador.ts`) falla en el caso
 * negativo correspondiente en vez de degradar en silencio a `ErrorDeCircuito`.
 * Es deliberado que el test cubra los 3 negativos del criterio de aceptación.
 *
 * ── "Proof time, sin tx" ─────────────────────────────────────────────────
 * `CredencialInvalidaError`, `NullifierRepetidoError` y `NoSosElAutorError`
 * tienen que dispararse ANTES de emitir transacción — es un requisito del plan
 * (§3.1), no una preferencia. Se cumple porque midnight-js ejecuta el circuito
 * LOCALMENTE para construir el transcript antes de probar y antes de submitear:
 * un `assert` que falla corta ahí, sin gastar proving ni tocar la red.
 *
 * La contraprueba es `TxRechazadaError`: envuelve un `CallTxFailedError` /
 * `DeployTxFailedError`, que por definición son txs que SÍ se emitieron y la
 * cadena rechazó. Si alguna vez un caso negativo sale por ahí en vez de por los
 * errores de proof time, la propiedad se rompió y el tipo del error lo delata.
 */
import {
  CallTxFailedError,
  DeployTxFailedError,
  TxFailedError,
} from '@midnight-ntwrk/midnight-js-contracts';

import type { TestigoCircuitId } from '../config/providers.js';

/** Base de todos los errores de dominio de Testigo. */
export class ErrorTestigo extends Error {
  constructor(
    message: string,
    /** Circuito en el que se originó, si aplica. */
    readonly circuito?: TestigoCircuitId,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

/**
 * La credencial no prueba pertenencia a la organización.
 *
 * Cubre TRES situaciones que son deliberadamente indistinguibles (regla 4 de
 * H-5, docs/03 §3.4): no hay credencial cargada, la credencial es de otra org,
 * o la credencial existe pero todavía no fue emitida en el árbol. Distinguirlas
 * convertiría el error en un oráculo de pertenencia a la organización.
 *
 * Se dispara en PROOF TIME, sin emitir transacción.
 */
export class CredencialInvalidaError extends ErrorTestigo {}

/**
 * Ya se denunció en esta época con esta credencial (el nullifier está quemado).
 *
 * Es el anti-spam del contrato. Se dispara en PROOF TIME, sin emitir tx.
 */
export class NullifierRepetidoError extends ErrorTestigo {}

/**
 * El `secretDenuncia` con el que se intenta reclamar la autoría no reconstruye
 * ese `denunciaId`.
 *
 * Se dispara en PROOF TIME, sin emitir tx — y, cuando el almacén local alcanza
 * para saberlo, incluso ANTES del proving: `stagearDenunciaGuardada(ps, reg,
 * idEsperado)` hace el mismo chequeo con un hash y ahorra ~30 s de prueba.
 */
export class NoSosElAutorError extends ErrorTestigo {}

/** El `periodo` pedido no es la época en curso según el reloj de la cadena. */
export class PeriodoInvalidoError extends ErrorTestigo {}

/** La organización ya estaba registrada (guard de idempotencia). */
export class OrganizacionYaRegistradaError extends ErrorTestigo {}

/** La organización no está registrada: no se le pueden emitir credenciales. */
export class OrganizacionNoRegistradaError extends ErrorTestigo {}

/** Esa denuncia ya estaba sellada (re-envío de una tx idéntica). */
export class DenunciaYaSelladaError extends ErrorTestigo {}

/** Se quiso revelar autoría de una denuncia que no está en el ledger. */
export class DenunciaInexistenteError extends ErrorTestigo {}

/** Ya se reveló la autoría de esa denuncia a ese mismo fiscal. */
export class AutoriaYaReveladaError extends ErrorTestigo {}

/**
 * La transacción se emitió y la cadena la rechazó.
 *
 * Distinto de todo lo anterior: acá SÍ hubo tx. Si un caso negativo de negocio
 * (credencial inválida, nullifier repetido, secret ajeno) llega por este
 * camino, la propiedad "falla en proof time sin emitir tx" se rompió.
 */
export class TxRechazadaError extends ErrorTestigo {
  constructor(
    readonly causaTx: TxFailedError,
    circuito?: TestigoCircuitId,
  ) {
    super(
      `la cadena rechazó la transacción de "${circuito ?? 'desconocido'}": ` +
        `status=${String(causaTx.finalizedTxData.status)} ` +
        `txId=${String(causaTx.finalizedTxData.txId)}`,
      circuito,
      { cause: causaTx },
    );
  }
}

/** Fallo de circuito que no matchea ningún caso conocido. Se preserva el original. */
export class ErrorDeCircuito extends ErrorTestigo {}

/**
 * Fragmentos literales de `contracts/src/testigo.compact` y de los errores de
 * los witnesses de B2. El orden importa: se evalúa de arriba hacia abajo y
 * gana el primero que matchea.
 */
const MENSAJES_CONTRATO: readonly {
  readonly fragmento: string;
  readonly crear: (msg: string, circuito?: TestigoCircuitId, causa?: unknown) => ErrorTestigo;
}[] = [
  // ── denunciar ──
  {
    // Witness `credencialPath` (B2): la hoja no está en el árbol.
    fragmento: 'credencial no emitida para esta org',
    crear: (m, c, e) => new CredencialInvalidaError(m, c, { cause: e }),
  },
  {
    // assert in-circuit: el `checkRoot` no cerró.
    fragmento: 'credencial no pertenece a la organizacion',
    crear: (m, c, e) => new CredencialInvalidaError(m, c, { cause: e }),
  },
  {
    fragmento: 'ya denunciaste este periodo',
    crear: (m, c, e) => new NullifierRepetidoError(m, c, { cause: e }),
  },
  {
    fragmento: 'denuncia ya sellada',
    crear: (m, c, e) => new DenunciaYaSelladaError(m, c, { cause: e }),
  },
  {
    fragmento: 'periodo aun no empezo',
    crear: (m, c, e) => new PeriodoInvalidoError(m, c, { cause: e }),
  },
  {
    fragmento: 'periodo ya vencido',
    crear: (m, c, e) => new PeriodoInvalidoError(m, c, { cause: e }),
  },
  // ── revelarAutoria ──
  {
    fragmento: 'no sos el autor',
    crear: (m, c, e) => new NoSosElAutorError(m, c, { cause: e }),
  },
  {
    // Pre-chequeo local de B2: los secrets guardados no dan ese denunciaId.
    // Misma condición que la C1 del circuito, detectada antes de probar.
    fragmento: 'los secrets guardados no reconstruyen esa denuncia',
    crear: (m, c, e) => new NoSosElAutorError(m, c, { cause: e }),
  },
  {
    fragmento: 'denuncia inexistente',
    crear: (m, c, e) => new DenunciaInexistenteError(m, c, { cause: e }),
  },
  {
    fragmento: 'autoria ya revelada a este fiscal',
    crear: (m, c, e) => new AutoriaYaReveladaError(m, c, { cause: e }),
  },
  // ── registro / emisión ──
  {
    fragmento: 'organizacion ya registrada',
    crear: (m, c, e) => new OrganizacionYaRegistradaError(m, c, { cause: e }),
  },
  {
    fragmento: 'organizacion no registrada',
    crear: (m, c, e) => new OrganizacionNoRegistradaError(m, c, { cause: e }),
  },
];

/**
 * Junta el mensaje del error y el de toda su cadena de `cause`.
 *
 * Hace falta porque midnight-js envuelve los fallos del runtime: el texto del
 * `assert` puede quedar dos o tres niveles adentro. Un `includes` sobre el
 * mensaje de la capa de afuera no lo encontraría.
 */
export const mensajesEncadenados = (error: unknown, profundidad = 8): string => {
  const partes: string[] = [];
  let actual: unknown = error;
  for (let i = 0; i < profundidad && actual !== null && actual !== undefined; i += 1) {
    if (actual instanceof Error) {
      partes.push(actual.message);
      actual = (actual as { cause?: unknown }).cause;
    } else if (typeof actual === 'string') {
      partes.push(actual);
      actual = undefined;
    } else if (typeof actual === 'object') {
      const obj = actual as { message?: unknown; cause?: unknown };
      if (typeof obj.message === 'string') partes.push(obj.message);
      actual = obj.cause;
    } else {
      partes.push(String(actual));
      actual = undefined;
    }
  }
  return partes.join(' | ');
};

/**
 * Traduce el fallo de un circuito al error tipado que corresponde.
 *
 * Si el error ya es un `ErrorTestigo` se devuelve tal cual (idempotente: la
 * capa de arriba puede mapear sin miedo a envolver dos veces).
 */
export const mapearErrorDeCircuito = (
  error: unknown,
  circuito?: TestigoCircuitId,
): ErrorTestigo => {
  if (error instanceof ErrorTestigo) {
    return error;
  }

  // Una tx que la cadena rechazó NO es un fallo de proof time. Se marca como
  // tal para que un caso negativo que llegue por acá sea evidente.
  if (error instanceof CallTxFailedError || error instanceof DeployTxFailedError) {
    return new TxRechazadaError(error, circuito);
  }
  if (error instanceof TxFailedError) {
    return new TxRechazadaError(error, circuito);
  }

  const texto = mensajesEncadenados(error);
  for (const { fragmento, crear } of MENSAJES_CONTRATO) {
    if (texto.includes(fragmento)) {
      return crear(texto, circuito, error);
    }
  }
  return new ErrorDeCircuito(texto === '' ? String(error) : texto, circuito, { cause: error });
};

/** `true` si el error significa "no se emitió ninguna transacción". */
export const fallóEnProofTime = (error: unknown): boolean =>
  error instanceof ErrorTestigo && !(error instanceof TxRechazadaError);
