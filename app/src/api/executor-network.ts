/**
 * B3.1 — Executor against a real network (Preview or a local devnet).
 *
 * ⚠️ STATE AT B3's CLOSE: this module TYPECHECKS against midnight-js 4.1.1
 * but was NOT exercised against a chain — when it was written there was no
 * seed with tDUST (B5.0 depends on the faucet, which is manual). What IS
 * verified end to end is the business logic, against the real compiled
 * contract in the simulator. What B5 must validate is exactly this file:
 * deploy, proving, balancing and submit.
 *
 * ── The API change the plan did not anticipate ──────────────────────────
 * `docs/04` §B3.1 assumed `deployContract(providers, contract, ...)` with
 * the generated contract instance. In 4.1.1 it is NOT like that:
 * `deployContract` and `findDeployedContract` receive a `CompiledContract`
 * from `@midnight-ntwrk/compact-js`, assembled in three steps — `make(tag,
 * ctor)`, `withWitnesses`, `withCompiledFileAssets` — packaging the
 * generated class, the B2 witnesses and the ZK artifacts path.
 *
 * And there is a typing trap: `CompiledContract` is INVARIANT in the
 * contract type, and the class the Compact compiler emits has an extra
 * member (`impureCircuits`) that compact-js's `Contract` interface does not
 * declare. Without instantiating the generic by hand, TypeScript infers
 * `Contract.Any` and rejects the call with "Property 'impureCircuits' is
 * missing". That is why the two calls below carry an explicit
 * `<TestigoContract>`. Verified by trying both variants with `tsc`, not
 * deduced.
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
  type TestigoPrivateState,
  type Ledger,
  emptyPrivateState,
  witnesses,
} from '../witnesses/index.js';

import type { CircuitArgs, TestigoCircuit, TestigoExecutor } from './executor.js';
import { mapCircuitError } from './errors.js';
import { ContractNotFoundError, ledgerFromState } from './ledger.js';
import type { TxResult } from './types.js';

/** The generated contract, with OUR private state. */
export type TestigoContract = Contract<TestigoPrivateState>;

/** Contract tag inside compact-js. Identifies the type, not the instance. */
export const CONTRACT_TAG = 'testigo';

/**
 * Packages generated class + B2 witnesses + ZK artifacts path.
 *
 * `compiledAssetsPath` points at the same `contracts/output/` the B1
 * `NodeZkConfigProvider` consumes, so there is a single source of keys.
 *
 * The three steps go in separate `const`s and WITHOUT a return type
 * annotation on purpose. `withWitnesses`/`withCompiledFileAssets` infer
 * their `R` parameter (what remains to configure) from the argument; if the
 * return is annotated, TS infers `R` from the context — where it is already
 * `never` — and rejects the argument with "Type 'CompiledAssetsPath' is not
 * assignable to type 'never'". Chaining the calls in one expression triggers
 * the same error.
 */
export const compileContract = (zkConfigPath: string = zkConfigDirectory()) => {
  const base = CompiledContract.make<TestigoContract, TestigoPrivateState>(
    CONTRACT_TAG,
    Contract,
  );
  const withWitnesses = CompiledContract.withWitnesses(base, witnesses);
  return CompiledContract.withCompiledFileAssets(withWitnesses, zkConfigPath);
};

/** The compiled contract, with witnesses and ZK artifacts attached. */
export type CompiledTestigoContract = ReturnType<typeof compileContract>;

/** `FinalizedTxData` -> the `TxResult` frozen in §3.1. */
const asTxResult = (data: {
  txId: string;
  blockHeight: number;
  status: string;
}): TxResult => ({
  txId: data.txId,
  blockHeight: data.blockHeight,
  simulated: false,
  status: data.status,
});

export interface NetworkOptions {
  readonly network?: NetworkConfig;
  readonly seed?: string;
  readonly logger?: WalletLogger;
  readonly zkConfigPath?: string;
  /**
   * `start(true)` requests tDUST from the faucet and BLOCKS until funded;
   * the default here is `false` because only the first deploy needs it.
   */
  readonly waitForFunds?: boolean;
}

/** Executor over a real chain. Built with `deploy` or `connect`. */
export class NetworkExecutor implements TestigoExecutor {
  readonly mode = 'network' as const;

  private constructor(
    readonly contractAddress: string,
    private readonly providers: ContractProviders<TestigoContract>,
    private readonly contract: FoundContract<TestigoContract>,
    readonly walletProvider: MidnightWalletProvider,
    readonly network: NetworkConfig,
    /** Only present when this process performed the deploy. */
    readonly deployTxId?: string,
  ) {
    // The private state provider demands to know which contract it works
    // against BEFORE any get/set. Set once, here.
    this.providers.privateStateProvider.setContractAddress(contractAddress);
  }

  private static async setup(
    options: NetworkOptions,
  ): Promise<{
    providers: ContractProviders<TestigoContract>;
    walletProvider: MidnightWalletProvider;
    network: NetworkConfig;
    compiled: CompiledTestigoContract;
  }> {
    const network = options.network ?? currentNetwork();
    const { providers, walletProvider, zkConfigPath } = await createProviders<
      TestigoCircuitId,
      TestigoPrivateState
    >({
      network,
      ...(options.seed === undefined ? {} : { seed: options.seed }),
      ...(options.logger === undefined ? {} : { logger: options.logger }),
      ...(options.zkConfigPath === undefined ? {} : { zkConfigPath: options.zkConfigPath }),
    });
    await walletProvider.start(options.waitForFunds ?? false);
    return { providers, walletProvider, network, compiled: compileContract(zkConfigPath) };
  }

  /** B3.1 — fresh deploy. Needs a seed WITH tDUST. */
  static async deploy(options: NetworkOptions = {}): Promise<NetworkExecutor> {
    const { providers, walletProvider, network, compiled } = await NetworkExecutor.setup({
      ...options,
      // The deploy is the only thing that truly needs funds before starting.
      waitForFunds: options.waitForFunds ?? true,
    });
    try {
      const deployed = await deployContract<TestigoContract>(providers, {
        compiledContract: compiled,
        privateStateId: TESTIGO_PRIVATE_STATE_ID,
        initialPrivateState: emptyPrivateState(),
      });
      const { contractAddress } = deployed.deployTxData.public;
      return new NetworkExecutor(
        contractAddress,
        providers,
        deployed,
        walletProvider,
        network,
        deployed.deployTxData.public.txId,
      );
    } catch (error) {
      throw mapCircuitError(error);
    }
  }

  /**
   * B3.1 — connect to an already deployed contract.
   *
   * Without `contractAddress` it uses the one from `deployment.json`.
   * `findDeployedContract` compares the local verifier keys against the
   * on-chain contract's and throws `ContractTypeError` if they differ — so
   * it detects "you recompiled the contract and the address went stale"
   * before sending a tx that was going to fail.
   */
  static async connect(
    contractAddress?: string,
    options: NetworkOptions = {},
  ): Promise<NetworkExecutor> {
    const { providers, walletProvider, network, compiled } =
      await NetworkExecutor.setup(options);
    const address = contractAddress ?? (await requireDeployment()).contractAddress;
    try {
      const found = await findDeployedContract<TestigoContract>(providers, {
        compiledContract: compiled,
        contractAddress: address,
        privateStateId: TESTIGO_PRIVATE_STATE_ID,
      });
      return new NetworkExecutor(address, providers, found, walletProvider, network);
    } catch (error) {
      throw mapCircuitError(error);
    }
  }

  nowSeconds(): number {
    return Math.floor(Date.now() / 1000);
  }

  async readLedger(): Promise<Ledger> {
    const state = await this.providers.publicDataProvider.queryContractState(
      this.contractAddress,
    );
    if (state === null) {
      throw new ContractNotFoundError(this.contractAddress, this.network.indexer);
    }
    return ledgerFromState(state);
  }

  async readPrivateState(): Promise<TestigoPrivateState> {
    const stored = await this.providers.privateStateProvider.get(TESTIGO_PRIVATE_STATE_ID);
    return stored ?? emptyPrivateState();
  }

  async writePrivateState(ps: TestigoPrivateState): Promise<void> {
    await this.providers.privateStateProvider.set(TESTIGO_PRIVATE_STATE_ID, ps);
  }

  async call<K extends TestigoCircuit>(
    circuit: K,
    ...args: CircuitArgs[K]
  ): Promise<TxResult> {
    // Same cast as in the simulator and for the same reason: `callTx[K]` has
    // a different signature per circuit (and is overloaded on top), and TS
    // does not unify them in a generic call. The args already come typed by
    // `CircuitArgs[K]`, derived from the generated .d.ts.
    const fn = this.contract.callTx[circuit] as (
      ...a: unknown[]
    ) => Promise<{ public: { txId: string; blockHeight: number; status: string } }>;
    try {
      const result = await fn(...args);
      return asTxResult(result.public);
    } catch (error) {
      // Here is where a contract `assert` becomes InvalidCredentialError /
      // RepeatedNullifierError / NotTheAuthorError. midnight-js runs the
      // circuit LOCALLY to build the transcript before proving and before
      // submitting, so these failures happen without spending proving and
      // without submitting a transaction.
      throw mapCircuitError(error, circuit);
    }
  }

  /** `stop()`, not `close()` — verified in the testkit-js 4.1.1 .d.ts. */
  async close(): Promise<void> {
    await this.walletProvider.stop();
  }
}
