/**
 * B4.1 — CLI: register an organization.
 *
 *   node dist/scripts/register-org.js [orgId] [issuerSecret] [--network]
 *
 * `orgId`/`issuerSecret` are 64-hex. `orgId` is random when omitted; the
 * issuer secret defaults to the deterministic demo one for that org, so
 * `issue-credential` can rederive it. The published anchor is its commitment
 * — keep the secret, or the org can never issue anything.
 * Simulator by default; `--network` goes against the active network.
 */
import '../config/init.js';

import {
  closeBackend,
  createBackend,
  bootstrapIssuerSecret,
  hexArgOrRandom,
  parseArgs,
  printMode,
  printTx,
} from './common.js';

const args = parseArgs();
const orgId = hexArgOrRandom(args.positional[0], 'orgId');
const issuerSecret = args.positional[1] ?? bootstrapIssuerSecret(orgId);

const backend = await createBackend(args);
printMode(backend);

console.log(`orgId    : ${orgId}`);
console.log('issuer   : (derived locally, kept out of the transcript)');

const tx = await backend.api.registerOrganization({ orgId, issuerSecret });
printTx(tx);
console.log('result   : organization registered');

await closeBackend(backend);
