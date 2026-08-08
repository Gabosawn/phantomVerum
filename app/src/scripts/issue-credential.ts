/**
 * B4.2 — CLI: issue a credential (client half + issuer half).
 *
 *   node dist/scripts/issue-credential.js [orgId] [--network]
 *
 * The client generates the `credentialSecret` locally and only the
 * COMMITMENT is handed to the issuer (H-4). In simulator mode the
 * organization is minted first so the script runs with zero infrastructure; on
 * the network the org must already exist, `orgId` is required, and this machine
 * must hold that org's issuer key (see `issuer-keystore.ts`).
 */
import '../config/init.js';

import type { Hex32 } from '../witnesses/hex.js';

import {
  bootstrapOrg,
  closeBackend,
  createBackend,
  fatal,
  parseArgs,
  printMode,
  printTx,
  requireHexArg,
} from './common.js';
import { requireIssuerSecret } from './issuer-keystore.js';

const args = parseArgs();

const backend = await createBackend(args);
printMode(backend);

// H-2: an orgId is derived from its issuer secret, not chosen. On the simulator
// there is nothing to join, so the org is minted here and its id falls out of
// the secret. On the network the org already exists and its id must be given —
// and this machine must hold its key in the issuer keystore.
let orgId: Hex32;
if (backend.mode === 'simulator') {
  orgId = await bootstrapOrg(backend);
} else {
  if (args.positional[0] === undefined) {
    fatal('orgId is required with --network: pass the id `register-org` printed');
  }
  orgId = requireHexArg(args.positional[0], 'orgId');
}

const credential = await backend.api.prepareLocalCredential(orgId);
console.log(`orgId      : ${credential.orgId}`);
console.log(`commitment : ${credential.credCommitment}  <- the ONLY thing the issuer sees`);
console.log('secret     : (stored locally, never shown, never sent)');

// `requireIssuerSecret`, not `bootstrapIssuerSecret`: since the C-1 fix the
// secret is random and cannot be rederived, so a missing key is a real error.
// Minting a fresh one here would only fail later, inside the circuit, as an
// opaque "not the issuer of this organization". In simulator mode the
// `bootstrapOrg` above has just written it.
const issued = await backend.api.issueCredential({
  orgId,
  credCommitment: credential.credCommitment,
  issuerSecret: requireIssuerSecret(orgId),
});
printTx(issued.tx);
console.log(`leafIndex  : ${issued.leafIndex}`);
console.log('result     : credential issued into the global tree');

await closeBackend(backend);
