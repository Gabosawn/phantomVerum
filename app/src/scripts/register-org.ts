/**
 * B4.1 — CLI: register an organization.
 *
 *   node dist/scripts/register-org.js [orgId] [anchor] [--network]
 *
 * `orgId`/`anchor` are 64-hex; random ones are generated when omitted (mock
 * issuer: the contract has no access control, as declared in the README).
 * Simulator by default; `--network` goes against the active network.
 */
import '../config/init.js';

import {
  closeBackend,
  createBackend,
  hexArgOrRandom,
  parseArgs,
  printMode,
  printTx,
} from './common.js';

const args = parseArgs();
const orgId = hexArgOrRandom(args.positional[0], 'orgId');
const anchor = hexArgOrRandom(args.positional[1], 'anchor');

const backend = await createBackend(args);
printMode(backend);

console.log(`orgId    : ${orgId}`);
console.log(`anchor   : ${anchor}`);

const tx = await backend.api.registerOrganization({ orgId, anchor });
printTx(tx);
console.log('result   : organization registered');

await closeBackend(backend);
