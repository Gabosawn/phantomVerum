/**
 * B4.2 — CLI: issue a credential (client half + issuer half).
 *
 *   node dist/scripts/issue-credential.js [orgId] [--network]
 *
 * The client generates the `credentialSecret` locally and only the
 * COMMITMENT is handed to the issuer (H-4). In simulator mode the
 * organization is registered first so the script runs with zero
 * infrastructure; on the network the org must already exist.
 */
import '../config/init.js';

import {
  bootstrapOrg,
  closeBackend,
  createBackend,
  hexArgOrRandom,
  parseArgs,
  printMode,
  printTx,
} from './common.js';

const args = parseArgs();
const orgId = hexArgOrRandom(args.positional[0], 'orgId');

const backend = await createBackend(args);
printMode(backend);

if (backend.mode === 'simulator') {
  await bootstrapOrg(backend, orgId, hexArgOrRandom(undefined, 'anchor'));
}

const credential = await backend.api.prepareLocalCredential(orgId);
console.log(`orgId      : ${credential.orgId}`);
console.log(`commitment : ${credential.credCommitment}  <- the ONLY thing the issuer sees`);
console.log('secret     : (stored locally, never shown, never sent)');

const issued = await backend.api.issueCredential({
  orgId,
  credCommitment: credential.credCommitment,
});
printTx(issued.tx);
console.log(`leafIndex  : ${issued.leafIndex}`);
console.log('result     : credential issued into the global tree');

await closeBackend(backend);
