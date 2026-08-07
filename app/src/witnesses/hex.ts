// Conversión hex <-> bytes para los valores de 32 bytes que cruzan la
// frontera app <-> contrato (docs/03-plan-ejecucion.md §3.1: `Hex32` = 64
// chars hex en minúscula, SIN prefijo `0x`).
//
// Todo lo que se persiste en `secrets/denunciante.json` viaja como Hex32;
// todo lo que entra a un circuito o a un witness viaja como `Uint8Array` de
// 32 bytes exactos. Este módulo es el único lugar donde se traduce.

import { randomBytes } from 'node:crypto';

/** 64 caracteres hex en minúscula, sin `0x`. */
export type Hex32 = string;

/** Tamaño de todos los valores del protocolo (Bytes<32> en Compact). */
export const LARGO_BYTES = 32;

const RE_HEX32 = /^[0-9a-f]{64}$/;

export class HexInvalidoError extends Error {
  constructor(campo: string, valor: unknown) {
    const visto =
      typeof valor === 'string' ? `string de ${valor.length} chars` : typeof valor;
    super(`"${campo}" no es un Hex32 válido (64 chars hex minúscula, sin 0x): ${visto}`);
    this.name = 'HexInvalidoError';
  }
}

export function esHex32(valor: unknown): valor is Hex32 {
  return typeof valor === 'string' && RE_HEX32.test(valor);
}

/** Bytes -> Hex32. Exige exactamente 32 bytes: un valor corto sería un bug. */
export function aHex(bytes: Uint8Array): Hex32 {
  if (bytes.length !== LARGO_BYTES) {
    throw new HexInvalidoError('bytes', `Uint8Array de ${bytes.length} bytes`);
  }
  let salida = '';
  for (const b of bytes) salida += b.toString(16).padStart(2, '0');
  return salida;
}

/**
 * Hex32 -> bytes. Valida con regex ANTES de convertir: `Buffer.from(x, 'hex')`
 * trunca en silencio ante caracteres inválidos y devolvería un valor corto que
 * después explota adentro del circuito con un error ilegible.
 */
export function aBytes32(hex: string, campo = 'hex'): Uint8Array {
  if (!esHex32(hex)) throw new HexInvalidoError(campo, hex);
  const bytes = new Uint8Array(LARGO_BYTES);
  for (let i = 0; i < LARGO_BYTES; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Acepta cualquiera de las dos representaciones y devuelve bytes. */
export function comoBytes32(valor: Uint8Array | Hex32, campo = 'valor'): Uint8Array {
  if (typeof valor === 'string') return aBytes32(valor, campo);
  if (valor.length !== LARGO_BYTES) throw new HexInvalidoError(campo, valor);
  return valor;
}

/** Acepta cualquiera de las dos representaciones y devuelve Hex32. */
export function comoHex32(valor: Uint8Array | Hex32, campo = 'valor'): Hex32 {
  if (typeof valor === 'string') {
    if (!esHex32(valor)) throw new HexInvalidoError(campo, valor);
    return valor;
  }
  return aHex(valor);
}

/**
 * 32 bytes de entropía criptográfica del sistema.
 *
 * SEGURIDAD (docs/03 §3.2): los secrets del protocolo se generan SIEMPRE acá
 * y NUNCA se derivan de una password, una seed mnemónica ni de la evidencia.
 * La entropía de `secretDenuncia` es lo único que impide invertir
 * `denunciaId = H(dom ‖ evidenciaHash ‖ secretDenuncia)` por fuerza bruta:
 * `evidenciaHash` es enumerable por el empleador, porque los documentos
 * denunciados son suyos y puede hashearlos todos.
 */
export function bytesAleatorios32(): Uint8Array {
  return Uint8Array.from(randomBytes(LARGO_BYTES));
}
