/**
 * B1 smoke — acceptance criterion of docs/04 §B1.3.
 *
 * Instantiates the providers against the active network and does a real
 * indexer query. Deploys nothing, spends no tDUST, generates no proofs: it
 * is just "is the plumbing connected?".
 *
 *   npm run build --workspace=app && node app/dist/config/smoke.js
 *   NETWORK=local node app/dist/config/smoke.js
 *
 * Exit code ≠ 0 if a mandatory check fails. Checks depending on
 * `DEPLOY_SEED` are SKIPPED (not failed) if the seed is not there yet: B1
 * must be verifiable before the faucet delivers tDUST.
 */
import './init.js';

import { currentNetwork, currentNetworkId } from './init.js';
import { describeNetwork } from './networks.js';
import { deploymentFilePath, readDeployment, readCompilerVersion } from './deployment.js';
import { zkConfigDirectory } from './paths.js';
import {
  MissingSeedError,
  TESTIGO_CIRCUIT_IDS,
  createProviders,
  createReadOnlyProviders,
  missingZkArtifacts,
  readDeploySeed,
} from './providers.js';

type Status = 'ok' | 'fail' | 'skip';

interface CheckResult {
  readonly name: string;
  readonly status: Status;
  readonly detail: string;
}

const results: CheckResult[] = [];

const record = (name: string, status: Status, detail: string): void => {
  const icon = status === 'ok' ? 'OK  ' : status === 'skip' ? 'SKIP' : 'FAIL';
  console.log(`[${icon}] ${name}: ${detail}`);
  results.push({ name, status, detail });
};

const fail = (name: string, error: unknown): void => {
  const message = error instanceof Error ? error.message : String(error);
  record(name, 'fail', message.split('\n')[0] ?? message);
};

/** Explicit timeout: a hung endpoint must not hang the smoke. */
const fetchWithTimeout = async (url: string, init: RequestInit, ms: number): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const main = async (): Promise<void> => {
  const network = currentNetwork();

  console.log('='.repeat(72));
  console.log('SMOKE B1 — config and providers');
  console.log('='.repeat(72));
  console.log(describeNetwork(network));
  console.log('-'.repeat(72));

  // 1 — B1.4: the global network id got set.
  try {
    const id = currentNetworkId();
    if (id !== network.networkId) {
      throw new Error(`getNetworkId()="${id}" but the active network says "${network.networkId}"`);
    }
    record('B1.4 setNetworkId', 'ok', `getNetworkId() = "${id}"`);
  } catch (error) {
    fail('B1.4 setNetworkId', error);
  }

  // 2 — B1.2: deployment.json reads and parses.
  try {
    const deployment = await readDeployment();
    record(
      'B1.2 deployment.json',
      'ok',
      deployment === null
        ? `placeholder (no deploy yet) — ${deploymentFilePath()}`
        : `${deployment.network} @ ${deployment.contractAddress}`,
    );
  } catch (error) {
    fail('B1.2 deployment.json', error);
  }

  // 3 — ZK artifacts where the zk-config provider will look for them.
  const zkPath = zkConfigDirectory();
  try {
    const missing = missingZkArtifacts(zkPath);
    if (missing.length > 0) {
      throw new Error(`${missing.length} files missing in ${zkPath} (e.g. ${missing[0]})`);
    }
    const compilerVersion = await readCompilerVersion(zkPath);
    record(
      'ZK artifacts',
      'ok',
      `${TESTIGO_CIRCUIT_IDS.length} circuits (prover+verifier+bzkir) in ${zkPath} — compiler ${compilerVersion}`,
    );
  } catch (error) {
    fail('ZK artifacts', error);
  }

  // 4 — Local proof server. On 8.1.0 both `GET /` and `GET /health` answer
  //     `{"status":"ok"}` (an unknown path 404s, so neither is a catch-all).
  //     We use `/` because it is the one the root check is documented against.
  try {
    const response = await fetchWithTimeout(`${network.proofServer}/`, {}, 10_000);
    const body = (await response.text()).trim();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} — ${body}`);
    }
    record('proof server', 'ok', `${network.proofServer} — ${body}`);
  } catch (error) {
    fail('proof server', error);
  }

  // 5 — Trivial indexer query: the latest block. It is the literal B1.3
  //     acceptance criterion, and also evidence the network is advancing.
  try {
    const response = await fetchWithTimeout(
      network.indexer,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'query { block { height hash timestamp } }' }),
      },
      20_000,
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = (await response.json()) as {
      data?: { block?: { height: number; hash: string; timestamp: number } | null };
      errors?: { message: string }[];
    };
    if (payload.errors !== undefined && payload.errors.length > 0) {
      throw new Error(payload.errors.map((e) => e.message).join('; '));
    }
    const block = payload.data?.block;
    if (block === undefined || block === null) {
      throw new Error('the indexer responded without a block');
    }
    record(
      'indexer (latest block)',
      'ok',
      `height=${block.height} hash=${block.hash.slice(0, 16)}… ts=${new Date(
        block.timestamp,
      ).toISOString()}`,
    );
  } catch (error) {
    fail('indexer (latest block)', error);
  }

  // 6 — The SAME query but through the SDK provider, which is what B3/B4
  //     will use. A nonexistent contract returns null: that already proves
  //     the Apollo client assembled fine and talked to the indexer.
  try {
    const { publicDataProvider } = createReadOnlyProviders(network);
    const deployment = await readDeployment();
    const address = deployment?.contractAddress ?? '00'.repeat(32);
    const state = await publicDataProvider.queryContractState(address);
    record(
      'publicDataProvider (SDK)',
      'ok',
      deployment === null
        ? `queryContractState(<dummy>) → null, as it should (round-trip OK)`
        : `queryContractState(${address.slice(0, 16)}…) → ${state === null ? 'null ⚠️ the deployed contract does not show up' : 'ContractState'}`,
    );
  } catch (error) {
    fail('publicDataProvider (SDK)', error);
  }

  // 7 — Wallet + the 6 providers. Requires DEPLOY_SEED.
  let seedPresent = false;
  try {
    readDeploySeed();
    seedPresent = true;
  } catch (error) {
    if (error instanceof MissingSeedError) {
      record('wallet + 6 providers', 'skip', 'no DEPLOY_SEED in .env (B5.0 has not run yet)');
    } else {
      fail('wallet + 6 providers', error);
    }
  }

  if (seedPresent) {
    try {
      const { providers, walletProvider } = await createProviders();
      const keys = Object.keys(providers).sort().join(', ');
      const coinPublicKey = Buffer.from(walletProvider.getCoinPublicKey()).toString('hex');
      record('wallet + 6 providers', 'ok', `[${keys}] · coinPublicKey=${coinPublicKey.slice(0, 16)}…`);

      // The private state provider validates the password on every
      // operation: a get() is the cheapest way to confirm the policy passes.
      try {
        providers.privateStateProvider.setContractAddress('00'.repeat(32));
        await providers.privateStateProvider.get('smoke-b1');
        record('private state (LevelDB)', 'ok', 'valid password, store accessible');
      } catch (error) {
        fail('private state (LevelDB)', error);
      }

      await walletProvider.stop();
    } catch (error) {
      fail('wallet + 6 providers', error);
    }
  }

  // Summary
  console.log('-'.repeat(72));
  const failed = results.filter((r) => r.status === 'fail');
  const skipped = results.filter((r) => r.status === 'skip');
  const passed = results.filter((r) => r.status === 'ok');
  console.log(
    `SUMMARY: ${passed.length} ok · ${skipped.length} skipped · ${failed.length} failed`,
  );
  if (failed.length > 0) {
    for (const f of failed) {
      console.log(`  FAIL ${f.name}: ${f.detail}`);
    }
  }
  console.log('='.repeat(72));

  // Apollo/websockets may leave open handles; exit explicitly.
  process.exit(failed.length > 0 ? 1 : 0);
};

await main();
