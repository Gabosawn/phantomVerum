// Acceso al `@midnight-ntwrk/compact-runtime` que usa EL CONTRATO GENERADO.
//
// ⚠️ ESTO ES UN PARCHE DE DIAGNÓSTICO, NO UNA SOLUCIÓN. Lo usa únicamente
// `selftest-simulador.ts`. Ver el bloqueo real más abajo.
//
// ── El problema ─────────────────────────────────────────────────────────
// Hoy hay DOS copias físicas de compact-runtime (y de su wasm
// `onchain-runtime-v3`) instaladas, ambas 0.16.0 / 3.1.0:
//
//   node_modules/@midnight-ntwrk/compact-runtime            <- la que ve app/
//   contracts/node_modules/@midnight-ntwrk/compact-runtime  <- la que ve el
//                                                              contrato generado
//
// `contracts/output/contract/index.js` resuelve el runtime hacia arriba y
// encuentra primero la copia anidada. `app/` resuelve y encuentra la del
// root. Son dos instancias distintas del mismo módulo wasm, así que los
// `instanceof` que el runtime usa para validar sus argumentos fallan al
// cruzarlas:
//
//   CompactError: 'contractState' parameter Array(5) [...] has unexpected type
//       at coerceToChargedState (compact-runtime/dist/circuit-context.js:33)
//
// El objeto ES un ChargedState — pero de la OTRA copia, así que no es
// `instanceof` de la clase que el validador conoce.
//
// ── El arreglo de verdad (NO es de este módulo) ─────────────────────────
// Borrar `contracts/node_modules/` (es un install anidado viejo; las dos
// copias son la MISMA versión, así que al deduplicar todo resuelve al root)
// y reinstalar desde la raíz. Es dueño de eso el agente de toolchain: acá no
// se toca ni node_modules ni package.json.
//
// Y hace falta de verdad: `@midnight-ntwrk/midnight-js-contracts` (bloque B3)
// crea los contextos con SU propia copia del runtime — la del root — así que
// el truco de este módulo no lo salva. Mientras haya dos copias, B3 se choca
// con el mismo CompactError apenas intente deployar o llamar un circuito.
//
// ── Qué hace este módulo ────────────────────────────────────────────────
// Resuelve el especificador `@midnight-ntwrk/compact-runtime` COMO LO
// RESUELVE EL CONTRATO (desde la URL del módulo generado) e importa esa
// misma instancia. El caché de módulos ESM de Node indexa por URL resuelta,
// así que se obtiene exactamente el objeto que el contrato ya tiene cargado
// y los `instanceof` cierran.
//
// Cuando se deduplique, las dos rutas van a coincidir y este módulo va a
// devolver la copia del root sin cambiar una línea: sigue siendo correcto
// después del arreglo.

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import type * as RuntimeCompact from '@midnight-ntwrk/compact-runtime';

/** El módulo generado por `compact compile`. */
export const URL_CONTRATO = new URL(
  '../../../contracts/output/contract/index.js',
  import.meta.url,
);

/** Ruta del runtime tal como lo resuelve el contrato. */
export const rutaRuntimeDelContrato: string = createRequire(URL_CONTRATO).resolve(
  '@midnight-ntwrk/compact-runtime',
);

/** Ruta del runtime tal como lo resuelve `app/`. */
export const rutaRuntimeDeLaApp: string = createRequire(import.meta.url).resolve(
  '@midnight-ntwrk/compact-runtime',
);

/**
 * true cuando hay UNA sola copia instalada, que es como tiene que estar.
 * Si es false, B3 va a chocarse con el CompactError descrito arriba.
 */
export const runtimeUnificado: boolean = rutaRuntimeDelContrato === rutaRuntimeDeLaApp;

/**
 * La instancia de compact-runtime que comparte realm con el contrato.
 * Los tipos salen del paquete instalado en el root: misma versión exacta
 * (0.16.0), así que la forma es idéntica; lo único que cambia es la
 * identidad de las clases en runtime.
 */
export const runtime = (await import(
  pathToFileURL(rutaRuntimeDelContrato).href
)) as typeof RuntimeCompact;
