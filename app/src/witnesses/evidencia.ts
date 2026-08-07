// B2.2 — Hash local del archivo de evidencia.
//
// ┌────────────────────────────────────────────────────────────────────────┐
// │ EL ARCHIVO DE EVIDENCIA NUNCA SALE DE ESTA MÁQUINA.                    │
// │                                                                        │
// │ No se sube a IPFS, ni a un bucket, ni al indexer, ni al proof server   │
// │ (que además corre local, docs/01-arquitectura.md §1). Lo único que     │
// │ cruza al circuito es su digest de 32 bytes, y lo único que llega al    │
// │ ledger es `denunciaId = H(dom ‖ evidenciaHash ‖ secretDenuncia)` —     │
// │ un hash del hash, con un secret de 32 bytes de entropía en el medio.   │
// │                                                                        │
// │ Este módulo NO tiene ni debe tener imports de red. Si algún día uno    │
// │ aparece acá, es un bug de privacidad, no una feature.                  │
// └────────────────────────────────────────────────────────────────────────┘
//
// Sobre por qué el secret importa: `evidenciaHash` por sí solo NO es un
// secreto. El empleador es dueño de los documentos denunciados y puede
// hashearlos todos y comparar. Lo que hace que `denunciaId` no sea invertible
// es el `secretDenuncia` de 32 bytes aleatorios que se le concatena
// (docs/03-plan-ejecucion.md §3.2).

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import * as path from 'node:path';

import { type Hex32, LARGO_BYTES, aHex } from './hex.js';

export class EvidenciaIlegibleError extends Error {
  constructor(ruta: string, causa: unknown) {
    super(`no se pudo leer la evidencia en ${ruta}: ${String(causa)}`);
    this.name = 'EvidenciaIlegibleError';
  }
}

/** sha-256 de un buffer en memoria -> 32 bytes. */
export function hashEvidenciaBytes(datos: Uint8Array): Uint8Array {
  const digest = Uint8Array.from(createHash('sha256').update(datos).digest());
  /* c8 ignore next */
  if (digest.length !== LARGO_BYTES) throw new Error('sha-256 no devolvió 32 bytes');
  return digest;
}

/**
 * sha-256 del archivo -> 32 bytes. Determinístico: mismo contenido, mismo
 * hash, independientemente del nombre, la ruta o la fecha del archivo.
 *
 * Se lee por stream y no con `readFileSync` para que una evidencia grande
 * (un PDF escaneado, un dump de mails) no tenga que entrar entera en memoria.
 */
export async function hashEvidenciaArchivo(ruta: string): Promise<Uint8Array> {
  const absoluta = path.resolve(ruta);
  try {
    const info = await stat(absoluta);
    if (!info.isFile()) throw new Error('no es un archivo regular');
  } catch (e) {
    throw new EvidenciaIlegibleError(absoluta, e);
  }

  const hash = createHash('sha256');
  try {
    for await (const chunk of createReadStream(absoluta)) {
      hash.update(chunk as Buffer);
    }
  } catch (e) {
    throw new EvidenciaIlegibleError(absoluta, e);
  }
  return Uint8Array.from(hash.digest());
}

export interface ResumenEvidencia {
  /** Digest de 32 bytes: lo ÚNICO de la evidencia que entra al circuito. */
  readonly hash: Uint8Array;
  readonly hashHex: Hex32;
  /** Metadata puramente local, para que el CLI muestre qué se hasheó. */
  readonly nombre: string;
  readonly bytes: number;
}

/**
 * Hash + metadata para la salida del CLI (`denunciar.ts`, B4.3).
 *
 * `nombre` y `bytes` son SOLO para imprimir en la terminal del denunciante:
 * no se mandan a ningún lado. El nombre de archivo suele ser identificatorio
 * ("sumario-2026-planta-quilmes.pdf") — que quede fuera del circuito es
 * deliberado.
 */
export async function resumenEvidencia(ruta: string): Promise<ResumenEvidencia> {
  const absoluta = path.resolve(ruta);
  const info = await stat(absoluta).catch((e: unknown) => {
    throw new EvidenciaIlegibleError(absoluta, e);
  });
  const hash = await hashEvidenciaArchivo(absoluta);
  return {
    hash,
    hashHex: aHex(hash),
    nombre: path.basename(absoluta),
    bytes: info.size,
  };
}
