/**
 * B1.3 — The 6 midnight-js providers.
 *
 * `MidnightProviders` (verified in `midnight-js-types/dist/providers.d.ts`,
 * 4.1.1) requires exactly:
 *
 *   privateStateProvider · publicDataProvider · zkConfigProvider ·
 *   proofProvider · walletProvider · midnightProvider   (+ optional loggerProvider)
 *
 * The assembly below is the same one `initializeMidnightProviders` from
 * testkit-js does (see `testkit-js/dist/index.mjs`); we write it explicitly
 * because we need to control the ZK artifacts path and the private state
 * password, and because it is code a judge will read.
 *
 * About the wallet: we do NOT use `@midnight-ntwrk/wallet` nor `-wallet-api`.
 * They are at 5.0.0, mount old zswap/ledger incompatible with the 4.1.1
 * stack and are not in the compatibility matrix. The supported path for
 * "wallet from seed" is testkit-js's `MidnightWalletProvider`, which
 * implements both `WalletProvider` and `MidnightProvider` (the two missing
 * providers).
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';

import type { ContractState } from '@midnight-ntwrk/compact-runtime';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import type {
  MidnightProviders,
  PrivateStateId,
  PrivateStateProvider,
  ProofProvider,
  PublicDataProvider,
} from '@midnight-ntwrk/midnight-js-types';
import { MidnightWalletProvider, logger as defaultLogger } from '@midnight-ntwrk/testkit-js';
import type { NetworkId } from '@midnight-ntwrk/wallet-sdk';

import { currentNetwork } from './init.js';
import type { NetworkConfig } from './networks.js';
import { REPO_ROOT, privateStateDirectory, zkConfigDirectory } from './paths.js';

// ---------------------------------------------------------------------------
// Compatibility guard the SDK does NOT give us
// ---------------------------------------------------------------------------

/**
 * ⚠️ `MidnightWalletProvider.build(logger, env, seed)` declares `env` with a
 * type TypeScript cannot resolve: the testkit-js 4.1.1 `.d.ts` imports
 * `EnvironmentConfiguration` from the `@/index` alias, which does not exist
 * outside the package's own build. With `skipLibCheck` that collapses to
 * `any`.
 *
 * Verified, not assumed: `MidnightWalletProvider.build(logger, { onlyThis: 1 },
 * 'x')` type-checks without a complaint. Meaning NOTHING validates that
 * `NetworkConfig` has what the wallet needs — a misspelled field would only
 * show up at runtime, mid-deploy.
 *
 * This type replicates the fields the SDK ACTUALLY reads, taken from the
 * code: `mapEnvironmentToConfiguration` (indexer, indexerWS, proofServer,
 * walletNetworkId, nodeWS) and `waitForFunds` (faucet). The line below makes
 * `tsc` fail if `NetworkConfig` stops fulfilling the contract.
 */
interface WalletEnvironmentShape {
  readonly walletNetworkId: NetworkId.NetworkId;
  readonly indexer: string;
  readonly indexerWS: string;
  readonly nodeWS: string;
  readonly proofServer: string;
  readonly faucet: string | undefined;
}

type AssertAssignable<T extends U, U> = T;

/** Fails the build if `NetworkConfig` stops working as the wallet env. */
export type NetworkConfigIsWalletEnvironment = AssertAssignable<
  NetworkConfig,
  WalletEnvironmentShape
>;

/**
 * The circuits with Testigo keys. They must match 1:1 with
 * `contracts/output/keys/*.prover` — `NodeZkConfigProvider` looks them up by
 * file name. If the contract gains a circuit, it is added here.
 */
export type TestigoCircuitId =
  | 'registerOrganization'
  | 'issueCredential'
  | 'report'
  | 'revealAuthorship';

/** The same ones, as an array — to check that the artifacts exist. */
export const TESTIGO_CIRCUIT_IDS: readonly TestigoCircuitId[] = [
  'registerOrganization',
  'issueCredential',
  'report',
  'revealAuthorship',
];

/**
 * The logger type `MidnightWalletProvider.build` expects (a pino `Logger`).
 * Derived from the real signature instead of importing `pino`, which is not
 * a declared dependency of `app/`.
 */
export type WalletLogger = Parameters<typeof MidnightWalletProvider.build>[0];

/**
 * Logger for the CLI scripts.
 *
 * The logger testkit-js exports comes at `info` level and dumps the wallet's
 * full config to stdout — including **the seed in the clear**
 * (`Your wallet seed is: ...`, in `MidnightWalletProvider.build`). That is
 * poison for demo material projected in a video, and worse if someone pastes
 * the log into an issue.
 *
 * We lower the level to `warn` by default. We also lower the testkit
 * singleton's, because parts of the SDK (`FluentWalletBuilder.forEnvironment`,
 * `WalletFactory`) log against THAT object and not the one we pass: without
 * this they keep hitting stdout even with our child silenced.
 *
 * `LOG_LEVEL=info` (or `debug`) raises it again for debugging.
 */
export const scriptLogger = (env: NodeJS.ProcessEnv = process.env): WalletLogger => {
  const requested = env.LOG_LEVEL?.trim();
  const level = requested !== undefined && requested !== '' ? requested : 'warn';
  defaultLogger.level = level;
  const child = defaultLogger.child({ app: 'testigo' });
  child.level = level;
  return child;
};

/** Base name of the private state store in LevelDB. */
export const PRIVATE_STATE_STORE_NAME = 'testigo-private-state';

/** Id of the contract's private state (key inside the store). */
export const TESTIGO_PRIVATE_STATE_ID = 'testigo';

// ---------------------------------------------------------------------------
// .env
// ---------------------------------------------------------------------------

let envLoaded = false;

/**
 * Loads the repo root's `.env` if it exists.
 *
 * Node 22 brings `process.loadEnvFile()` — no need for `dotenv`. Variables
 * already present in the environment are NOT overridden, so
 * `NETWORK=local npm run ...` still wins over `.env`.
 */
export const loadEnvFile = (): void => {
  if (envLoaded) {
    return;
  }
  envLoaded = true;
  const envPath = path.resolve(REPO_ROOT, '.env');
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
};

/** Actionable error when `DEPLOY_SEED` is missing or malformed. */
export class MissingSeedError extends Error {
  constructor(detail: string) {
    super(
      `${detail}\n` +
        'Generate one with: openssl rand -hex 32\n' +
        'and put it in .env as DEPLOY_SEED=<64 hex chars> (never commit it).',
    );
    this.name = 'MissingSeedError';
  }
}

const HEX64 = /^[0-9a-f]{64}$/i;

/**
 * Reads and validates `DEPLOY_SEED`.
 *
 * Format: 64 hex chars (32 bytes). The SDK does `Buffer.from(seed, 'hex')`
 * and passes it to `HDWallet.fromSeed` (verified in `deriveKeyForRole`,
 * testkit-js); a non-hex string silently becomes a truncated buffer and the
 * derivation fails with a cryptic error. Hence the validation here.
 */
export const readDeploySeed = (env: NodeJS.ProcessEnv = process.env): string => {
  loadEnvFile();
  const seed = env.DEPLOY_SEED?.trim();
  if (seed === undefined || seed === '') {
    throw new MissingSeedError('DEPLOY_SEED is missing.');
  }
  if (!HEX64.test(seed)) {
    throw new MissingSeedError(
      `DEPLOY_SEED has ${seed.length} chars, expected 64 hex (32 bytes).`,
    );
  }
  return seed.toLowerCase();
};

// ---------------------------------------------------------------------------
// Private state
// ---------------------------------------------------------------------------

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';

/**
 * Encryption password of the private state LevelDB.
 *
 * `levelPrivateStateProvider` validates the password on EVERY read/write
 * against a hard policy (`validatePassword` in midnight-js-utils 4.1.1):
 * ≥16 chars · ≥3 of 4 character classes · ≤3 identical in a row · no 4+
 * sequences (`1234`, `abcd`).
 *
 * If `PRIVATE_STATE_PASSWORD` is not set, we derive it from `DEPLOY_SEED`
 * with a domain tag. The seed is already the secret protecting everything
 * else, so this adds no new surface — and it is strictly better than the
 * hardcoded constant the testkit uses.
 *
 * The alphabet alternates UPPERCASE/lowercase position by position: two
 * contiguous characters are never at ±1 code point, so the result cannot
 * trip the "sequences" check.
 */
export const derivePrivateStatePassword = (seed: string): string => {
  const digest = createHash('sha256').update(`testigo:private-state:v1:${seed}`).digest();
  let out = 'Tg7#';
  for (let i = 0; i < 20; i += 1) {
    const byte = digest[i] as number;
    out += i % 2 === 0 ? UPPER[byte % UPPER.length] : LOWER[byte % LOWER.length];
  }
  return out;
};

/** Effective password: the explicit env one, or the seed-derived one. */
export const privateStatePassword = (env: NodeJS.ProcessEnv = process.env): string => {
  loadEnvFile();
  const explicit = env.PRIVATE_STATE_PASSWORD?.trim();
  if (explicit !== undefined && explicit !== '') {
    return explicit;
  }
  return derivePrivateStatePassword(readDeploySeed(env));
};

// ---------------------------------------------------------------------------
// Individual providers
// ---------------------------------------------------------------------------

/**
 * Public data provider (indexer).
 *
 * Patched to avoid the `offset: null` bug on hosted Preview/Preprod indexers:
 * calling `queryContractState` without an offset triggers an internal error.
 * We override `queryContractState` with a raw GraphQL query that omits the
 * offset field entirely; every other method delegates to the SDK provider.
 *
 * `indexerPublicDataProvider(queryURL, subscriptionURL, webSocketImpl?)` —
 * two URLs, not one: HTTP for queries, WebSocket for subscriptions.
 *
 * Needs no wallet or seed: it is the one `verifyAuthorship` (B3.6, 100%
 * off-chain) and `readLedgerState` (B3.7) use.
 */
export const buildPublicDataProvider = (network: NetworkConfig): PublicDataProvider => {
  const base = indexerPublicDataProvider(network.indexer, network.indexerWS);
  return {
    ...base,
    async queryContractState(address: string): Promise<ContractState | null> {
      const res = await fetch(network.indexer, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          query: `
            query LATEST_STATE($address: HexEncoded!) {
              contractAction(address: $address) { state }
            }
          `,
          variables: { address },
        }),
      });
      const payload = (await res.json()) as {
        data?: { contractAction?: { state: string } | null };
        errors?: Array<{ message: string }>;
      };
      if (payload.errors?.length) {
        throw new Error(payload.errors.map((e) => e.message).join('; '));
      }
      return (payload.data?.contractAction?.state as ContractState | undefined) ?? null;
    },
  };
};

/**
 * ZK artifacts provider, reading `contracts/output/`.
 *
 * `NodeZkConfigProvider` expects `keys/<circuitId>.prover|.verifier` and
 * `zkir/<circuitId>.bzkir` inside. That is exactly the layout `compact
 * compile` emits, so we point at the output directory as-is.
 */
export const buildZkConfigProvider = <K extends string = TestigoCircuitId>(
  zkConfigPath: string = zkConfigDirectory(),
): NodeZkConfigProvider<K> => new NodeZkConfigProvider<K>(zkConfigPath);

/**
 * Verifies that the ZK artifacts exist BEFORE trying to prove anything.
 *
 * Without this, an empty `contracts/output/` shows up as an ENOENT in the
 * middle of proving, after having assembled wallet and transaction. Returns
 * the list of missing files (empty = all good).
 */
export const missingZkArtifacts = (
  zkConfigPath: string = zkConfigDirectory(),
  circuitIds: readonly string[] = TESTIGO_CIRCUIT_IDS,
): string[] => {
  const missing: string[] = [];
  for (const id of circuitIds) {
    for (const rel of [
      path.join('keys', `${id}.prover`),
      path.join('keys', `${id}.verifier`),
      path.join('zkir', `${id}.bzkir`),
    ]) {
      const full = path.resolve(zkConfigPath, rel);
      if (!existsSync(full)) {
        missing.push(full);
      }
    }
  }
  return missing;
};

/** Same as `missingZkArtifacts`, but blows up with instructions. */
export const assertZkArtifacts = (zkConfigPath: string = zkConfigDirectory()): void => {
  const missing = missingZkArtifacts(zkConfigPath);
  if (missing.length > 0) {
    throw new Error(
      `Missing ZK artifacts in ${zkConfigPath}:\n` +
        missing.map((m) => `  - ${m}`).join('\n') +
        '\nRun: npm run compile --workspace=contracts',
    );
  }
};

/**
 * HTTP proof provider against the local proof server.
 *
 * `httpClientProofProvider(url, zkConfigProvider, config?)` — it needs the
 * zkConfigProvider because it proves circuit by circuit against `/check`
 * and `/prove` (the `/prove-tx` endpoint is NOT used; see the package doc).
 *
 * The proof server never receives the seed or the signing keys.
 */
export const buildProofProvider = <K extends string = TestigoCircuitId>(
  network: NetworkConfig,
  zkConfigProvider: NodeZkConfigProvider<K>,
): ProofProvider => httpClientProofProvider<K>(network.proofServer, zkConfigProvider);

/**
 * Private state provider over LevelDB.
 *
 * In 4.1.1 `levelPrivateStateProvider` requires two mandatory fields older
 * versions did not have: `privateStoragePasswordProvider` and `accountId`
 * (isolation between accounts sharing the same database).
 */
export const buildPrivateStateProvider = <
  PSI extends PrivateStateId = PrivateStateId,
  PS = unknown,
>(options: {
  readonly accountId: string;
  readonly password: string;
  readonly storeName?: string;
  readonly directory?: string;
}): PrivateStateProvider<PSI, PS> => {
  const storeName = options.storeName ?? PRIVATE_STATE_STORE_NAME;
  return levelPrivateStateProvider<PSI, PS>({
    midnightDbName: path.resolve(options.directory ?? privateStateDirectory(), storeName),
    privateStateStoreName: storeName,
    signingKeyStoreName: `${storeName}-signing-keys`,
    privateStoragePasswordProvider: () => options.password,
    accountId: options.accountId,
  });
};

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

/**
 * Builds the wallet from `DEPLOY_SEED`.
 *
 * `MidnightWalletProvider` implements `WalletProvider` AND
 * `MidnightProvider`: it covers `balanceTx` / `getCoinPublicKey` /
 * `getEncryptionPublicKey` and `submitTx`.
 *
 * BEWARE: `build()` does NOT start the wallet. `start()` must be called
 * separately, and `start(true)` (the default) requests tDUST from the faucet
 * and BLOCKS until funded. For anything but the first deploy you want
 * `start(false)`.
 */
export const buildWalletProvider = async (
  network: NetworkConfig = currentNetwork(),
  options: {
    readonly seed?: string;
    readonly logger?: WalletLogger;
  } = {},
): Promise<MidnightWalletProvider> => {
  const seed = options.seed ?? readDeploySeed();
  return MidnightWalletProvider.build(options.logger ?? scriptLogger(), network, seed);
};

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/** Providers + the loose pieces the scripts need separately. */
export interface TestigoProviders<PCK extends string = TestigoCircuitId, PS = unknown> {
  readonly providers: MidnightProviders<PCK, PrivateStateId, PS>;
  readonly walletProvider: MidnightWalletProvider;
  readonly network: NetworkConfig;
  readonly zkConfigPath: string;
}

/**
 * Assembles the 6 providers from an already built wallet.
 *
 * `accountId` comes from the wallet's coin public key — same criterion as
 * the testkit's `initializeMidnightProviders` — so two different seeds do
 * not step on each other's private state.
 */
export const assembleProviders = <PCK extends string = TestigoCircuitId, PS = unknown>(options: {
  readonly walletProvider: MidnightWalletProvider;
  readonly network: NetworkConfig;
  readonly zkConfigPath?: string;
  readonly privateStatePassword: string;
  readonly privateStateStoreName?: string;
}): MidnightProviders<PCK, PrivateStateId, PS> => {
  const zkConfigPath = options.zkConfigPath ?? zkConfigDirectory();
  const zkConfigProvider = buildZkConfigProvider<PCK>(zkConfigPath);
  // `getCoinPublicKey()` returns a hex STRING, so this `Buffer.from` encodes
  // it as UTF-8 and ends up hexing the hex (the accountId comes out double
  // length). Ugly, but it is exactly what the testkit's
  // `initializeMidnightProviders` does: we keep it identical on purpose so a
  // store written by our code and one written by the SDK helper are the same.
  // The accountId only needs to be deterministic and unique per wallet, and
  // it is (the SDK hashes it with SHA-256 anyway).
  const accountId = Buffer.from(options.walletProvider.getCoinPublicKey()).toString('hex');

  return {
    privateStateProvider: buildPrivateStateProvider<PrivateStateId, PS>({
      accountId,
      password: options.privateStatePassword,
      storeName: options.privateStateStoreName,
    }),
    publicDataProvider: buildPublicDataProvider(options.network),
    zkConfigProvider,
    proofProvider: buildProofProvider<PCK>(options.network, zkConfigProvider),
    walletProvider: options.walletProvider,
    midnightProvider: options.walletProvider,
  };
};

/**
 * Full path: active network → wallet from `DEPLOY_SEED` → 6 providers.
 *
 * It is what the B4 scripts call. It does NOT start the wallet (see
 * `buildWalletProvider`): the script decides whether it needs to wait for
 * funds.
 */
export const createProviders = async <PCK extends string = TestigoCircuitId, PS = unknown>(
  options: {
    readonly network?: NetworkConfig;
    readonly seed?: string;
    readonly logger?: WalletLogger;
    readonly zkConfigPath?: string;
    readonly checkArtifacts?: boolean;
  } = {},
): Promise<TestigoProviders<PCK, PS>> => {
  const network = options.network ?? currentNetwork();
  const zkConfigPath = options.zkConfigPath ?? zkConfigDirectory();
  if (options.checkArtifacts !== false) {
    assertZkArtifacts(zkConfigPath);
  }
  const seed = options.seed ?? readDeploySeed();
  const walletProvider = await buildWalletProvider(network, { seed, logger: options.logger });
  const providers = assembleProviders<PCK, PS>({
    walletProvider,
    network,
    zkConfigPath,
    privateStatePassword: privateStatePassword(),
  });
  return { providers, walletProvider, network, zkConfigPath };
};

/**
 * Read-only: indexer, no wallet, no seed, no proof server.
 *
 * It is the mode `verifyAuthorship` (B3.6) and `readLedgerState` (B3.7)
 * need. That the prosecutor can verify an authorship without owning a
 * wallet is part of the demo, not an implementation detail.
 */
export const createReadOnlyProviders = (
  network: NetworkConfig = currentNetwork(),
): { readonly publicDataProvider: PublicDataProvider; readonly network: NetworkConfig } => ({
  publicDataProvider: buildPublicDataProvider(network),
  network,
});
