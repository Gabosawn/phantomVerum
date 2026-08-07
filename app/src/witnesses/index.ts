// B2.3 — Los 4 witnesses del contrato + el estado privado que los alimenta.
//
// Tipado contra `contracts/output/contract/index.d.ts`, el .d.ts que genera
// `compact compile`. Nada de esta forma está inventada: si el contrato cambia
// y se recompila, `tsc -p app` rompe acá.
//
// La ruta relativa al contrato generado tiene la MISMA profundidad desde
// `app/src/witnesses/` que desde `app/dist/witnesses/`, así que sirve igual
// para el typecheck y para el runtime tras `tsc -p app`.

import type { Ledger, Witnesses } from '../../../contracts/output/contract/index.js';
import { pureCircuits } from '../../../contracts/output/contract/index.js';

import { type Hex32, aHex, bytesAleatorios32, comoBytes32 } from './hex.js';
import type { RegistroDenuncia, SecretsDenunciante } from './secrets.js';

export { pureCircuits };
export type { Ledger, Witnesses };

// ─────────────────────────────────────────────────────────────────────────
// Errores
// ─────────────────────────────────────────────────────────────────────────

/**
 * Único error que puede salir de `credencialPath`.
 *
 * SEGURIDAD (docs/03 §3.4, regla 4 de H-5): se falla CERRADO y con un mensaje
 * ÚNICO. No se distingue "no sos empleado de esta org" de "tenés credencial
 * pero todavía no la emitieron" ni de "no hay credencial cargada": las tres
 * situaciones salen por el mismo lugar, con el mismo texto y habiendo hecho
 * el mismo trabajo (ver `bytesDeCredencial`). Un mensaje más específico sería
 * un oráculo de pertenencia a la organización.
 */
export class CredencialNoEmitidaError extends Error {
  constructor() {
    super('credencial no emitida para esta org');
    this.name = 'CredencialNoEmitidaError';
  }
}

/**
 * La app llamó a un circuito que necesita los secrets de una denuncia sin
 * haberla stageado antes. Es un bug de la app, no una condición del ledger:
 * ocurre 100 % local, antes de generar prueba y sin emitir tx.
 */
export class DenunciaNoStageadaError extends Error {
  constructor(circuito: string) {
    super(
      `no hay denuncia activa en el estado privado (la necesita "${circuito}"). ` +
        'Como los witnesses no toman argumentos, la app tiene que stagear la ' +
        'denuncia con stagearDenunciaNueva()/stagearDenunciaGuardada() ANTES ' +
        'de llamar al circuito.',
    );
    this.name = 'DenunciaNoStageadaError';
  }
}

export class DenunciaNoCoincideError extends Error {
  constructor(esperado: Hex32, obtenido: Hex32) {
    super(
      `los secrets guardados no reconstruyen esa denuncia: ` +
        `esperado ${esperado}, sale ${obtenido}`,
    );
    this.name = 'DenunciaNoCoincideError';
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Estado privado
// ─────────────────────────────────────────────────────────────────────────

/**
 * La denuncia "en foco" del estado privado.
 *
 * Existe porque los witnesses de Compact NO TOMAN ARGUMENTOS: `secretPersonal()`
 * y `evidenciaHash()` solo ven `context.privateState`. Como el review de
 * seguridad obliga a un secret distinto POR DENUNCIA (H-3, docs/03 §3.4), el
 * único canal para decirle al witness *cuál* de todos los secrets usar es
 * dejar el correcto stageado acá antes de invocar el circuito.
 */
export interface DenunciaStageada {
  /** Secret fresco de ESTA denuncia. Nunca compartido con otra. */
  readonly secretDenuncia: Uint8Array;
  /** sha-256 del archivo de evidencia, calculado local (ver evidencia.ts). */
  readonly evidenciaHash: Uint8Array;
  /** `denunciaIdDe(evidenciaHash, secretDenuncia)`, precomputado. */
  readonly denunciaId: Uint8Array;
}

/**
 * Estado privado del contrato (el `PS` de `Witnesses<PS>`).
 *
 * Nada de acá sale nunca de la máquina: no va a la tx, ni al indexer, ni al
 * proof server salvo como entrada de la prueba local.
 */
export interface EstadoPrivadoTestigo {
  readonly version: 2;
  /** Secret de la credencial, generado por el cliente. null si no hay. */
  readonly credencialSecret: Uint8Array | null;
  /**
   * Org de la credencial. Tiene que ser EL MISMO `orgId` que se le pasa a
   * `denunciar(orgId, periodo)`: el circuito reconstruye la hoja con su
   * argumento público y el witness la busca con este valor. Si difieren, el
   * `checkRoot` in-circuit falla — cerrado, pero con un error confuso.
   */
  readonly orgId: Uint8Array | null;
  /** Denuncia stageada para el próximo `denunciar` / `revelarAutoria`. */
  readonly denunciaActiva: DenunciaStageada | null;
}

export function estadoPrivadoVacio(): EstadoPrivadoTestigo {
  return { version: 2, credencialSecret: null, orgId: null, denunciaActiva: null };
}

/** Carga la credencial del almacén local (`secrets/denunciante.json`). */
export function estadoPrivadoDesdeSecrets(
  secrets: SecretsDenunciante,
): EstadoPrivadoTestigo {
  return {
    version: 2,
    credencialSecret: comoBytes32(secrets.credencialSecret, 'credencialSecret'),
    orgId: comoBytes32(secrets.orgId, 'orgId'),
    denunciaActiva: null,
  };
}

export function conCredencial(
  ps: EstadoPrivadoTestigo,
  credencialSecret: Uint8Array | Hex32,
  orgId: Uint8Array | Hex32,
): EstadoPrivadoTestigo {
  return {
    ...ps,
    credencialSecret: comoBytes32(credencialSecret, 'credencialSecret'),
    orgId: comoBytes32(orgId, 'orgId'),
  };
}

export function tieneCredencial(ps: EstadoPrivadoTestigo): boolean {
  return ps.credencialSecret !== null && ps.orgId !== null;
}

/**
 * Commitment que se le entrega al emisor de credenciales.
 *
 * SEGURIDAD (H-4): esto — y no `credencialSecret` — es lo único que la
 * organización recibe. Con el secret podría recomputar
 * `nullifierDe(credSecret, orgId, periodo)` de cualquier empleado y saber
 * quién denunció en cada período.
 */
export function commitmentDeCredencial(ps: EstadoPrivadoTestigo): Uint8Array {
  if (ps.credencialSecret === null) throw new CredencialNoEmitidaError();
  return pureCircuits.credCommitmentDe(ps.credencialSecret);
}

/**
 * Hoja de esta credencial en el árbol global:
 * `hojaDe(orgId, credCommitmentDe(credSecret))` — dos hashes, igual que
 * dentro del circuito `denunciar`.
 */
export function hojaDeCredencial(ps: EstadoPrivadoTestigo): Uint8Array {
  if (ps.credencialSecret === null || ps.orgId === null) throw new CredencialNoEmitidaError();
  return pureCircuits.hojaDe(ps.orgId, pureCircuits.credCommitmentDe(ps.credencialSecret));
}

// ── Staging de la denuncia activa ───────────────────────────────────────

/** `denunciaIdDe(evidenciaHash, secretDenuncia)` a partir de un registro. */
export function denunciaIdDeRegistro(registro: {
  secretDenuncia: Uint8Array | Hex32;
  evidenciaHash: Uint8Array | Hex32;
}): Uint8Array {
  return pureCircuits.denunciaIdDe(
    comoBytes32(registro.evidenciaHash, 'evidenciaHash'),
    comoBytes32(registro.secretDenuncia, 'secretDenuncia'),
  );
}

/**
 * Stagea una denuncia NUEVA con un `secretDenuncia` recién generado.
 *
 * El secret sale de `crypto.randomBytes(32)` y no se reusa jamás: es la
 * mitigación de H-3. Devuelve también el `denunciaId` y el secret en claro
 * para que B3 los persista con `agregarDenuncia()` — si se pierden, esa
 * denuncia queda sin forma de revelar autoría, para siempre.
 */
export function stagearDenunciaNueva(
  ps: EstadoPrivadoTestigo,
  evidenciaHash: Uint8Array | Hex32,
): { estado: EstadoPrivadoTestigo; denuncia: DenunciaStageada } {
  const ev = comoBytes32(evidenciaHash, 'evidenciaHash');
  const secretDenuncia = bytesAleatorios32();
  const denuncia: DenunciaStageada = {
    secretDenuncia,
    evidenciaHash: ev,
    denunciaId: pureCircuits.denunciaIdDe(ev, secretDenuncia),
  };
  return { estado: { ...ps, denunciaActiva: denuncia }, denuncia };
}

/**
 * Stagea una denuncia YA emitida, leída del almacén local, para
 * `revelarAutoria`.
 *
 * Con `denunciaIdEsperado` verifica localmente que los secrets guardados
 * reconstruyan ese id. Es la misma condición que el circuito chequea en su
 * C1 ("no sos el autor"), pero cuesta un hash en vez de una generación de
 * prueba completa: sirve para no quemar ~30 s de proving por un almacén
 * inconsistente. NO reemplaza al assert del circuito, que es el que vale.
 */
export function stagearDenunciaGuardada(
  ps: EstadoPrivadoTestigo,
  registro: RegistroDenuncia | { secretDenuncia: Uint8Array | Hex32; evidenciaHash: Uint8Array | Hex32 },
  denunciaIdEsperado?: Uint8Array | Hex32,
): EstadoPrivadoTestigo {
  const denunciaId = denunciaIdDeRegistro(registro);
  if (denunciaIdEsperado !== undefined) {
    const esperado = aHex(comoBytes32(denunciaIdEsperado, 'denunciaId'));
    if (aHex(denunciaId) !== esperado) {
      throw new DenunciaNoCoincideError(esperado, aHex(denunciaId));
    }
  }
  return {
    ...ps,
    denunciaActiva: {
      secretDenuncia: comoBytes32(registro.secretDenuncia, 'secretDenuncia'),
      evidenciaHash: comoBytes32(registro.evidenciaHash, 'evidenciaHash'),
      denunciaId,
    },
  };
}

/**
 * Saca la denuncia de foco. Conviene llamarlo apenas la tx confirma: deja el
 * estado privado sin un secret "listo para usar", así una llamada posterior
 * por error no puede firmar con el secret equivocado.
 */
export function limpiarDenunciaActiva(ps: EstadoPrivadoTestigo): EstadoPrivadoTestigo {
  return { ...ps, denunciaActiva: null };
}

// ─────────────────────────────────────────────────────────────────────────
// Los witnesses
// ─────────────────────────────────────────────────────────────────────────

/** Largo de path que exige `HistoricMerkleTree<8, Bytes<32>>`. */
const PROFUNDIDAD_ARBOL = 8;

/**
 * Bytes con los que se construye la hoja a buscar.
 *
 * Si NO hay credencial cargada devuelve SEÑUELOS aleatorios en vez de lanzar.
 * Parece contraintuitivo, y es deliberado: hace que "no tengo credencial",
 * "tengo una credencial de otra org" y "tengo la credencial correcta pero
 * todavía no la emitieron" recorran exactamente el mismo camino —los dos
 * hashes, la misma búsqueda en el árbol— y salgan por el mismo `throw`. Sin
 * el señuelo, el caso "no hay credencial" cortaría antes y sería
 * distinguible por timing, que es justo lo que la regla 4 de H-5 prohíbe.
 *
 * Un señuelo de 32 bytes aleatorios no está en el árbol con probabilidad
 * abrumadora, así que el resultado siempre es el mismo: fallo cerrado.
 */
function bytesDeCredencial(ps: EstadoPrivadoTestigo): {
  credencialSecret: Uint8Array;
  orgId: Uint8Array;
} {
  return {
    credencialSecret: ps.credencialSecret ?? bytesAleatorios32(),
    orgId: ps.orgId ?? bytesAleatorios32(),
  };
}

/**
 * Construye el objeto de witnesses que exige `new Contract(witnesses)`.
 *
 * Los 4 son funciones puras del `WitnessContext`: leen el estado privado y,
 * en el caso del path, el ledger FRESCO. No guardan estado propio entre
 * llamadas — cualquier caché acá sería un bug de seguridad (ver
 * `credencialPath`).
 */
export function crearWitnesses(): Witnesses<EstadoPrivadoTestigo> {
  return {
    /**
     * Secret de la credencial (Opción A). Alimenta el nullifier anti-spam:
     * `nullifierDe(credSecret, orgId, periodo)`.
     */
    credencialSecret({ privateState }) {
      return [privateState, bytesDeCredencial(privateState).credencialSecret];
    },

    /**
     * Hermanos del path de Merkle hacia la hoja de esta credencial.
     *
     * ⚠️ PROPIEDAD DE SEGURIDAD, NO COMODIDAD (H-5, docs/03 §3.4):
     * `findPathForLeaf` se llama acá adentro, en proof time, contra el estado
     * del ledger que el runtime proyecta en `context.ledger` — el más fresco
     * que la máquina conoce. El path NO se cachea, NO se persiste en el
     * estado privado y NO se deriva del estado que había al emitir la
     * credencial.
     *
     * El motivo: la raíz que `checkRoot` revela en el transcript público
     * funciona como un contador de sincronización del árbol. Un path viejo
     * revela una raíz vieja, y el conjunto de credenciales que existían
     * cuando esa raíz era la vigente es más chico que el actual — en el
     * límite, la raíz inmediatamente posterior a la emisión de MI credencial
     * apunta a mi propio índice y me identifica unívocamente. Recalcular
     * siempre hace que todos los denunciantes revelen la raíz más nueva y
     * compartan el conjunto de anonimato más grande disponible.
     * (Regla 3 de H-5, complementaria: congelar `emitirCredencial` durante la
     * demo, para que el árbol no se mueva y la fuga sea cero.)
     *
     * `contracts/test/sec-audit.mjs` bloque E deja esto reproducido: 4
     * inserciones -> 4 raíces distintas.
     */
    credencialPath({ privateState, ledger }) {
      const { credencialSecret, orgId } = bytesDeCredencial(privateState);
      const hoja = pureCircuits.hojaDe(orgId, pureCircuits.credCommitmentDe(credencialSecret));

      // Contra el ledger fresco. Nunca contra una copia guardada.
      const camino = ledger.credenciales.findPathForLeaf(hoja);

      // Fallo cerrado, mensaje único: ver CredencialNoEmitidaError.
      if (camino === undefined) throw new CredencialNoEmitidaError();
      if (camino.path.length !== PROFUNDIDAD_ARBOL) throw new CredencialNoEmitidaError();

      // El witness aporta SOLO los hermanos. La hoja la reconstruye el
      // circuito con su `orgId` público, así que no se puede mentir sobre a
      // qué organización pertenece la credencial que se está probando.
      return [privateState, camino.path];
    },

    /**
     * El secret que sella la denuncia y después prueba la autoría.
     *
     * El witness se llama `secretPersonal` por el nombre que tiene en el
     * `.compact`, pero desde el review NO es un secret personal global: es el
     * `secretDenuncia` de la denuncia STAGEADA. Un secret global permitía que
     * un solo reveal desanonimizara retroactivamente todas las denuncias
     * pasadas del autor (H-3).
     */
    secretPersonal({ privateState }) {
      if (privateState.denunciaActiva === null) {
        throw new DenunciaNoStageadaError('secretPersonal');
      }
      return [privateState, privateState.denunciaActiva.secretDenuncia];
    },

    /**
     * Hash del archivo de evidencia. El archivo nunca sale de la máquina
     * (ver evidencia.ts); acá ya viene reducido a 32 bytes.
     */
    evidenciaHash({ privateState }) {
      if (privateState.denunciaActiva === null) {
        throw new DenunciaNoStageadaError('evidenciaHash');
      }
      return [privateState, privateState.denunciaActiva.evidenciaHash];
    },
  };
}

/** Instancia lista para `new Contract(witnesses)`. */
export const witnesses: Witnesses<EstadoPrivadoTestigo> = crearWitnesses();

// ─────────────────────────────────────────────────────────────────────────
// Serialización del estado privado
// ─────────────────────────────────────────────────────────────────────────
//
// ⚠️ Si B1/B3 usan `@midnight-ntwrk/midnight-js-level-private-state-provider`,
// este estado queda escrito EN CLARO en un LevelDB del disco. Ese directorio
// tiene que caer bajo `secrets/` (ya gitignoreado) o estar explícitamente
// ignorado: es una segunda copia de los mismos secrets que
// `secrets/denunciante.json` protege con 0600.

export interface EstadoPrivadoSerializado {
  readonly version: 2;
  readonly credencialSecret: Hex32 | null;
  readonly orgId: Hex32 | null;
  readonly denunciaActiva: {
    readonly secretDenuncia: Hex32;
    readonly evidenciaHash: Hex32;
    readonly denunciaId: Hex32;
  } | null;
}

export function estadoPrivadoAJson(ps: EstadoPrivadoTestigo): EstadoPrivadoSerializado {
  return {
    version: 2,
    credencialSecret: ps.credencialSecret === null ? null : aHex(ps.credencialSecret),
    orgId: ps.orgId === null ? null : aHex(ps.orgId),
    denunciaActiva:
      ps.denunciaActiva === null
        ? null
        : {
            secretDenuncia: aHex(ps.denunciaActiva.secretDenuncia),
            evidenciaHash: aHex(ps.denunciaActiva.evidenciaHash),
            denunciaId: aHex(ps.denunciaActiva.denunciaId),
          },
  };
}

export function estadoPrivadoDesdeJson(
  crudo: EstadoPrivadoSerializado,
): EstadoPrivadoTestigo {
  if (crudo.version !== 2) {
    throw new TypeError(`estado privado version ${String(crudo.version)}, se esperaba 2`);
  }
  return {
    version: 2,
    credencialSecret:
      crudo.credencialSecret === null
        ? null
        : comoBytes32(crudo.credencialSecret, 'credencialSecret'),
    orgId: crudo.orgId === null ? null : comoBytes32(crudo.orgId, 'orgId'),
    denunciaActiva:
      crudo.denunciaActiva === null
        ? null
        : {
            secretDenuncia: comoBytes32(crudo.denunciaActiva.secretDenuncia, 'secretDenuncia'),
            evidenciaHash: comoBytes32(crudo.denunciaActiva.evidenciaHash, 'evidenciaHash'),
            denunciaId: comoBytes32(crudo.denunciaActiva.denunciaId, 'denunciaId'),
          },
  };
}
