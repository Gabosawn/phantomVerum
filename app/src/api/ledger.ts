/**
 * B3.7 — Lectura del estado público del contrato.
 *
 * Dos formas de leer, la misma salida:
 *
 *  - `LectorIndexer` — indexer GraphQL, SIN wallet, SIN seed, SIN proof server.
 *    Es el que usan `verificarAutoria` (B3.6) y el panel de la UI. Que un
 *    fiscal pueda verificar una autoría con nada más que una URL de indexer no
 *    es un detalle de implementación: es el argumento del producto.
 *  - `EjecutorSimulador` — implementa la misma `LectorLedger` leyendo el estado
 *    en memoria.
 *
 * La deserialización la hace `ledger()` del módulo GENERADO por el compilador
 * — no se parsea JSON del indexer a mano. Si el ledger del contrato cambia de
 * forma, el .d.ts regenerado rompe `tsc` acá.
 */
import type { ContractState } from '@midnight-ntwrk/compact-runtime';
import type { PublicDataProvider } from '@midnight-ntwrk/midnight-js-types';

import { requireDeployment } from '../config/deployment.js';
import { currentNetwork } from '../config/init.js';
import type { NetworkConfig } from '../config/networks.js';
import { createReadOnlyProviders } from '../config/providers.js';
import { ledger as leerLedgerDe } from '../../../contracts/output/contract/index.js';
import type { Ledger } from '../witnesses/index.js';
import { type Hex32, aHex } from '../witnesses/hex.js';

import type { LectorLedger } from './ejecutor.js';
import type { EstadoLedger } from './tipos.js';

/** No hay estado en esa address: el contrato no existe o el indexer no lo vio. */
export class ContratoNoEncontradoError extends Error {
  constructor(
    readonly contractAddress: string,
    readonly indexer: string,
  ) {
    super(
      `el indexer no tiene estado para el contrato ${contractAddress}\n` +
        `  indexer: ${indexer}\n` +
        '  Causas típicas: la address es de otra red, el deploy todavía no ' +
        'confirmó, o `deployment.json` quedó desactualizado.',
    );
    this.name = 'ContratoNoEncontradoError';
  }
}

/**
 * `ContractState` -> `Ledger` tipado.
 *
 * `.data` es el `ChargedState` que espera el deserializador generado.
 */
export const ledgerDesdeEstado = (estado: ContractState): Ledger => leerLedgerDe(estado.data);

/** Lee el estado del contrato desde el indexer. Solo lectura. */
export class LectorIndexer implements LectorLedger {
  constructor(
    private readonly publicDataProvider: PublicDataProvider,
    readonly contractAddress: string,
    private readonly indexerUrl: string,
  ) {}

  async leerLedger(): Promise<Ledger> {
    const estado = await this.publicDataProvider.queryContractState(this.contractAddress);
    if (estado === null) {
      throw new ContratoNoEncontradoError(this.contractAddress, this.indexerUrl);
    }
    return ledgerDesdeEstado(estado);
  }
}

export interface OpcionesLectorSoloLectura {
  /** Address del contrato. Por defecto, la de `deployment.json`. */
  readonly contractAddress?: string;
  /** Red a consultar. Por defecto, la activa (`NETWORK`). */
  readonly network?: NetworkConfig;
}

/**
 * Lector sin wallet ni seed: solo el indexer de la red activa.
 *
 * Es el camino de B3.6/B3.7. Si no se le pasa `contractAddress`, la saca de
 * `app/src/config/deployment.json` — la única fuente de la dirección (§3.2).
 */
export const crearLectorSoloLectura = async (
  opciones: OpcionesLectorSoloLectura = {},
): Promise<LectorIndexer> => {
  const network = opciones.network ?? currentNetwork();
  const contractAddress =
    opciones.contractAddress ?? (await requireDeployment()).contractAddress;
  const { publicDataProvider } = createReadOnlyProviders(network);
  return new LectorIndexer(publicDataProvider, contractAddress, network.indexer);
};

/** Todos los elementos de un `Set` del ledger, como Hex32. */
const comoHexes = (conjunto: { [Symbol.iterator](): Iterator<Uint8Array> }): Hex32[] => {
  const salida: Hex32[] = [];
  const it = conjunto[Symbol.iterator]();
  for (let r = it.next(); r.done !== true; r = it.next()) {
    salida.push(aHex(r.value));
  }
  return salida;
};

/**
 * Resume un `Ledger` en la forma congelada de §3.1.
 *
 * `organizaciones` y `nullifiers` van como CONTEO, no como lista: enumerar los
 * nullifiers en una UI invita a correlacionarlos con las denuncias, y no
 * aportan nada a la demo.
 */
export const resumirLedger = (ledger: Ledger): EstadoLedger => ({
  organizaciones: Number(ledger.organizaciones.size()),
  denuncias: comoHexes(ledger.denuncias),
  nullifiers: Number(ledger.nullifiers.size()),
  autorias: comoHexes(ledger.autorias),
  credencialesEmitidas: Number(ledger.credenciales.firstFree()),
});

/**
 * B3.7 — `leerEstadoLedger()`.
 *
 * Sin argumentos usa el indexer de la red activa contra la address de
 * `deployment.json`. Con un `LectorLedger` (el simulador, por ejemplo) lee de
 * ahí. Es la misma función en los dos caminos.
 */
export const leerEstadoLedger = async (lector?: LectorLedger): Promise<EstadoLedger> => {
  const fuente = lector ?? (await crearLectorSoloLectura());
  return resumirLedger(await fuente.leerLedger());
};
