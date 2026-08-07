/**
 * B3 — Ejecutor contra el simulador local de `@midnight-ntwrk/compact-runtime`.
 *
 * Corre el contrato COMPILADO REAL (`contracts/output/contract/index.js`), sin
 * red, sin proof server y sin tDUST. No es un mock: los `assert`, los
 * witnesses, el árbol de Merkle y los guards son exactamente los que va a
 * ejecutar la cadena. Lo que NO ejercita es la capa de transacción — proving,
 * balanceo y submit — que es justo lo que cubre `ejecutor-red.ts`.
 *
 * Es el mismo mecanismo que decidió `docs/03-plan-ejecucion.md` §3.3 para el
 * bloque D, y el que usa el selftest de witnesses de B2.
 */
import type { ChargedState, CircuitContext } from '@midnight-ntwrk/compact-runtime';

import { Contract, ledger as leerLedgerDe } from '../../../contracts/output/contract/index.js';
import { type EstadoPrivadoTestigo, type Ledger, estadoPrivadoVacio, witnesses } from '../witnesses/index.js';
import { runtime } from '../witnesses/runtime-contrato.js';

import type { ArgsDeCircuito, CircuitoTestigo, EjecutorTestigo } from './ejecutor.js';
import type { TxResult } from './tipos.js';

const { createCircuitContext, createConstructorContext, sampleContractAddress } = runtime;

/** Coin public key de muestra. El simulador no valida fondos. */
const COIN_PK_DUMMY = '0'.repeat(64);

export interface OpcionesSimulador {
  /**
   * Instante Unix inicial EN SEGUNDOS (el `blockTime` que ve el contrato).
   *
   * Importa: `denunciar` valida `blockTimeGte(inicio)` / `blockTimeLt(fin)`
   * contra la época que se le pasa. Por defecto usa el reloj real, así que
   * `periodoActual()` funciona sin configurar nada; un test que quiera una
   * época fija la pasa explícita.
   */
  readonly ahora?: number;
  /** Estado privado con el que arranca. Por defecto, vacío. */
  readonly estadoPrivadoInicial?: EstadoPrivadoTestigo;
}

/**
 * Mundo simulado: un contrato desplegado en memoria.
 *
 * El estado (`estadoContrato`, `zswap`, `ps`) solo se absorbe cuando el
 * circuito RETORNA. Si un `assert` falla, la instancia queda exactamente como
 * estaba — que es la propiedad "sin tx emitida" del lado del simulador, y el
 * selftest la verifica comparando el ledger antes y después de cada negativo.
 */
export class EjecutorSimulador implements EjecutorTestigo {
  readonly modo = 'simulador' as const;
  readonly contractAddress: string;

  private readonly contrato: Contract<EstadoPrivadoTestigo>;
  private estadoContrato: ChargedState;
  private zswap: CircuitContext<EstadoPrivadoTestigo>['currentZswapLocalState'];
  private ps: EstadoPrivadoTestigo;
  private reloj: number;
  private altura = 0;

  constructor(opciones: OpcionesSimulador = {}) {
    this.contrato = new Contract<EstadoPrivadoTestigo>(witnesses);
    this.contractAddress = sampleContractAddress();
    this.ps = opciones.estadoPrivadoInicial ?? estadoPrivadoVacio();
    this.reloj = opciones.ahora ?? Math.floor(Date.now() / 1000);

    const inicial = this.contrato.initialState(
      createConstructorContext<EstadoPrivadoTestigo>(this.ps, COIN_PK_DUMMY),
    );
    this.estadoContrato = inicial.currentContractState.data;
    this.zswap = inicial.currentZswapLocalState;
  }

  ahoraSegundos(): number {
    return this.reloj;
  }

  /** Mueve el reloj del "bloque". Lo usa el test para cambiar de época. */
  fijarReloj(segundosUnix: number): void {
    this.reloj = segundosUnix;
  }

  /** Avanza el reloj. `avanzarReloj(86400)` = época siguiente. */
  avanzarReloj(segundos: number): void {
    this.reloj += segundos;
  }

  private contexto(): CircuitContext<EstadoPrivadoTestigo> {
    return createCircuitContext<EstadoPrivadoTestigo>(
      this.contractAddress,
      this.zswap,
      this.estadoContrato,
      this.ps,
      undefined,
      undefined,
      this.reloj,
    );
  }

  leerLedger(): Promise<Ledger> {
    return Promise.resolve(leerLedgerDe(this.estadoContrato));
  }

  leerEstadoPrivado(): Promise<EstadoPrivadoTestigo> {
    return Promise.resolve(this.ps);
  }

  escribirEstadoPrivado(ps: EstadoPrivadoTestigo): Promise<void> {
    this.ps = ps;
    return Promise.resolve();
  }

  llamar<K extends CircuitoTestigo>(
    circuito: K,
    ...args: ArgsDeCircuito[K]
  ): Promise<TxResult> {
    // El cast es inevitable: `impureCircuits[K]` tiene una firma distinta por
    // circuito y TypeScript no puede unificarlas en una sola llamada. Los
    // argumentos YA vienen tipados por `ArgsDeCircuito[K]`, que sale del .d.ts
    // generado, así que la seguridad de tipos se pierde solo acá adentro.
    const fn = this.contrato.impureCircuits[circuito] as (
      ctx: CircuitContext<EstadoPrivadoTestigo>,
      ...a: unknown[]
    ) => { context: CircuitContext<EstadoPrivadoTestigo> };

    // Si esto lanza, ninguna de las tres asignaciones de abajo ocurre: el
    // estado queda intacto. Es la contraparte simulada de "sin tx emitida".
    const r = fn(this.contexto(), ...args);

    this.estadoContrato = r.context.currentQueryContext.state;
    this.zswap = r.context.currentZswapLocalState;
    this.ps = r.context.currentPrivateState;
    this.altura += 1;

    return Promise.resolve({
      // El prefijo `sim:` es deliberado: que nadie confunda esto con un txId
      // buscable en un explorer, ni en un log ni en el video.
      txId: `sim:${circuito}:${String(this.altura)}`,
      blockHeight: this.altura,
      simulado: true,
      status: 'SucceedEntirely',
    });
  }
}

/** Azúcar: `new EjecutorSimulador(...)` con nombre en minúscula. */
export const crearEjecutorSimulador = (opciones: OpcionesSimulador = {}): EjecutorSimulador =>
  new EjecutorSimulador(opciones);
