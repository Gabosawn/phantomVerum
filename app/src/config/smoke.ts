/**
 * Smoke de B1 — criterio de aceptación de docs/04 §B1.3.
 *
 * Instancia los providers contra la red activa y hace un query real al indexer.
 * No deploya nada, no gasta tDUST, no genera pruebas: es solo "¿la plomería
 * está conectada?".
 *
 *   npm run build --workspace=app && node app/dist/config/smoke.js
 *   NETWORK=local node app/dist/config/smoke.js
 *
 * Exit code ≠ 0 si algún chequeo obligatorio falla. Los chequeos que dependen
 * de `DEPLOY_SEED` se SALTEAN (no fallan) si la seed todavía no está: B1 tiene
 * que poder verificarse antes de que el faucet entregue tDUST.
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

/** Timeout explícito: un endpoint colgado no puede colgar el smoke. */
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
  console.log('SMOKE B1 — config y providers');
  console.log('='.repeat(72));
  console.log(describeNetwork(network));
  console.log('-'.repeat(72));

  // 1 — B1.4: el network id global quedó seteado.
  try {
    const id = currentNetworkId();
    if (id !== network.networkId) {
      throw new Error(`getNetworkId()="${id}" pero la red activa dice "${network.networkId}"`);
    }
    record('B1.4 setNetworkId', 'ok', `getNetworkId() = "${id}"`);
  } catch (error) {
    fail('B1.4 setNetworkId', error);
  }

  // 2 — B1.2: el deployment.json se lee y parsea.
  try {
    const deployment = await readDeployment();
    record(
      'B1.2 deployment.json',
      'ok',
      deployment === null
        ? `placeholder (sin deploy todavía) — ${deploymentFilePath()}`
        : `${deployment.network} @ ${deployment.contractAddress}`,
    );
  } catch (error) {
    fail('B1.2 deployment.json', error);
  }

  // 3 — Artefactos ZK donde el zk-config provider los va a buscar.
  const zkPath = zkConfigDirectory();
  try {
    const missing = missingZkArtifacts(zkPath);
    if (missing.length > 0) {
      throw new Error(`faltan ${missing.length} archivos en ${zkPath} (ej: ${missing[0]})`);
    }
    const compilerVersion = await readCompilerVersion(zkPath);
    record(
      'artefactos ZK',
      'ok',
      `${TESTIGO_CIRCUIT_IDS.length} circuitos (prover+verifier+bzkir) en ${zkPath} — compilador ${compilerVersion}`,
    );
  } catch (error) {
    fail('artefactos ZK', error);
  }

  // 4 — Proof server local.
  try {
    const response = await fetchWithTimeout(`${network.proofServer}/health`, {}, 10_000);
    const body = (await response.text()).trim();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} — ${body}`);
    }
    record('proof server', 'ok', `${network.proofServer} — ${body}`);
  } catch (error) {
    fail('proof server', error);
  }

  // 5 — Query trivial al indexer: el último bloque. Es el criterio literal
  //     de aceptación de B1.3, y además da evidencia de que la red avanza.
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
      throw new Error('el indexer respondió sin bloque');
    }
    record(
      'indexer (último bloque)',
      'ok',
      `height=${block.height} hash=${block.hash.slice(0, 16)}… ts=${new Date(
        block.timestamp,
      ).toISOString()}`,
    );
  } catch (error) {
    fail('indexer (último bloque)', error);
  }

  // 6 — El MISMO query pero a través del provider del SDK, que es lo que van a
  //     usar B3/B4. Un contrato inexistente devuelve null: eso ya prueba que el
  //     cliente Apollo se armó bien y habló con el indexer.
  try {
    const { publicDataProvider } = createReadOnlyProviders(network);
    const deployment = await readDeployment();
    const address = deployment?.contractAddress ?? '00'.repeat(32);
    const state = await publicDataProvider.queryContractState(address);
    record(
      'publicDataProvider (SDK)',
      'ok',
      deployment === null
        ? `queryContractState(<dummy>) → null, como corresponde (round-trip OK)`
        : `queryContractState(${address.slice(0, 16)}…) → ${state === null ? 'null ⚠️ el contrato deployado no aparece' : 'ContractState'}`,
    );
  } catch (error) {
    fail('publicDataProvider (SDK)', error);
  }

  // 7 — Wallet + los 6 providers. Requiere DEPLOY_SEED.
  let seedPresent = false;
  try {
    readDeploySeed();
    seedPresent = true;
  } catch (error) {
    if (error instanceof MissingSeedError) {
      record('wallet + 6 providers', 'skip', 'sin DEPLOY_SEED en .env (B5.0 todavía no corrió)');
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

      // El private state provider valida la password en cada operación:
      // un get() es la forma más barata de comprobar que la política pasa.
      try {
        providers.privateStateProvider.setContractAddress('00'.repeat(32));
        await providers.privateStateProvider.get('smoke-b1');
        record('private state (LevelDB)', 'ok', 'password válida, store accesible');
      } catch (error) {
        fail('private state (LevelDB)', error);
      }

      await walletProvider.stop();
    } catch (error) {
      fail('wallet + 6 providers', error);
    }
  }

  // Resumen
  console.log('-'.repeat(72));
  const failed = results.filter((r) => r.status === 'fail');
  const skipped = results.filter((r) => r.status === 'skip');
  const passed = results.filter((r) => r.status === 'ok');
  console.log(
    `RESUMEN: ${passed.length} ok · ${skipped.length} salteados · ${failed.length} fallados`,
  );
  if (failed.length > 0) {
    for (const f of failed) {
      console.log(`  FAIL ${f.name}: ${f.detail}`);
    }
  }
  console.log('='.repeat(72));

  // Apollo/websockets pueden dejar handles abiertos; salimos explícito.
  process.exit(failed.length > 0 ? 1 : 0);
};

await main();
