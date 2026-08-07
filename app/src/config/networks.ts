/**
 * B1.1 — Testigo network environments.
 *
 * Two environments: `preview` (the hackathon's public network) and `local`
 * (Docker devnet). Selection happens via `process.env.NETWORK`, defaulting
 * to `preview`.
 *
 * GOLDEN RULE (docs/01-arquitectura.md §8): nothing here comes from memory.
 * The config object's shape and the Preview URLs are copied from the
 * authoritative source: `PreviewTestEnvironment.getEnvironmentConfiguration()`
 * and `LocalTestConfiguration` in
 * `node_modules/@midnight-ntwrk/testkit-js/dist/index.mjs` (4.1.1).
 *
 * Two details the plan (docs/04 §B1.1) did not mention and the SDK DOES
 * require:
 *
 *  1. `indexerPublicDataProvider(queryURL, subscriptionURL)` needs TWO URLs.
 *     The subscription one is the indexer's WebSocket endpoint
 *     (`.../api/v4/graphql/ws`), not the HTTP one.
 *  2. The local network's `networkId` is NOT `'local'`: the standalone node
 *     identifies as `'undeployed'`. `'local'` is only the name used to pick
 *     the environment from the CLI/env.
 */
import { NetworkId } from '@midnight-ntwrk/wallet-sdk';

/** Name used to pick the environment (`NETWORK=...`). */
export type NetworkName = 'preview' | 'local';

/**
 * Configuration of one environment.
 *
 * Structurally compatible with testkit-js's `EnvironmentConfiguration` —
 * `config/providers.ts` passes it straight to
 * `MidnightWalletProvider.build()`, and `tsc` verifies the compatibility
 * there. Defining it here (instead of importing the type from a
 * devDependency) keeps this module free of testkit dependencies.
 */
export interface NetworkConfig {
  /** Environment name as requested via `NETWORK=`. */
  readonly name: NetworkName;
  /** Network id consumed by the wallet SDK (bech32m addresses, etc.). */
  readonly walletNetworkId: NetworkId.NetworkId;
  /** Global midnight-js network id — consumed by `setNetworkId` (see init.ts). */
  readonly networkId: string;
  /** Indexer GraphQL HTTP endpoint (queries). */
  readonly indexer: string;
  /** Indexer GraphQL WebSocket endpoint (subscriptions). */
  readonly indexerWS: string;
  /** Node HTTP RPC. */
  readonly node: string;
  /** Node WebSocket RPC. */
  readonly nodeWS: string;
  /** Proof server. Always local: it never sees the seed or the signing keys. */
  readonly proofServer: string;
  /** tDUST faucet, if the environment has one. */
  readonly faucet: string | undefined;
}

/** Default proof server (image `midnightntwrk/proof-server:8.1.0`). */
export const DEFAULT_PROOF_SERVER = 'http://localhost:6300';

/** Environment used when `NETWORK` is not set. */
export const DEFAULT_NETWORK: NetworkName = 'preview';

/**
 * Preview — the hackathon's public network.
 * URLs verified against testkit-js 4.1.1's `PreviewTestEnvironment`.
 */
export const PREVIEW: NetworkConfig = {
  name: 'preview',
  walletNetworkId: NetworkId.NetworkId.Preview,
  networkId: 'preview',
  indexer: 'https://indexer.preview.midnight.network/api/v4/graphql',
  indexerWS: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
  node: 'https://rpc.preview.midnight.network',
  nodeWS: 'wss://rpc.preview.midnight.network',
  proofServer: DEFAULT_PROOF_SERVER,
  faucet: 'https://faucet.preview.midnight.network/api/drips',
};

/**
 * Local — Docker devnet (plan B of docs/03 §6).
 * Ports per docs/02-entorno.md and AGENTS.md: node 9944, indexer 8088.
 */
export const LOCAL: NetworkConfig = {
  name: 'local',
  walletNetworkId: NetworkId.NetworkId.Undeployed,
  networkId: 'undeployed',
  indexer: 'http://localhost:8088/api/v4/graphql',
  indexerWS: 'ws://localhost:8088/api/v4/graphql/ws',
  node: 'http://localhost:9944',
  nodeWS: 'ws://localhost:9944',
  proofServer: DEFAULT_PROOF_SERVER,
  faucet: undefined,
};

/** Every known environment, indexed by name. */
export const NETWORKS: Readonly<Record<NetworkName, NetworkConfig>> = {
  preview: PREVIEW,
  local: LOCAL,
};

/** Valid names, for error messages. */
export const NETWORK_NAMES: readonly NetworkName[] = ['preview', 'local'];

/** Type guard: is this string a known environment? */
export const isNetworkName = (value: string): value is NetworkName =>
  Object.prototype.hasOwnProperty.call(NETWORKS, value);

/**
 * Normalizes the raw `NETWORK` value. Fails closed: an unknown name is an
 * explicit error, not a silent fallback to Preview (deploying against the
 * wrong network over a typo is exactly the bug we do not want).
 */
export const resolveNetworkName = (raw: string | undefined): NetworkName => {
  const trimmed = raw?.trim();
  if (trimmed === undefined || trimmed === '') {
    return DEFAULT_NETWORK;
  }
  if (!isNetworkName(trimmed)) {
    throw new Error(
      `NETWORK="${trimmed}" is not a valid environment. Options: ${NETWORK_NAMES.join(' | ')}.`,
    );
  }
  return trimmed;
};

/** Returns an environment's configuration by name. */
export const getNetworkConfig = (name: NetworkName): NetworkConfig => NETWORKS[name];

/**
 * Configuration of the active environment, reading the process env.
 *
 * - `NETWORK` picks the environment (default `preview`).
 * - `PROOF_SERVER` may override the proof server URL (useful if the
 *   container landed on another port).
 */
export const activeNetwork = (env: NodeJS.ProcessEnv = process.env): NetworkConfig => {
  const base = getNetworkConfig(resolveNetworkName(env.NETWORK));
  const proofServerOverride = env.PROOF_SERVER?.trim();
  if (proofServerOverride === undefined || proofServerOverride === '') {
    return base;
  }
  return { ...base, proofServer: proofServerOverride };
};

/** One line per endpoint — for the scripts' startup log. */
export const describeNetwork = (config: NetworkConfig): string =>
  [
    `network        : ${config.name} (networkId=${config.networkId})`,
    `indexer        : ${config.indexer}`,
    `indexer (ws)   : ${config.indexerWS}`,
    `node           : ${config.nodeWS}`,
    `proof server   : ${config.proofServer}`,
    `faucet         : ${config.faucet ?? '(no faucet)'}`,
  ].join('\n');
