// B2.1 — Almacén local de secrets del denunciante.
//
// Formato v2 (docs/03-plan-ejecucion.md §3.2), congelado:
//
//   { "version": 2,
//     "credencialSecret": "<hex64>",
//     "orgId": "<hex64>",
//     "hojaIndex": 3 | null,
//     "denuncias": { "<denunciaId>": { "secretDenuncia": "<hex64>",
//                                      "evidenciaHash": "<hex64>" } } }
//
// ── Por qué v2: un secret POR DENUNCIA, no uno global ────────────────────
// El hallazgo H-3 del review de seguridad (docs/03 §3.4, reproducido en el
// simulador) es que un `secretPersonal` único reusado en todas las denuncias
// convierte cualquier revelación de autoría en una desanonimización
// RETROACTIVA de todo el historial: quien recibe el export aprende el secret
// y con él puede recomputar `denunciaIdDe(evidenciaHash, secret)` para
// cualquier evidencia que sospeche, y así atribuirle al autor todas sus
// denuncias pasadas. Con un secret fresco por denuncia el daño de un reveal
// queda acotado a ESA denuncia.
//
// Por eso `denuncias` es un mapa: cada `denunciaId` guarda el par
// (secretDenuncia, evidenciaHash) que lo generó, y es lo único que hace
// falta para revelar la autoría de esa denuncia meses después.
//
// El archivo vive en `secrets/`, que ya está en `.gitignore`, y se escribe
// con permisos 0600 (solo el dueño).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { esPeriodoSerializado, periodoAJson, periodoDesdeJson } from './epoca.js';
import {
  type Hex32,
  aHex,
  bytesAleatorios32,
  comoHex32,
  esHex32,
} from './hex.js';

// ── Tipos del formato persistido ────────────────────────────────────────

export const VERSION_SECRETS = 2 as const;

export interface RegistroDenuncia {
  /** Secret fresco de ESTA denuncia. Nunca se reusa en otra. */
  readonly secretDenuncia: Hex32;
  /** sha-256 del archivo de evidencia (el archivo nunca sale de la máquina). */
  readonly evidenciaHash: Hex32;
  /**
   * Época en que se emitió, como string decimal.
   *
   * `periodo` es `Uint<64>` en el contrato -> `bigint` en TS, y `bigint` no
   * sobrevive a `JSON.stringify` (lanza TypeError). Se guarda serializado y
   * se recupera con `periodoDeRegistro`. Es opcional porque NO hace falta
   * para revelar autoría — `revelarAutoria` solo usa (secretDenuncia,
   * evidenciaHash). Queda como dato de diagnóstico: permite explicar un
   * "ya denunciaste este periodo" sin adivinar.
   */
  readonly periodo?: string;
}

/** Época de un registro como bigint, o null si no se guardó. */
export function periodoDeRegistro(registro: RegistroDenuncia): bigint | null {
  return registro.periodo === undefined ? null : periodoDesdeJson(registro.periodo);
}

export interface SecretsDenunciante {
  readonly version: typeof VERSION_SECRETS;
  /** Secret de la credencial. Lo genera el CLIENTE; el emisor nunca lo ve. */
  readonly credencialSecret: Hex32;
  /** Organización que emitió la credencial. */
  readonly orgId: Hex32;
  /** Índice de la hoja en el árbol on-chain; null hasta que se emite. */
  readonly hojaIndex: number | null;
  /** denunciaId -> secrets de esa denuncia. */
  readonly denuncias: Readonly<Record<Hex32, RegistroDenuncia>>;
}

export class SecretsCorruptosError extends Error {
  constructor(detalle: string, public readonly ruta: string) {
    super(`secrets inválidos en ${ruta}: ${detalle}`);
    this.name = 'SecretsCorruptosError';
  }
}

export class SecretsNoExistenError extends Error {
  constructor(public readonly ruta: string) {
    super(`no hay secrets en ${ruta} — corré \`emitir-credencial\` primero`);
    this.name = 'SecretsNoExistenError';
  }
}

// ── Ubicación del archivo ───────────────────────────────────────────────

const MODO_ARCHIVO = 0o600;
const MODO_DIRECTORIO = 0o700;

/**
 * Raíz del repo: el primer ancestro con un `package.json` que declare
 * `workspaces`. Se resuelve desde la ubicación del módulo y NO desde
 * `process.cwd()`, porque `npm run <script> --workspace=app` corre con cwd en
 * `app/` y `node dist/scripts/x.js` desde la raíz corre con cwd en la raíz:
 * sin esto, los dos escribirían secrets en lugares distintos y el denunciante
 * perdería el acceso a sus propias denuncias.
 */
function raizRepo(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i++) {
    const pj = path.join(dir, 'package.json');
    if (fs.existsSync(pj)) {
      try {
        const json: unknown = JSON.parse(fs.readFileSync(pj, 'utf8'));
        if (
          typeof json === 'object' &&
          json !== null &&
          'workspaces' in json
        ) {
          return dir;
        }
      } catch {
        // package.json ilegible: seguir subiendo.
      }
    }
    const padre = path.dirname(dir);
    if (padre === dir) break;
    dir = padre;
  }
  return process.cwd();
}

/**
 * Ruta del almacén. Override con `TESTIGO_SECRETS` (lo usan los selftests
 * para no pisar los secrets reales del denunciante).
 */
export function rutaSecrets(): string {
  const override = process.env['TESTIGO_SECRETS'];
  if (override !== undefined && override !== '') return path.resolve(override);
  return path.join(raizRepo(), 'secrets', 'denunciante.json');
}

function resolver(ruta?: string): string {
  return ruta === undefined ? rutaSecrets() : path.resolve(ruta);
}

// ── Validación ──────────────────────────────────────────────────────────

function exigirHex32(valor: unknown, campo: string, ruta: string): Hex32 {
  if (!esHex32(valor)) {
    throw new SecretsCorruptosError(`campo "${campo}" no es un hex de 64 chars`, ruta);
  }
  return valor;
}

function validar(crudo: unknown, ruta: string): SecretsDenunciante {
  if (typeof crudo !== 'object' || crudo === null || Array.isArray(crudo)) {
    throw new SecretsCorruptosError('el JSON no es un objeto', ruta);
  }
  const o = crudo as Record<string, unknown>;

  if (o['version'] !== VERSION_SECRETS) {
    throw new SecretsCorruptosError(
      `version ${String(o['version'])}, se esperaba ${VERSION_SECRETS}. ` +
        'El formato v1 tenía un `secretPersonal` global, inseguro por H-3 ' +
        '(docs/03 §3.4): no se migra automáticamente, hay que reemitir.',
      ruta,
    );
  }

  const hojaIndex = o['hojaIndex'];
  if (
    hojaIndex !== null &&
    !(typeof hojaIndex === 'number' && Number.isInteger(hojaIndex) && hojaIndex >= 0)
  ) {
    throw new SecretsCorruptosError('"hojaIndex" no es un entero >= 0 ni null', ruta);
  }

  const crudoDenuncias = o['denuncias'];
  if (
    typeof crudoDenuncias !== 'object' ||
    crudoDenuncias === null ||
    Array.isArray(crudoDenuncias)
  ) {
    throw new SecretsCorruptosError('"denuncias" no es un objeto', ruta);
  }

  const denuncias: Record<Hex32, RegistroDenuncia> = {};
  for (const [id, valor] of Object.entries(crudoDenuncias as Record<string, unknown>)) {
    exigirHex32(id, `denuncias["${id}"] (la clave)`, ruta);
    if (typeof valor !== 'object' || valor === null) {
      throw new SecretsCorruptosError(`denuncias["${id}"] no es un objeto`, ruta);
    }
    const r = valor as Record<string, unknown>;
    const periodo = r['periodo'];
    if (periodo !== undefined && !esPeriodoSerializado(periodo)) {
      throw new SecretsCorruptosError(
        `denuncias["${id}"].periodo no es un entero decimal en string`,
        ruta,
      );
    }
    denuncias[id] = {
      secretDenuncia: exigirHex32(r['secretDenuncia'], `denuncias["${id}"].secretDenuncia`, ruta),
      evidenciaHash: exigirHex32(r['evidenciaHash'], `denuncias["${id}"].evidenciaHash`, ruta),
      ...(periodo === undefined ? {} : { periodo }),
    };
  }

  return {
    version: VERSION_SECRETS,
    credencialSecret: exigirHex32(o['credencialSecret'], 'credencialSecret', ruta),
    orgId: exigirHex32(o['orgId'], 'orgId', ruta),
    hojaIndex: hojaIndex as number | null,
    denuncias,
  };
}

// ── Lectura / escritura ─────────────────────────────────────────────────

export function existenSecrets(ruta?: string): boolean {
  return fs.existsSync(resolver(ruta));
}

/** Devuelve null si el archivo no existe. Lanza si existe pero está roto. */
export function leerSecrets(ruta?: string): SecretsDenunciante | null {
  const destino = resolver(ruta);
  if (!fs.existsSync(destino)) return null;

  // Si alguien aflojó los permisos (p. ej. copiando el archivo), se corrigen
  // acá: un archivo de secrets legible por el grupo/otros no sirve de nada.
  const modo = fs.statSync(destino).mode & 0o777;
  if (modo !== MODO_ARCHIVO) {
    fs.chmodSync(destino, MODO_ARCHIVO);
    console.warn(
      `[secrets] permisos ${modo.toString(8)} en ${destino} — corregidos a 600`,
    );
  }

  let crudo: unknown;
  try {
    crudo = JSON.parse(fs.readFileSync(destino, 'utf8'));
  } catch (e) {
    throw new SecretsCorruptosError(`JSON ilegible (${String(e)})`, destino);
  }
  return validar(crudo, destino);
}

/** Igual que `leerSecrets` pero lanza si no existe. */
export function exigirSecrets(ruta?: string): SecretsDenunciante {
  const s = leerSecrets(ruta);
  if (s === null) throw new SecretsNoExistenError(resolver(ruta));
  return s;
}

/**
 * Escritura atómica con permisos 0600.
 *
 * Se escribe a un temporal y se renombra: si el proceso muere a la mitad, el
 * archivo viejo queda intacto. Perder este archivo a la mitad de un write
 * significa perder el acceso a las denuncias ya emitidas — no hay backup.
 * El temporal se crea ya con modo 0600 y `rename` preserva el modo, así que
 * los bytes nunca existen en disco con permisos laxos.
 */
export function escribirSecrets(secrets: SecretsDenunciante, ruta?: string): void {
  const destino = resolver(ruta);
  const dir = path.dirname(destino);
  fs.mkdirSync(dir, { recursive: true, mode: MODO_DIRECTORIO });

  const tmp = path.join(dir, `.${path.basename(destino)}.${process.pid}.tmp`);
  const json = `${JSON.stringify(secrets, null, 2)}\n`;
  fs.writeFileSync(tmp, json, { mode: MODO_ARCHIVO });
  try {
    fs.renameSync(tmp, destino);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
  fs.chmodSync(destino, MODO_ARCHIVO);
}

// ── Operaciones de alto nivel ───────────────────────────────────────────

/**
 * Crea el almacén con un `credencialSecret` fresco y lo persiste.
 *
 * SEGURIDAD (H-4, docs/03 §3.4): el secret lo genera EL CLIENTE, acá. Al
 * emisor de credenciales se le manda únicamente
 * `credCommitmentDe(credencialSecret)`. Si el emisor generara el secret,
 * podría recomputar `nullifierDe(credSecret, orgId, periodo)` de cualquier
 * empleado y desanonimizar quién denunció en cada período.
 */
export function crearSecrets(orgId: Uint8Array | Hex32, ruta?: string): SecretsDenunciante {
  const secrets: SecretsDenunciante = {
    version: VERSION_SECRETS,
    credencialSecret: aHex(bytesAleatorios32()),
    orgId: comoHex32(orgId, 'orgId'),
    hojaIndex: null,
    denuncias: {},
  };
  escribirSecrets(secrets, ruta);
  return secrets;
}

/** Lee los secrets existentes o crea unos nuevos para `orgId`. */
export function leerOCrearSecrets(
  orgId: Uint8Array | Hex32,
  ruta?: string,
): SecretsDenunciante {
  const existentes = leerSecrets(ruta);
  if (existentes === null) return crearSecrets(orgId, ruta);

  const esperado = comoHex32(orgId, 'orgId');
  if (existentes.orgId !== esperado) {
    throw new SecretsCorruptosError(
      `los secrets son de la org ${existentes.orgId}, se pidió ${esperado}. ` +
        'Usá otra ruta (TESTIGO_SECRETS) en vez de pisar la credencial actual.',
      resolver(ruta),
    );
  }
  return existentes;
}

/** Guarda el índice de hoja que devolvió `emitirCredencial`. */
export function fijarHojaIndex(hojaIndex: number, ruta?: string): SecretsDenunciante {
  const actual = exigirSecrets(ruta);
  const nuevo: SecretsDenunciante = { ...actual, hojaIndex };
  escribirSecrets(nuevo, ruta);
  return nuevo;
}

/**
 * Secret fresco para UNA denuncia. Se llama una vez por denuncia; el
 * resultado nunca se reusa (ver la nota de v2 arriba).
 */
export function nuevoSecretDenuncia(): Uint8Array {
  return bytesAleatorios32();
}

/**
 * Registra los secrets de una denuncia ya emitida.
 *
 * Se niega a pisar un `denunciaId` existente con datos distintos: sobrescribir
 * borraría el único secret que permite revelar la autoría de esa denuncia, y
 * es irrecuperable. Re-registrar los mismos valores es idempotente.
 */
export function agregarDenuncia(
  denunciaId: Uint8Array | Hex32,
  registro: {
    secretDenuncia: Uint8Array | Hex32;
    evidenciaHash: Uint8Array | Hex32;
    periodo?: bigint;
  },
  ruta?: string,
): SecretsDenunciante {
  const actual = exigirSecrets(ruta);
  const id = comoHex32(denunciaId, 'denunciaId');
  const nuevoRegistro: RegistroDenuncia = {
    secretDenuncia: comoHex32(registro.secretDenuncia, 'secretDenuncia'),
    evidenciaHash: comoHex32(registro.evidenciaHash, 'evidenciaHash'),
    ...(registro.periodo === undefined ? {} : { periodo: periodoAJson(registro.periodo) }),
  };

  const previo = actual.denuncias[id];
  if (previo !== undefined) {
    if (
      previo.secretDenuncia !== nuevoRegistro.secretDenuncia ||
      previo.evidenciaHash !== nuevoRegistro.evidenciaHash
    ) {
      throw new SecretsCorruptosError(
        `la denuncia ${id} ya está registrada con otros secrets — ` +
          'pisarla dejaría esa denuncia sin forma de revelar autoría',
        resolver(ruta),
      );
    }
    return actual;
  }

  const nuevo: SecretsDenunciante = {
    ...actual,
    denuncias: { ...actual.denuncias, [id]: nuevoRegistro },
  };
  escribirSecrets(nuevo, ruta);
  return nuevo;
}

/** Secrets de una denuncia, o null si no está en el almacén. */
export function obtenerDenuncia(
  denunciaId: Uint8Array | Hex32,
  ruta?: string,
): RegistroDenuncia | null {
  const actual = exigirSecrets(ruta);
  return actual.denuncias[comoHex32(denunciaId, 'denunciaId')] ?? null;
}

/** denunciaIds registrados localmente, en orden de inserción. */
export function listarDenuncias(ruta?: string): Hex32[] {
  return Object.keys(exigirSecrets(ruta).denuncias);
}
