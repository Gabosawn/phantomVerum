/**
 * B4.3 — CLI: seal a report.
 *
 *   node dist/scripts/report.js [evidence-file] [--org <hex64>] [--network]
 *
 * The evidence is hashed LOCALLY (streamed, so a big PDF is fine); the file
 * never leaves the machine. Without an evidence file, a small demo payload
 * is used. The period is always the current epoch — the contract rejects
 * anything else (C0).
 *
 * Simulator mode bootstraps org + credential first, so the script runs with
 * zero infrastructure. On the network the credential must already be issued
 * (`issue-credential`) and the orgId is read from the local secrets store.
 */
import '../config/init.js';

import type { Hex32 } from '../witnesses/hex.js';
import { readSecrets } from '../witnesses/secrets.js';

import {
  bootstrapCredential,
  bootstrapOrg,
  closeBackend,
  createBackend,
  fatal,
  parseArgs,
  printMode,
  printTx,
  requireHexArg,
} from './common.js';

const args = parseArgs();
const backend = await createBackend(args);
printMode(backend);

// Resolve the org: --org flag > local secrets store (network), or a freshly
// minted org (simulator).
//
// H-2: an orgId is no longer a label the caller picks — it is `orgIdOf` of the
// issuer secret. So the simulator can no longer claim a random one: it mints an
// org, secret first, and takes whatever id that derives. `--org` is therefore
// meaningless here, because this process does not hold that org's secret.
const orgFlag = args.flags.get('org');
let orgId: Hex32;

if (backend.mode === 'simulator') {
  if (typeof orgFlag === 'string') {
    fatal('--org does not apply on the simulator: the org is minted here, and its id is derived from the issuer secret this run generates');
  }
  orgId = await bootstrapOrg(backend);
  await bootstrapCredential(backend, orgId);
} else {
  const fromStore = typeof orgFlag === 'string' ? orgFlag : readSecrets()?.orgId;
  if (fromStore === undefined) {
    fatal('no credential in the local store — run issue-credential first, or pass --org');
  }
  orgId = requireHexArg(fromStore, 'orgId');
}

const evidenceFile = args.positional[0];
const evidence =
  evidenceFile !== undefined
    ? { filePath: evidenceFile }
    : Buffer.from(`demo evidence — ${new Date().toISOString()}`);
console.log(
  evidenceFile !== undefined
    ? `evidence : ${evidenceFile} (hashed locally, never uploaded)`
    : 'evidence : (inline demo payload — pass a file path to hash a real one)',
);

const period = backend.api.currentPeriod();
console.log(`orgId    : ${orgId}`);
console.log(`period   : ${period} (current epoch)`);

const result = await backend.api.report({ orgId, period, evidence });
printTx(result.tx);
console.log(`reportId     : ${result.reportId}`);
console.log(`nullifier    : ${result.nullifier}`);
console.log(`evidenceHash : ${result.evidenceHash}`);
console.log('reportSecret : (persisted in the local store BEFORE the tx — needed to reveal authorship)');
console.log('result       : report sealed on the ledger');

await closeBackend(backend);
