// Índice de época de denuncia (el argumento público `periodo` de `denunciar`).
//
// `periodo` NO es una etiqueta libre elegida por quien llama: el circuito lo
// ata al reloj de la cadena con `blockTimeGte(inicio)` / `blockTimeLt(fin)`
// (contracts/src/testigo.compact, circuito `denunciar`, comentario C0). Ese
// fix es el hallazgo HIGH-1 del review (docs/03-plan-ejecucion.md §3.4): con
// un `periodo` libre, la misma credencial generaba N nullifiers distintos
// variando la etiqueta y el anti-spam no servía para nada.
//
// ⚠️ UNIDAD: SEGUNDOS. El blockTime de Midnight es `secondsSinceEpoch`, y
// `duracionEpoca()` del contrato devuelve 86400 (un día EN SEGUNDOS). Pasar
// milisegundos hace que `denunciar` falle SIEMPRE contra la cadena, con un
// "periodo aun no empezo" que no dice nada sobre la causa real.

/**
 * Duración de una época en SEGUNDOS. Espejo de `duracionEpoca()` en
 * `contracts/src/testigo.compact`. Si allá cambia, acá también.
 *
 * Es gruesa a propósito (1 día): períodos finos permiten correlacionar
 * denuncias por timing (spec §6).
 */
export const DURACION_EPOCA_SEG = 86400n;

/** Índice de época de un instante Unix dado EN SEGUNDOS. */
export function epocaDeSegundos(segundosUnix: bigint | number): bigint {
  const s = typeof segundosUnix === 'bigint' ? segundosUnix : BigInt(Math.floor(segundosUnix));
  if (s < 0n) throw new RangeError('el instante Unix no puede ser negativo');
  return s / DURACION_EPOCA_SEG;
}

/**
 * Época en curso según el reloj local.
 *
 * `Date.now()` viene en MILISEGUNDOS: la división por 1000 de acá es la que
 * evita el bug descrito arriba. Es el valor que va como `periodo` a
 * `denunciar(orgId, periodo)` y a `nullifierDe(sec, orgId, periodo)`.
 *
 * Ojo: si el reloj local está corrido respecto del de la cadena por más de lo
 * que falta para el cambio de época, el circuito rechaza. La app puede
 * reintentar con `epocaActual()` recalculada.
 */
export function epocaActual(): bigint {
  return epocaDeSegundos(Math.floor(Date.now() / 1000));
}

/** Instante Unix (segundos) en que arranca una época. */
export function inicioDeEpoca(periodo: bigint): bigint {
  return periodo * DURACION_EPOCA_SEG;
}

/** Instante Unix (segundos, exclusivo) en que termina una época. */
export function finDeEpoca(periodo: bigint): bigint {
  return inicioDeEpoca(periodo) + DURACION_EPOCA_SEG;
}

// ── Serialización ───────────────────────────────────────────────────────
// `JSON.stringify` lanza TypeError ante un bigint. Todo `periodo` que se
// persista viaja como string decimal y vuelve con `periodoDesdeJson`.

const RE_DECIMAL = /^(0|[1-9][0-9]*)$/;

export function periodoAJson(periodo: bigint): string {
  return periodo.toString(10);
}

export function periodoDesdeJson(valor: string): bigint {
  if (!RE_DECIMAL.test(valor)) {
    throw new TypeError(`"${valor}" no es un periodo válido (entero decimal sin signo)`);
  }
  return BigInt(valor);
}

export function esPeriodoSerializado(valor: unknown): valor is string {
  return typeof valor === 'string' && RE_DECIMAL.test(valor);
}
