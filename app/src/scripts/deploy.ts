/**
 * B5.1 — CLI: deploy the contract and record `deployment.json`.
 *
 *   node dist/scripts/deploy.js [--force]
 *
 * Deploys `testigo.compact` against the ACTIVE network (`NETWORK=local` or
 * `NETWORK=preview`) and writes the single source of the address,
 * `app/src/config/deployment.json` (docs/03 §3.2, docs/05).
 *
 * This is the one script that always runs against a real chain: there is no
 * `--network` toggle and no simulator path — deploying "to the simulator"
 * means nothing. Selection is `NETWORK=` alone (validated at import by
 * `config/init.js`, which throws on an unknown value BEFORE anything is sent).
 *
 * Requirements (see docs/05 §2–§4):
 *   · The contract compiled WITH proving keys (`npm run compile`, not
 *     `compile:fast`): the deploy proves, so `createProviders` →
 *     `assertZkArtifacts()` fails without `contracts/output/keys/`.
 *   · `DEPLOY_SEED` in `.env`, funded — via the Preview faucet, or, on local,
 *     the devnet's genesis-funded seed (local has no faucet: docs/05 §3.2).
 *
 * Idempotence: refuses to overwrite an existing `deployment.json` unless
 * `--force`, so a stray re-run never silently replaces a good address.
 */
import '../config/init.js';

import { deployContract } from '../api/testigo.js';
import { currentNetwork } from '../config/init.js';
import { describeNetwork } from '../config/networks.js';
import {
  clearDeployment,
  deploymentFilePath,
  readCompilerVersion,
  readDeployment,
  writeDeployment,
} from '../config/deployment.js';

import { parseArgs } from './common.js';

const args = parseArgs();
const force = args.flags.has('force');

const network = currentNetwork();
console.log('=== deploy ===');
console.log(describeNetwork(network));

// Guard: never clobber an existing deploy by accident. `deployment.json` holds
// exactly one deploy; overwriting it strands the previous contract.
const existing = await readDeployment();
if (existing !== null && !force) {
  console.error(
    `\nrefusing to overwrite an existing deploy in ${deploymentFilePath()}:\n` +
      `  network         : ${existing.network}\n` +
      `  contractAddress : ${existing.contractAddress}\n` +
      `  deployedAt      : ${existing.deployedAt}\n` +
      'Re-run with --force to replace it (the old contract stays on-chain, ' +
      'only this pointer changes).',
  );
  process.exit(1);
}
if (existing !== null && force) {
  await clearDeployment();
  console.log('\n(--force) previous deployment.json cleared');
}

// The compiler version is read from the artifacts that generated the keys, so
// the record reflects what was ACTUALLY deployed — not a hardcoded guess.
const compilerVersion = await readCompilerVersion();
console.log(`compiler       : ${compilerVersion}`);

console.log('\ndeploying (waiting for funds, proving the genesis tx)…');
// `waitForFunds: true` — the deploy is the one step that must block until the
// wallet is funded (faucet on Preview; pre-funded genesis seed on local).
const deployed = await deployContract({ waitForFunds: true });

// `writeDeployment` needs a concrete txId. If the executor did not report one
// the deploy did not really land — fail loudly instead of recording a hole.
if (deployed.deployTxId === undefined) {
  console.error(
    'deploy returned no txId — the transaction did not confirm. ' +
      'deployment.json was NOT written.',
  );
  await deployed.api.close();
  process.exit(1);
}

const { path, record } = await writeDeployment({
  network: network.name,
  contractAddress: deployed.contractAddress,
  deployTxId: deployed.deployTxId,
  compilerVersion,
});

console.log('\n=== deployed ===');
console.log(`contractAddress : ${record.contractAddress}`);
console.log(`deployTxId      : ${record.deployTxId}`);
console.log(`deployedAt      : ${record.deployedAt}`);
console.log(`recorded in     : ${path}`);
console.log(
  '\nnext: NETWORK=' + network.name + ' npm run e2e --workspace=app -- --network',
);

await deployed.api.close();
process.exit(0);
