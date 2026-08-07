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

import { readSecrets } from '../witnesses/secrets.js';

import {
  bootstrapCredential,
  bootstrapOrg,
  closeBackend,
  createBackend,
  fatal,
  hexArgOrRandom,
  parseArgs,
  printMode,
  printTx,
} from './common.js';

const args = parseArgs();
const backend = await createBackend(args);
printMode(backend);

// Resolve the org: --org flag > local secrets store > random (simulator).
const orgFlag = args.flags.get('org');
let orgId = typeof orgFlag === 'string' ? orgFlag : undefined;
if (orgId === undefined && backend.mode === 'network') {
  orgId = readSecrets()?.orgId;
  if (orgId === undefined) {
    fatal('no credential in the local store — run issue-credential first, or pass --org');
  }
}
orgId = hexArgOrRandom(orgId, 'orgId');

if (backend.mode === 'simulator') {
  await bootstrapOrg(backend, orgId, hexArgOrRandom(undefined, 'anchor'));
  await bootstrapCredential(backend, orgId);
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
