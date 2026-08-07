/**
 * B3.1 — Ejecutor contra una red real (Preview o devnet local).
 *
 * ⚠️ ESTADO AL CIERRE DE B3: este módulo TYPECHECKEA contra midnight-js 4.1.1
 * pero NO se ejercitó contra una cadena — al momento de escribirlo no había
 * una seed con tDUST (B5.0 depende del faucet, que es manual). Lo que sí está
 * verificado de punta a punta es la lógica de negocio, contra el contrato
 * compilado real en el simulador. Lo que B5 tiene que validar es exactamente
 * este archivo: deploy, proving, balanceo y submit.
 *
 * ── El cambio de API que el plan no contemplaba ──────────────────────────
 * `docs/04` §B3.1 asumía `deployContract(providers, contrato, ...)` con la
 * instancia del contrato generado. En 4.1.1 NO es así: `deployContract` y
 * `findDeployedContract` reciben un `CompiledContract` de `@midnight-ntwrk/
 * compact-js`, que se arma en tres pasos —`make(tag, ctor)`, `withWitnesses`,
 * `withCompiledFileAssets`— y empaqueta la clase generada, los witnesses de B2
 * y la ruta de los artefactos ZK.
 *
 * Y hay una trampa de tipos: `CompiledContract` es INVARIANTE en el tipo del
 * contrato, y la clase que emite el compilador Compact tiene un miembro extra
 * (`impureCircuits`) que la interfaz `Contract` de compact-js no declara. Sin
 * instanciar el genérico a mano, TypeScript infiere `Contract.Any` y rechaza
 * la llamada con "Property 'impureCircuits' is missing". Por eso las dos
 * llamadas de abajo van con `<ContratoTestigo>` explícito. Está verificado
 * probando las dos variantes con `tsc`, no deducido.
 */
import {
  type ContractProviders,
  type FoundContract,
  deployContract,
  findDeployedContract,
} from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import type { MidnightWalletProvider } from '@midnight-ntwrk/testkit-js';

import { requireDeployment } from '../config/deployment.js';
import { currentNetwork } from '../config/init.js';
import type { NetworkConfig } from '../config/networks.js';
import {
  TESTIGO_PRIVATE_STATE_ID,
  type TestigoCircuitId,
  type WalletLogger,
  createProviders,
} from '../config/providers.js';
import { zkConfigDirectory } from '../config/paths.js';
import { Contract } from '../../../contracts/output/contract/index.js';
import {
  type EstadoPrivadoTestigo,
  type Ledger,
  estadoPrivadoVacio,
  witnesses,
} from '../witnesses/index.js';

import type { ArgsDeCircuito, CircuitoTestigo, EjecutorTestigo } from './ejecutor.js';
import { mapearErrorDeCircuito } from './errores.js';
import { ContratoNoEncontradoError, ledgerDesdeEstado } from './ledger.js';
import type { TxResult } from './tipos.js';

/** El contrato generado, con NUESTRO estado privado. */
export type ContratoTestigo = Contract<EstadoPrivadoTestigo>;

/** Tag del contrato dentro de compact-js. Identifica el tipo, no la instancia. */
export const TAG_CONTRATO = 'testigo';

/**
 * Empaqueta clase generada + witnesses de B2 + ruta de artefactos ZK.
 *
 * `compiledAssetsPath` apunta al mismo `contracts/output/` que consume el
 * `NodeZkConfigProvider` de B1, así que hay una sola fuente de claves.
 */
/**
 * Los tres pasos van en `const` separados y SIN anotación de tipo de retorno a
 * propósito. `withWitnesses`/`withCompiledFileAssets` infieren su parámetro `R`
 * (lo que todavía falta configurar) desde el argumento; si se anota el retorno,
 * TS infiere `R` desde el contexto —donde ya es `never`— y rechaza el
 * argumento con "Type 'CompiledAssetsPath' is not assignable to type 'never'".
 * Encadenar las llamadas en una sola expresión provoca el mismo error.
 */
export const compilarContrato = (zkConfigPath: string = zkConfigDirectory()) => {
  const base = CompiledContract.make<ContratoTestigo, EstadoPrivadoTestigo>(
    TAG_CONTRATO,
    Contract,
  );
  const conWitnesses = CompiledContract.withWitnesses(base, witnesses);
  return CompiledContract.withCompiledFileAssets(conWitnesses, zkConfigPath);
};

/** El contrato compilado, ya con witnesses y artefactos ZK. */
export type ContratoCompilado = ReturnType<typeof compilarContrato>;

/** `FinalizedTxData` -> el `TxResult` congelado en §3.1. */
const comoTxResult = (data: {
  txId: string;
  blockHeight: number;
  status: string;
}): TxResult => ({
  txId: data.txId,
  blockHeight: data.blockHeight,
  simulado: false,
  status: data.status,
});

export interface OpcionesRed {
  readonly network?: NetworkConfig;
  readonly seed?: string;
  readonly logger?: WalletLogger;
  readonly zkConfigPath?: string;
  /**
   * `start(true)` pide tDUST al faucet y BLOQUEA hasta tener fondos; el
   * default de acá es `false` porque solo el primer deploy lo necesita.
   */
  readonly esperarFondos?: boolean;
}

/** Ejecutor sobre una cadena real. Se construye con `deployar` o `conectar`. */
export class EjecutorRed implements EjecutorTestigo {
  readonly modo = 'red' as const;

  private constructor(
    readonly contractAddress: string,
    private readonly providers: ContractProviders<ContratoTestigo>,
    private readonly contrato: FoundContract<ContratoTestigo>,
    readonly walletProvider: MidnightWalletProvider,
    readonly network: NetworkConfig,
    /** Solo presente cuando este proceso hizo el deploy. */
    readonly deployTxId?: string,
  ) {
    // El private state provider exige saber contra qué contrato trabaja ANTES
    // de cualquier get/set. Se fija una sola vez, acá.
    this.providers.privateStateProvider.setContractAddress(contractAddress);
  }

  private static async armar(
    opciones: OpcionesRed,
  ): Promise<{
    providers: ContractProviders<ContratoTestigo>;
    walletProvider: MidnightWalletProvider;
    network: NetworkConfig;
    compiled: ContratoCompilado;
  }> {
    const network = opciones.network ?? currentNetwork();
    const { providers, walletProvider, zkConfigPath } = await createProviders<
      TestigoCircuitId,
      EstadoPrivadoTestigo
    >({
      network,
      ...(opciones.seed === undefined ? {} : { seed: opciones.seed }),
      ...(opciones.logger === undefined ? {} : { logger: opciones.logger }),
      ...(opciones.zkConfigPath === undefined ? {} : { zkConfigPath: opciones.zkConfigPath }),
    });
    await walletProvider.start(opciones.esperarFondos ?? false);
    return { providers, walletProvider, network, compiled: compilarContrato(zkConfigPath) };
  }

  /** B3.1 — deploy nuevo. Necesita una seed CON tDUST. */
  static async deployar(opciones: OpcionesRed = {}): Promise<EjecutorRed> {
    const { providers, walletProvider, network, compiled } = await EjecutorRed.armar({
      ...opciones,
      // El deploy es lo único que realmente necesita fondos antes de arrancar.
      esperarFondos: opciones.esperarFondos ?? true,
    });
    try {
      const desplegado = await deployContract<ContratoTestigo>(providers, {
        compiledContract: compiled,
        privateStateId: TESTIGO_PRIVATE_STATE_ID,
        initialPrivateState: estadoPrivadoVacio(),
      });
      const { contractAddress } = desplegado.deployTxData.public;
      return new EjecutorRed(
        contractAddress,
        providers,
        desplegado,
        walletProvider,
        network,
        desplegado.deployTxData.public.txId,
      );
    } catch (error) {
      throw mapearErrorDeCircuito(error);
    }
  }

  /**
   * B3.1 — conectar a un contrato ya deployado.
   *
   * Sin `contractAddress` usa la de `deployment.json`. `findDeployedContract`
   * compara las verifier keys locales contra las del contrato on-chain y tira
   * `ContractTypeError` si no coinciden — o sea que detecta "recompilaste el
   * contrato y la address quedó vieja" antes de mandar una tx que iba a fallar.
   */
  static async conectar(
    contractAddress?: string,
    opciones: OpcionesRed = {},
  ): Promise<EjecutorRed> {
    const { providers, walletProvider, network, compiled } =
      await EjecutorRed.armar(opciones);
    const address = contractAddress ?? (await requireDeployment()).contractAddress;
    try {
      const encontrado = await findDeployedContract<ContratoTestigo>(providers, {
        compiledContract: compiled,
        contractAddress: address,
        privateStateId: TESTIGO_PRIVATE_STATE_ID,
      });
      return new EjecutorRed(address, providers, encontrado, walletProvider, network);
    } catch (error) {
      throw mapearErrorDeCircuito(error);
    }
  }

  ahoraSegundos(): number {
    return Math.floor(Date.now() / 1000);
  }

  async leerLedger(): Promise<Ledger> {
    const estado = await this.providers.publicDataProvider.queryContractState(
      this.contractAddress,
    );
    if (estado === null) {
      throw new ContratoNoEncontradoError(this.contractAddress, this.network.indexer);
    }
    return ledgerDesdeEstado(estado);
  }

  async leerEstadoPrivado(): Promise<EstadoPrivadoTestigo> {
    const guardado = await this.providers.privateStateProvider.get(TESTIGO_PRIVATE_STATE_ID);
    return guardado ?? estadoPrivadoVacio();
  }

  async escribirEstadoPrivado(ps: EstadoPrivadoTestigo): Promise<void> {
    await this.providers.privateStateProvider.set(TESTIGO_PRIVATE_STATE_ID, ps);
  }

  async llamar<K extends CircuitoTestigo>(
    circuito: K,
    ...args: ArgsDeCircuito[K]
  ): Promise<TxResult> {
    // Mismo cast que en el simulador y por el mismo motivo: `callTx[K]` tiene
    // una firma distinta por circuito (y además está sobrecargada), y TS no
    // las unifica en una llamada genérica. Los args ya vienen tipados por
    // `ArgsDeCircuito[K]`, derivado del .d.ts generado.
    const fn = this.contrato.callTx[circuito] as (
      ...a: unknown[]
    ) => Promise<{ public: { txId: string; blockHeight: number; status: string } }>;
    try {
      const resultado = await fn(...args);
      return comoTxResult(resultado.public);
    } catch (error) {
      // Acá es donde un `assert` del contrato se convierte en
      // CredencialInvalidaError / NullifierRepetidoError / NoSosElAutorError.
      // midnight-js ejecuta el circuito LOCALMENTE para armar el transcript
      // antes de probar y antes de submitear, así que estos fallos ocurren sin
      // gastar proving y sin emitir transacción.
      throw mapearErrorDeCircuito(error, circuito);
    }
  }

  /** `stop()`, no `close()` — verificado en el .d.ts de testkit-js 4.1.1. */
  async cerrar(): Promise<void> {
    await this.walletProvider.stop();
  }
}
