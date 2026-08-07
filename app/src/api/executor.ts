/**
 * B3 — The seam between the SIMULATOR path and the NETWORK path.
 *
 * All the API's business logic (`testigo.ts`) is written against this
 * interface and not against midnight-js. It is what lets the same code run
 * on the local simulator — no network, no proof server, no tDUST — and
 * against Preview by changing only which executor is injected.
 *
 * It is not a testing convenience: at B3's close there was still no seed
 * with tDUST, so the network path could not be exercised. With this
 * separation, what B5 must validate against the network is the executor
 * (`executor-network.ts`), not the business rules — those already went green
 * against the real compiled contract in the simulator.
 */
import type { CircuitContext } from '@midnight-ntwrk/compact-runtime';

import type { TestigoCircuitId } from '../config/providers.js';
import type { ImpureCircuits, Ledger } from '../../../contracts/output/contract/index.js';
import type { TestigoPrivateState } from '../witnesses/index.js';

import type { TxResult } from './types.js';

/**
 * Arguments of each circuit, DERIVED from the `.d.ts` the compiler emits.
 *
 * Deliberately not hand-written: if the contract changes a signature (as
 * happened with `period`, which went from `Bytes<32>` to `Uint<64>` =
 * `bigint`), `tsc -p app` breaks here and at every call site, instead of
 * failing on-chain.
 */
export type CircuitArgs = {
  [K in keyof ImpureCircuits<TestigoPrivateState>]: Parameters<
    ImpureCircuits<TestigoPrivateState>[K]
  > extends [CircuitContext<TestigoPrivateState>, ...infer A]
    ? A
    : never;
};

/** The contract's impure circuits, by name. */
export type TestigoCircuit = keyof CircuitArgs & string;

// ── Consistency guard against B1 ────────────────────────────────────────
// `TestigoCircuitId` (config/providers.ts) is the list `NodeZkConfigProvider`
// uses to look up `keys/<id>.prover`. If the contract gains or loses a
// circuit and that list is not updated, the deploy fails with an ENOENT in
// the middle of proving. This line turns that into a compile error.
type Assert<T extends true> = T;
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export type CircuitsMatchB1 = Assert<Equal<TestigoCircuit, TestigoCircuitId>>;

/**
 * The bare minimum to READ the contract's public state.
 *
 * Separated from `TestigoExecutor` because `verifyAuthorship` (B3.6) and
 * `readLedgerState` (B3.7) must be able to work without a wallet, a seed or
 * a proof server: a prosecutor verifies an authorship with just an indexer.
 * Making that visible in the types is part of the product's argument.
 */
export interface LedgerReader {
  /** Fresh public state of the contract. */
  readLedger(): Promise<Ledger>;
}

/** Reads and writes the private state that feeds the witnesses. */
export interface PrivateStateStore {
  readPrivateState(): Promise<TestigoPrivateState>;
  /**
   * Replaces the private state.
   *
   * Compact witnesses TAKE NO ARGUMENTS: the only way to tell
   * `personalSecret()`/`evidenceHash()` which report to work with is to
   * leave it staged here BEFORE invoking the circuit.
   */
  writePrivateState(ps: TestigoPrivateState): Promise<void>;
}

/** Runs circuits and observes the result. Simulator or network. */
export interface TestigoExecutor extends LedgerReader, PrivateStateStore {
  readonly mode: 'simulator' | 'network';
  /** Contract address. On the simulator it is a sample address. */
  readonly contractAddress: string;
  /**
   * Unix instant IN SECONDS according to the clock this executor sees.
   *
   * On the network it is the local clock; on the simulator it is the
   * synthetic clock the test controls. Exposed so `currentPeriod()` computes
   * the epoch against the same clock that `blockTimeGte` will validate,
   * instead of assuming `Date.now()`.
   */
  nowSeconds(): number;
  /**
   * Runs an impure circuit.
   *
   * A failing `assert` throws BEFORE submitting a transaction (see
   * `errors.ts`), and the executor absorbs no state change in that case.
   */
  call<K extends TestigoCircuit>(circuit: K, ...args: CircuitArgs[K]): Promise<TxResult>;
  /** Releases resources (wallet, LevelDB). Optional: the simulator has none. */
  close?(): Promise<void>;
}
