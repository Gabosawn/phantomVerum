/**
 * B3.2–B3.5 + B3.8 — La API de Testigo (firmas congeladas en docs/03 §3.1).
 *
 * Todo lo de acá está escrito contra `EjecutorTestigo`, así que es EL MISMO
 * código en el simulador y contra la red. Lo único que cambia es qué ejecutor
 * se inyecta.
 */
import { epocaDeSegundos } from '../witnesses/epoca.js';
import { hashEvidenciaArchivo, hashEvidenciaBytes } from '../witnesses/evidencia.js';
import { type Hex32, aHex, comoBytes32, comoHex32 } from '../witnesses/hex.js';
import {
  type EstadoPrivadoTestigo,
  commitmentDeCredencial,
  conCredencial,
  limpiarDenunciaActiva,
  pureCircuits,
  stagearDenunciaGuardada,
  stagearDenunciaNueva,
} from '../witnesses/index.js';
import {
  agregarDenuncia,
  fijarHojaIndex,
  leerOCrearSecrets,
  obtenerDenuncia,
} from '../witnesses/secrets.js';

import type { EjecutorTestigo } from './ejecutor.js';
import { EjecutorSimulador, type OpcionesSimulador } from './ejecutor-simulador.js';
import { EjecutorRed, type OpcionesRed } from './ejecutor-red.js';
import { CredencialInvalidaError, mapearErrorDeCircuito } from './errores.js';
import { leerEstadoLedger } from './ledger.js';
import type {
  Bytes32Entrada,
  EstadoLedger,
  ExportLlaveAutoria,
  ParamsDenunciar,
  ParamsEmitirCredencial,
  ParamsRegistrarOrganizacion,
  ParamsRevelarAutoria,
  ResultadoDenunciar,
  ResultadoEmitirCredencial,
  ResultadoRevelarAutoria,
  ResultadoVerificacion,
  TxResult,
} from './tipos.js';
import { SinSecretsDeLaDenunciaError, exportarLlave, verificarAutoria } from './verificar.js';

export interface ConfigApi {
  /**
   * Ruta del almacén de secrets. Por defecto, `secrets/denunciante.json`
   * (o `TESTIGO_SECRETS`). Los tests la pisan para no tocar los secrets reales.
   */
  readonly rutaSecrets?: string;
  /**
   * Persistir los secrets de cada denuncia en el almacén local. Default `true`.
   *
   * Apagarlo es casi siempre un error: sin el `secretDenuncia` guardado, esa
   * denuncia queda SIN forma de revelar autoría, para siempre. Existe solo para
   * flujos de inspección que no deben escribir en disco.
   */
  readonly persistirSecrets?: boolean;
}

/** Credencial preparada del lado del cliente (mitad local de B3.3). */
export interface CredencialLocal {
  /** Lo ÚNICO que se le entrega al emisor. */
  readonly credCommitment: Hex32;
  /** Queda en la máquina del denunciante. El emisor no lo ve nunca (H-4). */
  readonly credencialSecret: Hex32;
  readonly orgId: Hex32;
}

export class ApiTestigo {
  constructor(
    readonly ejecutor: EjecutorTestigo,
    private readonly config: ConfigApi = {},
  ) {}

  get contractAddress(): string {
    return this.ejecutor.contractAddress;
  }

  get modo(): 'simulador' | 'red' {
    return this.ejecutor.modo;
  }

  /**
   * Época en curso según el reloj que ve el ejecutor.
   *
   * Se calcula contra `ejecutor.ahoraSegundos()` y no contra `Date.now()`
   * porque es el mismo reloj que va a validar `blockTimeGte`/`blockTimeLt`.
   */
  periodoActual(): bigint {
    return epocaDeSegundos(this.ejecutor.ahoraSegundos());
  }

  // ── B3.2 ──────────────────────────────────────────────────────────────

  /**
   * Registra una organización con su ancla.
   *
   * ⚠️ Sin control de acceso, y está declarado de frente en el deck y el README
   * (docs/03 §2.6): cualquiera puede registrar una org. Es coherente con el
   * "emisor mock" del alcance del hackathon.
   */
  async registrarOrganizacion(p: ParamsRegistrarOrganizacion): Promise<TxResult> {
    const orgId = comoBytes32(p.orgId, 'orgId');
    const ancla = comoBytes32(p.ancla, 'ancla');
    try {
      return await this.ejecutor.llamar('registrarOrganizacion', orgId, ancla);
    } catch (error) {
      throw mapearErrorDeCircuito(error, 'registrarOrganizacion');
    }
  }

  // ── B3.3 ──────────────────────────────────────────────────────────────

  /**
   * Mitad CLIENTE de la emisión: genera (o recupera) el `credencialSecret`
   * local y devuelve solo el commitment.
   *
   * SEGURIDAD (H-4, docs/03 §3.4): el secret se genera acá, en la máquina del
   * denunciante, y nunca sale. Al emisor se le pasa `credCommitment`. Si el
   * emisor generara el secret podría recomputar
   * `nullifierDe(credSecret, orgId, periodo)` de cualquier empleado y saber
   * quién denunció en cada período.
   *
   * También deja la credencial cargada en el estado privado, que es de donde
   * la leen los witnesses.
   */
  async prepararCredencialLocal(orgId: Bytes32Entrada): Promise<CredencialLocal> {
    const orgBytes = comoBytes32(orgId, 'orgId');
    const secrets = leerOCrearSecrets(orgBytes, this.config.rutaSecrets);

    const ps = await this.ejecutor.leerEstadoPrivado();
    const conCred = conCredencial(ps, secrets.credencialSecret, secrets.orgId);
    await this.ejecutor.escribirEstadoPrivado(conCred);

    return {
      credCommitment: aHex(commitmentDeCredencial(conCred)),
      credencialSecret: secrets.credencialSecret,
      orgId: secrets.orgId,
    };
  }

  /**
   * Mitad EMISOR: inserta la hoja en el árbol global.
   *
   * Recibe el commitment, nunca el secret. El contrato construye la hoja EN
   * CIRCUITO con el `orgId` que acaba de validar (`hojaDe(orgId,
   * credCommitment)`), así que no se puede forjar una credencial para una org
   * no registrada — es el fix de M-1.
   *
   * `hojaIndex` sale de `firstFree()` leído ANTES de insertar: es el índice que
   * va a ocupar la hoja nueva.
   */
  async emitirCredencial(p: ParamsEmitirCredencial): Promise<ResultadoEmitirCredencial> {
    const orgId = comoBytes32(p.orgId, 'orgId');
    const credCommitment = comoBytes32(p.credCommitment, 'credCommitment');

    const antes = await this.ejecutor.leerLedger();
    const hojaIndex = Number(antes.credenciales.firstFree());

    let tx: TxResult;
    try {
      tx = await this.ejecutor.llamar('emitirCredencial', orgId, credCommitment);
    } catch (error) {
      throw mapearErrorDeCircuito(error, 'emitirCredencial');
    }

    // El almacén local solo se toca si la hoja emitida es LA NUESTRA. Este
    // circuito lo corre el emisor, que puede estar emitiendo para cualquier
    // empleado: escribir el hojaIndex de otro en nuestro archivo de secrets
    // sería sencillamente incorrecto.
    await this.persistirHojaIndexSiEsNuestra(credCommitment, hojaIndex);

    return { hojaIndex, tx };
  }

  private async persistirHojaIndexSiEsNuestra(
    credCommitment: Uint8Array,
    hojaIndex: number,
  ): Promise<void> {
    if (this.config.persistirSecrets === false) return;
    const ps = await this.ejecutor.leerEstadoPrivado();
    if (ps.credencialSecret === null) return;
    const nuestro = pureCircuits.credCommitmentDe(ps.credencialSecret);
    if (aHex(nuestro) !== aHex(credCommitment)) return;
    fijarHojaIndex(hojaIndex, this.config.rutaSecrets);
  }

  // ── B3.4 ──────────────────────────────────────────────────────────────

  /**
   * Sella una denuncia.
   *
   * Orden de operaciones, y el orden importa:
   *
   *  1. hashear la evidencia LOCAL (el archivo no sale de la máquina);
   *  2. generar un `secretDenuncia` FRESCO y stagearlo en el estado privado
   *     (los witnesses no toman argumentos: es el único canal);
   *  3. **PERSISTIR el secret ANTES de emitir la tx**;
   *  4. recién ahí llamar al circuito.
   *
   * El paso 3 va antes del 4 a propósito. Si el proceso muere entre el submit
   * y el guardado, la denuncia queda sellada on-chain y su secret perdido —
   * y sin ese secret NADIE puede reclamar su autoría, nunca. Persistir de más
   * (una denuncia que al final no se sella) cuesta una entrada muerta en un
   * JSON; persistir de menos cuesta la denuncia.
   *
   * Errores tipados: `CredencialInvalidaError` y `NullifierRepetidoError`,
   * los dos en proof time y sin transacción emitida.
   */
  async denunciar(p: ParamsDenunciar): Promise<ResultadoDenunciar> {
    const orgId = comoBytes32(p.orgId, 'orgId');
    const evidenciaHash = await hashDeEvidencia(p.evidencia);

    const ps = await this.ejecutor.leerEstadoPrivado();

    // El witness busca la hoja con el orgId del estado privado y el circuito la
    // reconstruye con el orgId del argumento. Si difieren, el `checkRoot`
    // falla igual —cerrado— pero con un error que no dice nada. Este chequeo
    // es local y sobre datos propios: no es un oráculo de pertenencia.
    if (ps.orgId !== null && aHex(ps.orgId) !== aHex(orgId)) {
      throw new CredencialInvalidaError(
        `la credencial cargada es de la org ${aHex(ps.orgId)} y se está ` +
          `denunciando a ${aHex(orgId)}`,
        'denunciar',
      );
    }

    const { estado, denuncia } = stagearDenunciaNueva(ps, evidenciaHash);
    await this.ejecutor.escribirEstadoPrivado(estado);

    // ⚠️ ANTES de la tx. Ver el comentario de arriba.
    if (this.config.persistirSecrets !== false) {
      agregarDenuncia(
        denuncia.denunciaId,
        {
          secretDenuncia: denuncia.secretDenuncia,
          evidenciaHash: denuncia.evidenciaHash,
          periodo: p.periodo,
        },
        this.config.rutaSecrets,
      );
    }

    let tx: TxResult;
    try {
      tx = await this.ejecutor.llamar('denunciar', orgId, p.periodo);
    } catch (error) {
      // Se saca la denuncia de foco para no dejar un secret "armado" que una
      // llamada posterior podría usar por error. El registro en el almacén NO
      // se borra: si la tx en realidad sí entró, borrarlo perdería la autoría.
      await this.ejecutor.escribirEstadoPrivado(limpiarDenunciaActiva(estado));
      throw mapearErrorDeCircuito(error, 'denunciar');
    }

    // El nullifier se recomputa localmente con el mismo pure circuit que usó
    // el contrato: sirve para mostrarlo y para que la UI lo contraste.
    const credencialSecret = estado.credencialSecret;
    /* c8 ignore next */
    if (credencialSecret === null) {
      throw new CredencialInvalidaError('sin credencial en el estado privado', 'denunciar');
    }
    const nullifier = pureCircuits.nullifierDe(credencialSecret, orgId, p.periodo);

    await this.ejecutor.escribirEstadoPrivado(limpiarDenunciaActiva(estado));

    return {
      denunciaId: aHex(denuncia.denunciaId),
      nullifier: aHex(nullifier),
      secretDenuncia: aHex(denuncia.secretDenuncia),
      evidenciaHash: aHex(denuncia.evidenciaHash),
      tx,
    };
  }

  // ── B3.5 ──────────────────────────────────────────────────────────────

  /**
   * Reclama la autoría de una denuncia frente a un fiscal.
   *
   * Lee el `secretDenuncia` del almacén y lo stagea. `stagearDenunciaGuardada`
   * con el 3er argumento hace el MISMO chequeo que la C1 del circuito, pero con
   * un hash en vez de una prueba: si el almacén no reconstruye ese `denunciaId`
   * falla al instante y se ahorra ~30 s de proving. No reemplaza al `assert`
   * del circuito, que es el que realmente vale.
   *
   * Error tipado: `NoSosElAutorError`, en proof time y sin tx emitida.
   */
  async revelarAutoria(p: ParamsRevelarAutoria): Promise<ResultadoRevelarAutoria> {
    const denunciaId = comoBytes32(p.denunciaId, 'denunciaId');
    const fiscalPk = comoBytes32(p.fiscalPk, 'fiscalPk');
    const idHex = comoHex32(denunciaId, 'denunciaId');

    const registro = obtenerDenuncia(idHex, this.config.rutaSecrets);
    if (registro === null) {
      throw new SinSecretsDeLaDenunciaError(idHex);
    }

    const ps = await this.ejecutor.leerEstadoPrivado();
    let stageado: EstadoPrivadoTestigo;
    try {
      // El 3er arg es el chequeo local barato. Un almacén inconsistente sale
      // por acá como NoSosElAutorError, sin tocar el proof server.
      stageado = stagearDenunciaGuardada(ps, registro, denunciaId);
    } catch (error) {
      throw mapearErrorDeCircuito(error, 'revelarAutoria');
    }
    await this.ejecutor.escribirEstadoPrivado(stageado);

    let tx: TxResult;
    try {
      tx = await this.ejecutor.llamar('revelarAutoria', denunciaId, fiscalPk);
    } catch (error) {
      await this.ejecutor.escribirEstadoPrivado(limpiarDenunciaActiva(stageado));
      throw mapearErrorDeCircuito(error, 'revelarAutoria');
    }

    const autoriaHash = pureCircuits.autoriaDe(
      comoBytes32(registro.secretDenuncia, 'secretDenuncia'),
      denunciaId,
      fiscalPk,
    );

    // Apenas confirma, se saca de foco: que no quede un secret listo para usar.
    await this.ejecutor.escribirEstadoPrivado(limpiarDenunciaActiva(stageado));

    return { autoriaHash: aHex(autoriaHash), tx };
  }

  // ── B3.6 / B3.7 / B3.8 ────────────────────────────────────────────────

  /** B3.6 — verificación off-chain contra el ledger que ve este ejecutor. */
  verificarAutoria(p: ExportLlaveAutoria): Promise<ResultadoVerificacion> {
    return verificarAutoria(p, this.ejecutor);
  }

  /** B3.7 — estado público del contrato, en la forma de §3.1. */
  leerEstadoLedger(): Promise<EstadoLedger> {
    return leerEstadoLedger(this.ejecutor);
  }

  /** B3.8 — paquete de llave de autoría para un fiscal. 100 % local. */
  exportarLlave(denunciaId: Bytes32Entrada, fiscalPk: Bytes32Entrada): ExportLlaveAutoria {
    return exportarLlave(denunciaId, fiscalPk, this.config.rutaSecrets);
  }

  /** Libera wallet y LevelDB, si el ejecutor tiene algo que liberar. */
  async cerrar(): Promise<void> {
    await this.ejecutor.cerrar?.();
  }
}

/** Hashea la evidencia: bytes en memoria o archivo por stream. */
const hashDeEvidencia = async (
  evidencia: ParamsDenunciar['evidencia'],
): Promise<Uint8Array> => {
  if (evidencia instanceof Uint8Array) {
    return hashEvidenciaBytes(evidencia);
  }
  // Por stream: una evidencia grande (un PDF escaneado, un dump de mails) no
  // tiene por qué entrar entera en memoria.
  return hashEvidenciaArchivo(evidencia.rutaArchivo);
};

// ── B3.1 — construcción ─────────────────────────────────────────────────

export interface ResultadoDeploy {
  readonly api: ApiTestigo;
  readonly contractAddress: string;
  /** txId del deploy. `undefined` si el ejecutor no lo reporta. */
  readonly deployTxId: string | undefined;
}

/**
 * B3.1 — deploy nuevo contra la red activa.
 *
 * Necesita una seed CON tDUST (`DEPLOY_SEED`). No escribe `deployment.json`:
 * eso lo hace el script de deploy de B5.1, que además registra el
 * `compilerVersion` leído de los artefactos.
 */
export const deployContrato = async (
  opciones: OpcionesRed & ConfigApi = {},
): Promise<ResultadoDeploy> => {
  const ejecutor = await EjecutorRed.deployar(opciones);
  return {
    api: new ApiTestigo(ejecutor, opciones),
    contractAddress: ejecutor.contractAddress,
    deployTxId: ejecutor.deployTxId,
  };
};

/**
 * B3.1 — conexión a un contrato ya deployado.
 *
 * Sin `contractAddress` usa la de `deployment.json` (§3.2: la única fuente de
 * la dirección). Es el camino del smoke de re-conexión de B5.4 y el que van a
 * usar `ui/` y `tests/`.
 */
export const conectarContrato = async (
  contractAddress?: string,
  opciones: OpcionesRed & ConfigApi = {},
): Promise<ApiTestigo> =>
  new ApiTestigo(await EjecutorRed.conectar(contractAddress, opciones), opciones);

/**
 * Mismo API, contra el simulador local: sin red, sin proof server, sin tDUST.
 *
 * Es lo que usa el selftest de B3 y lo que permite que B4/`tests/` corran el
 * E2E completo aunque Preview esté caída (plan B de docs/03 §6).
 */
export const conectarSimulador = (
  opciones: OpcionesSimulador & ConfigApi = {},
): { api: ApiTestigo; ejecutor: EjecutorSimulador } => {
  const ejecutor = new EjecutorSimulador(opciones);
  return { api: new ApiTestigo(ejecutor, opciones), ejecutor };
};
