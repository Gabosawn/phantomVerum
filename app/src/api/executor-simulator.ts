/**
 * B3 — Executor against the local simulator of
 * `@midnight-ntwrk/compact-runtime`.
 *
 * Runs the REAL COMPILED contract (`contracts/output/contract/index.js`),
 * without network, proof server or tDUST. It is not a mock: the `assert`s,
 * the witnesses, the Merkle tree and the guards are exactly the ones the
 * chain will execute. What it does NOT exercise is the transaction layer —
 * proving, balancing and submit — which is precisely what
 * `executor-network.ts` covers.
 *
 * It is the same mechanism `docs/03-plan-ejecucion.md` §3.3 decided for
 * block D, and the one the B2 witness selftest uses.
 */
import type { ChargedState, CircuitContext } from '@midnight-ntwrk/compact-runtime';

import { Contract, ledger as readLedgerOf } from '../../../contracts/output/contract/index.js';
import { type TestigoPrivateState, type Ledger, emptyPrivateState, witnesses } from '../witnesses/index.js';
import { runtime } from '../witnesses/contract-runtime.js';

import type { CircuitArgs, TestigoCircuit, TestigoExecutor } from './executor.js';
import type { TxResult } from './types.js';

const { createCircuitContext, createConstructorContext, sampleContractAddress } = runtime;

/** Sample coin public key. The simulator does not validate funds. */
const DUMMY_COIN_PK = '0'.repeat(64);

export interface SimulatorOptions {
  /**
   * Initial Unix instant IN SECONDS (the `blockTime` the contract sees).
   *
   * It matters: `report` validates `blockTimeGte(start)` / `blockTimeLt(end)`
   * against the epoch it is given. By default it uses the real clock, so
   * `currentPeriod()` works with zero configuration; a test wanting a fixed
   * epoch passes it explicitly.
   */
  readonly now?: number;
  /** Private state to start with. Empty by default. */
  readonly initialPrivateState?: TestigoPrivateState;
}

/**
 * Simulated world: a contract deployed in memory.
 *
 * The state (`contractState`, `zswap`, `ps`) is only absorbed when the
 * circuit RETURNS. If an `assert` fails, the instance stays exactly as it
 * was — which is the "no tx submitted" property on the simulator's side, and
 * the selftest verifies it by comparing the ledger before and after each
 * negative.
 */
export class SimulatorExecutor implements TestigoExecutor {
  readonly mode = 'simulator' as const;
  readonly contractAddress: string;

  private readonly contract: Contract<TestigoPrivateState>;
  private contractState: ChargedState;
  private zswap: CircuitContext<TestigoPrivateState>['currentZswapLocalState'];
  private ps: TestigoPrivateState;
  private clock: number;
  private height = 0;

  constructor(options: SimulatorOptions = {}) {
    this.contract = new Contract<TestigoPrivateState>(witnesses);
    this.contractAddress = sampleContractAddress();
    this.ps = options.initialPrivateState ?? emptyPrivateState();
    this.clock = options.now ?? Math.floor(Date.now() / 1000);

    const initial = this.contract.initialState(
      createConstructorContext<TestigoPrivateState>(this.ps, DUMMY_COIN_PK),
    );
    this.contractState = initial.currentContractState.data;
    this.zswap = initial.currentZswapLocalState;
  }

  nowSeconds(): number {
    return this.clock;
  }

  /** Moves the "block" clock. Used by tests to switch epochs. */
  setClock(unixSeconds: number): void {
    this.clock = unixSeconds;
  }

  /** Advances the clock. `advanceClock(86400)` = next epoch. */
  advanceClock(seconds: number): void {
    this.clock += seconds;
  }

  private context(): CircuitContext<TestigoPrivateState> {
    return createCircuitContext<TestigoPrivateState>(
      this.contractAddress,
      this.zswap,
      this.contractState,
      this.ps,
      undefined,
      undefined,
      this.clock,
    );
  }

  readLedger(): Promise<Ledger> {
    return Promise.resolve(readLedgerOf(this.contractState));
  }

  readPrivateState(): Promise<TestigoPrivateState> {
    return Promise.resolve(this.ps);
  }

  writePrivateState(ps: TestigoPrivateState): Promise<void> {
    this.ps = ps;
    return Promise.resolve();
  }

  call<K extends TestigoCircuit>(
    circuit: K,
    ...args: CircuitArgs[K]
  ): Promise<TxResult> {
    // The cast is unavoidable: `impureCircuits[K]` has a different signature
    // per circuit and TypeScript cannot unify them in a single call. The
    // arguments already come typed by `CircuitArgs[K]`, derived from the
    // generated .d.ts, so type safety is only lost inside here.
    const fn = this.contract.impureCircuits[circuit] as (
      ctx: CircuitContext<TestigoPrivateState>,
      ...a: unknown[]
    ) => { context: CircuitContext<TestigoPrivateState> };

    // If this throws, none of the three assignments below happen: the state
    // stays intact. It is the simulated counterpart of "no tx submitted".
    const r = fn(this.context(), ...args);

    this.contractState = r.context.currentQueryContext.state;
    this.zswap = r.context.currentZswapLocalState;
    this.ps = r.context.currentPrivateState;
    this.height += 1;

    return Promise.resolve({
      // The `sim:` prefix is deliberate: nobody should mistake this for a
      // txId searchable in an explorer, neither in a log nor in the video.
      txId: `sim:${circuit}:${String(this.height)}`,
      blockHeight: this.height,
      simulated: true,
      status: 'SucceedEntirely',
    });
  }
}

/** Sugar: `new SimulatorExecutor(...)` with a lowercase name. */
export const createSimulatorExecutor = (options: SimulatorOptions = {}): SimulatorExecutor =>
  new SimulatorExecutor(options);
