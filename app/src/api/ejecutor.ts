/**
 * B3 — La costura entre el camino SIMULADOR y el camino RED.
 *
 * Toda la lógica de negocio de la API (`testigo.ts`) está escrita contra esta
 * interfaz y no contra midnight-js. Es lo que permite que el mismo código
 * corra en el simulador local —sin red, sin proof server, sin tDUST— y contra
 * Preview cambiando únicamente qué ejecutor se inyecta.
 *
 * No es una comodidad de testing: al cierre de B3 todavía no había una seed con
 * tDUST, así que el camino red no se podía ejercitar. Con esta separación, lo
 * que B5 tiene que validar contra la red es el ejecutor (`ejecutor-red.ts`),
 * no las reglas de negocio — esas ya quedaron verdes contra el contrato
 * compilado real en el simulador.
 */
import type { CircuitContext } from '@midnight-ntwrk/compact-runtime';

import type { TestigoCircuitId } from '../config/providers.js';
import type { ImpureCircuits, Ledger } from '../../../contracts/output/contract/index.js';
import type { EstadoPrivadoTestigo } from '../witnesses/index.js';

import type { TxResult } from './tipos.js';

/**
 * Argumentos de cada circuito, DERIVADOS del `.d.ts` que genera el compilador.
 *
 * No están escritos a mano a propósito: si el contrato cambia una firma (como
 * pasó con `periodo`, que pasó de `Bytes<32>` a `Uint<64>` = `bigint`),
 * `tsc -p app` rompe acá y en cada llamada, en vez de fallar on-chain.
 */
export type ArgsDeCircuito = {
  [K in keyof ImpureCircuits<EstadoPrivadoTestigo>]: Parameters<
    ImpureCircuits<EstadoPrivadoTestigo>[K]
  > extends [CircuitContext<EstadoPrivadoTestigo>, ...infer A]
    ? A
    : never;
};

/** Los circuitos impuros del contrato, por nombre. */
export type CircuitoTestigo = keyof ArgsDeCircuito & string;

// ── Guarda de consistencia con B1 ───────────────────────────────────────
// `TestigoCircuitId` (config/providers.ts) es la lista con la que
// `NodeZkConfigProvider` busca `keys/<id>.prover`. Si el contrato gana o
// pierde un circuito y esa lista no se actualiza, el deploy falla con un
// ENOENT a mitad del proving. Esta línea convierte eso en un error de
// compilación.
type Assert<T extends true> = T;
type Iguales<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export type CircuitosCoincidenConB1 = Assert<Iguales<CircuitoTestigo, TestigoCircuitId>>;

/**
 * Lo mínimo para LEER el estado público del contrato.
 *
 * Se separa de `EjecutorTestigo` porque `verificarAutoria` (B3.6) y
 * `leerEstadoLedger` (B3.7) tienen que poder funcionar sin wallet, sin seed y
 * sin proof server: un fiscal verifica una autoría con solo un indexer. Que eso
 * sea visible en los tipos es parte del argumento del producto.
 */
export interface LectorLedger {
  /** Estado público fresco del contrato. */
  leerLedger(): Promise<Ledger>;
}

/** Lee y escribe el estado privado que alimenta a los witnesses. */
export interface AlmacenEstadoPrivado {
  leerEstadoPrivado(): Promise<EstadoPrivadoTestigo>;
  /**
   * Reemplaza el estado privado.
   *
   * Los witnesses de Compact NO TOMAN ARGUMENTOS: la única forma de decirle a
   * `secretPersonal()`/`evidenciaHash()` con qué denuncia trabajar es dejarla
   * stageada acá ANTES de invocar el circuito.
   */
  escribirEstadoPrivado(ps: EstadoPrivadoTestigo): Promise<void>;
}

/** Ejecuta circuitos y observa el resultado. Simulador o red. */
export interface EjecutorTestigo extends LectorLedger, AlmacenEstadoPrivado {
  readonly modo: 'simulador' | 'red';
  /** Dirección del contrato. En el simulador es una address de muestra. */
  readonly contractAddress: string;
  /**
   * Instante Unix EN SEGUNDOS según el reloj que ve este ejecutor.
   *
   * En red es el reloj local; en el simulador es el reloj sintético que el
   * test controla. Se expone para que `periodoActual()` calcule la época
   * contra el mismo reloj que va a validar `blockTimeGte`, en vez de asumir
   * `Date.now()`.
   */
  ahoraSegundos(): number;
  /**
   * Corre un circuito impuro.
   *
   * Un `assert` que falla lanza ANTES de emitir transacción (ver `errores.ts`),
   * y el ejecutor no absorbe ningún cambio de estado en ese caso.
   */
  llamar<K extends CircuitoTestigo>(circuito: K, ...args: ArgsDeCircuito[K]): Promise<TxResult>;
  /** Libera recursos (wallet, LevelDB). Opcional: el simulador no tiene. */
  cerrar?(): Promise<void>;
}
