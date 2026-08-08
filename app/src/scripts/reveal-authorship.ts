/**
 * B4.4 — CLI: reveal a report's authorship to a designated prosecutor.
 *
 *   node dist/scripts/reveal-authorship.js [reportId] [prosecutorNonce] [--network]
 *
 * Publishes `receiptOf(reportId, prosecutorNonce)` — bound to the nonce THAT
 * prosecutor generated and sent over. The secret stays home: it is not in
 * the hash preimage, so there is nothing to hand across.
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
  bootstrapIssuerSecret,
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

const prosecutorNonce = hexArgOrRandom(args.positional[1], 'prosecutorNonce');
let reportId = args.positional[0];

if (backend.mode === 'simulator' && reportId === undefined) {
  // H-2: the orgId is no longer picked, it is whatever the fresh issuer secret
  // derives — `bootstrapOrg` mints the secret and hands the id back.
  const orgId = await bootstrapOrg(backend);
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
console.log(`nonce        : ${prosecutorNonce}  <- the prosecutor's, never ours`);

const result = await backend.api.revealAuthorship({ reportId, prosecutorNonce });
printTx(result.tx);
console.log(`receipt        : ${result.receipt}`);
console.log('result         : authorship published for this nonce only');

await closeBackend(backend);
