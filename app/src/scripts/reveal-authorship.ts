/**
 * B4.4 — CLI: reveal a report's authorship to a designated prosecutor.
 *
 *   node dist/scripts/reveal-authorship.js [reportId] [prosecutorPk] [--network]
 *
 * Publishes `authorshipOf(reportSecret, reportId, prosecutorPk)` — bound to
 * THAT prosecutor's key: shown to anyone else, the record proves nothing.
 *
 * Simulator mode runs the previous acts first (register, issue, report) and
 * reveals the authorship of the just-sealed report, so the script runs with
 * zero infrastructure. On the network, `reportId` defaults to the last
 * report in the local store.
 */
import '../config/init.js';

import { listReports } from '../witnesses/secrets.js';

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

const prosecutorPk = hexArgOrRandom(args.positional[1], 'prosecutorPk');
let reportId = args.positional[0];

if (backend.mode === 'simulator' && reportId === undefined) {
  const orgId = hexArgOrRandom(undefined, 'orgId');
  await bootstrapOrg(backend, orgId, hexArgOrRandom(undefined, 'anchor'));
  await bootstrapCredential(backend, orgId);
  const sealed = await backend.api.report({
    orgId,
    period: backend.api.currentPeriod(),
    evidence: Buffer.from('demo evidence for reveal-authorship'),
  });
  console.log(`(setup)  : report ${sealed.reportId.slice(0, 16)}… sealed`);
  reportId = sealed.reportId;
}

if (reportId === undefined) {
  // Network mode without an explicit id: take the last local report.
  const known = listReports();
  reportId = known[known.length - 1];
  if (reportId === undefined) {
    fatal('no reports in the local store — run report first, or pass a reportId');
  }
}

console.log(`reportId     : ${reportId}`);
console.log(`prosecutorPk : ${prosecutorPk}`);

const result = await backend.api.revealAuthorship({ reportId, prosecutorPk });
printTx(result.tx);
console.log(`authorshipHash : ${result.authorshipHash}`);
console.log('result         : authorship published for this prosecutor only');

await closeBackend(backend);
