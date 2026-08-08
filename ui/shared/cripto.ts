/**
 * La cara de la crypto en la UI.
 *
 * Los cinco `pure circuit`s viven en UNA implementación compartida
 * (`@phantomtrace/shared/crypto`) que usa el `persistentHash` del circuito y
 * que `contract-agreement.test.ts` verifica digest por digest contra el
 * contrato compilado. Este archivo ya no los reimplementa: los re-exporta.
 *
 * Históricamente este módulo era una copia SHA-256 propia, no clavada contra
 * el contrato — misma aridad y mismos tags, otro `H`. Eso permitía que la
 * demo y la cadena se desincronizaran en silencio. Desde acá los valores que
 * produce el Cliente son los mismos que produciría la cadena.
 *
 * Lo que sigue viviendo acá son las utilidades del lado de la app (no son
 * circuitos): el hash de la evidencia y los secrets. Esos no cambian al
 * integrar los Bloques A y B — `hashDeArchivo` sigue siendo SHA-256.
 *
 * Nota: `crypto.subtle` exige un secure context. Anda en `localhost`; NO anda
 * si servís la demo desde una IP de LAN por http.
 */

export {
  DOMAIN_TAGS,
  EPOCH_DURATION,
  MERKLE_DEPTH,
  anchorOf,
  bytesToHex,
  credCommitmentOf,
  hexToBytes,
  leafHashOf,
  leafOf,
  nullifierOf,
  pad32,
  padHex32,
  periodBytes32,
  periodHex32,
  receiptOf,
  reportIdOf,
  type Hex32,
} from "@phantomtrace/shared/crypto";

import { bytesToHex, hexToBytes, type Hex32 } from "@phantomtrace/shared/crypto";

/** Alias de conversión que conserva el nombre histórico de la UI. */
export const aHex = bytesToHex;
/** Alias de conversión que conserva el nombre histórico de la UI. */
export const deHex = hexToBytes;

// ── Reporting epochs ──────────────────────────────────────────────────────
// Mirrors `epochDuration()` in the contract: 86 400 seconds = 1 day.
// `report()` forces the public `period` argument to be the CURRENT epoch
// (`start <= blockTime < start + duration`), so the period is never a free
// label chosen by the caller.

export const EPOCH_DURATION_SECONDS = 86_400;

/** The epoch index for a Unix timestamp: `floor(unixSeconds / 86400)`. */
export function epochIndexOf(unixSeconds: number): number {
  return Math.floor(unixSeconds / EPOCH_DURATION_SECONDS);
}

// ── Utilidades del lado de la app (no son circuitos) ──────────────────────

/**
 * Hashea el archivo de evidencia. Esto corre en tu máquina y el contenido no
 * se transmite a ningún lado — ni al proof server, que sólo recibe el hash.
 * Sigue siendo SHA-256 después de integrar A y B.
 */
export async function hashDeArchivo(contenido: Uint8Array): Promise<Hex32> {
  const digest = await crypto.subtle.digest("SHA-256", contenido as unknown as ArrayBuffer);
  return bytesToHex(new Uint8Array(digest));
}

/** Deriva un identificador estable de 32 bytes a partir de una etiqueta. */
export async function idDesdeEtiqueta(etiqueta: string): Promise<Hex32> {
  const bytes = new TextEncoder().encode(etiqueta);
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return bytesToHex(new Uint8Array(digest));
}

/** Secret nuevo, aleatorio, que nunca sale de esta máquina. */
export function secretNuevo(): Hex32 {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}
