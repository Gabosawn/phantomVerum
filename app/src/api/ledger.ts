/**
 * B3.7 — Reading the contract's public state.
 *
 * Two ways to read, one output:
 *
 *  - `IndexerReader` — GraphQL indexer, NO wallet, NO seed, NO proof server.
 *    It is what `verifyAuthorship` (B3.6) and the UI panel use. That a
 *    prosecutor can verify an authorship with nothing but an indexer URL is
 *    not an implementation detail: it is the product's argument.
 *  - `SimulatorExecutor` — implements the same `LedgerReader` by reading the
 *    in-memory state.
 *
 * Deserialization is done by `ledger()` from the compiler-GENERATED module —
 * no hand-parsing of indexer JSON. If the contract's ledger changes shape,
 * the regenerated .d.ts breaks `tsc` here.
 */
import type { ContractState } from '@midnight-ntwrk/compact-runtime';
import type { PublicDataProvider } from '@midnight-ntwrk/midnight-js-types';

import { requireDeployment } from '../config/deployment.js';
import { currentNetwork } from '../config/init.js';
import type { NetworkConfig } from '../config/networks.js';
import { createReadOnlyProviders } from '../config/providers.js';
import { ledger as readLedgerOf } from '../../../contracts/output/contract/index.js';
import type { Ledger } from '../witnesses/index.js';
import { type Hex32, toHex } from '../witnesses/hex.js';

import type { LedgerReader } from './executor.js';
import type { LedgerState } from './types.js';

/** No state at that address: the contract does not exist or the indexer has not seen it. */
export class ContractNotFoundError extends Error {
  constructor(
    readonly contractAddress: string,
    readonly indexer: string,
  ) {
    super(
      `the indexer has no state for contract ${contractAddress}\n` +
        `  indexer: ${indexer}\n` +
        '  Typical causes: the address belongs to another network, the deploy ' +
        'has not confirmed yet, or `deployment.json` went stale.',
    );
    this.name = 'ContractNotFoundError';
  }
}

/**
 * `ContractState` -> typed `Ledger`.
 *
 * `.data` is the `ChargedState` the generated deserializer expects.
 */
export const ledgerFromState = (state: ContractState): Ledger => readLedgerOf(state.data);

/** Reads the contract state from the indexer. Read-only. */
export class IndexerReader implements LedgerReader {
  constructor(
    private readonly publicDataProvider: PublicDataProvider,
    readonly contractAddress: string,
    private readonly indexerUrl: string,
  ) {}

  async readLedger(): Promise<Ledger> {
    const state = await this.publicDataProvider.queryContractState(this.contractAddress);
    if (state === null) {
      throw new ContractNotFoundError(this.contractAddress, this.indexerUrl);
    }
    return ledgerFromState(state);
  }
}

export interface ReadOnlyReaderOptions {
  /** Contract address. Defaults to the one in `deployment.json`. */
  readonly contractAddress?: string;
  /** Network to query. Defaults to the active one (`NETWORK`). */
  readonly network?: NetworkConfig;
}

/**
 * Reader without wallet or seed: only the active network's indexer.
 *
 * It is the B3.6/B3.7 path. If no `contractAddress` is given, it takes it
 * from `app/src/config/deployment.json` — the single source of the address
 * (§3.2).
 */
export const createReadOnlyReader = async (
  options: ReadOnlyReaderOptions = {},
): Promise<IndexerReader> => {
  const network = options.network ?? currentNetwork();
  const contractAddress =
    options.contractAddress ?? (await requireDeployment()).contractAddress;
  const { publicDataProvider } = createReadOnlyProviders(network);
  return new IndexerReader(publicDataProvider, contractAddress, network.indexer);
};

/** Every element of a ledger `Set`, as Hex32. */
const asHexes = (set: { [Symbol.iterator](): Iterator<Uint8Array> }): Hex32[] => {
  const out: Hex32[] = [];
  const it = set[Symbol.iterator]();
  for (let r = it.next(); r.done !== true; r = it.next()) {
    out.push(toHex(r.value));
  }
  return out;
};

/**
 * Summarizes a `Ledger` into the frozen §3.1 shape.
 *
 * `organizations` and `nullifiers` go as a COUNT, not a list: enumerating
 * the nullifiers in a UI invites correlating them with the reports, and
 * they add nothing to the demo.
 */
export const summarizeLedger = (ledger: Ledger): LedgerState => ({
  organizations: Number(ledger.organizations.size()),
  reports: asHexes(ledger.reports),
  nullifiers: Number(ledger.nullifiers.size()),
  authorships: asHexes(ledger.authorships),
  issuedCredentials: Number(ledger.credentials.firstFree()),
});

/**
 * B3.7 — `readLedgerState()`.
 *
 * With no arguments it uses the active network's indexer against the address
 * in `deployment.json`. With a `LedgerReader` (the simulator, for instance)
 * it reads from there. Same function on both paths.
 */
export const readLedgerState = async (reader?: LedgerReader): Promise<LedgerState> => {
  const source = reader ?? (await createReadOnlyReader());
  return summarizeLedger(await source.readLedger());
};
