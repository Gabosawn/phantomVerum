/**
 * B4.1 — CLI: register an organization.
 *
 *   node dist/scripts/register-org.js [issuerSecret] [--network]
 *
 * The ONLY input is the issuer secret, and it is optional: omitted, a random
 * one is generated. The orgId is not an input at all — since the H-2 fix it is
 * `orgIdOf(issuerSecret)`, asserted in-circuit, so an id nobody can derive is
 * an id nobody can squat. `registerOrganization` used to take an arbitrary
 * orgId first-come on an immutable contract, which let anyone deny a real
 * organization its label permanently.
 *
 * The secret is saved to the local issuer keystore, where `issue-credential`
 * reads it back (C-1 fix — it used to be derived from the PUBLIC orgId, so
 * anyone could recompute it: see `issuer-keystore.ts`). Keep that keystore, or
 * the org can never issue anything: the anchor on-chain is immutable.
 *
 * Simulator by default; `--network` goes against the active network.
 */
import '../config/init.js';

import { type Hex32, toHex, randomBytes32 } from '../witnesses/hex.js';
import { organizationId } from '../witnesses/index.js';

import {
  closeBackend,
  createBackend,
  parseArgs,
  printMode,
  printTx,
  requireHexArg,
} from './common.js';
import { saveIssuerSecret } from './issuer-keystore.js';

const args = parseArgs();

// The backend is created FIRST: in simulator mode it redirects the issuer
// keystore to a throwaway directory, and everything below writes to whichever
// store is active at the moment it runs.
const backend = await createBackend(args);
printMode(backend);

const issuerSecret: Hex32 =
  args.positional[0] === undefined
    ? toHex(randomBytes32())
    : requireHexArg(args.positional[0], 'issuerSecret');

// Derived, not chosen — and persisted before the call, so a transaction that
// succeeds can never leave an org whose key was never written down.
const orgId = toHex(organizationId(issuerSecret));
saveIssuerSecret(orgId, issuerSecret);

console.log(`orgId    : ${orgId}  <- derived from the issuer secret`);
console.log('issuer   : (random, saved to the local keystore, never on-chain)');

const tx = await backend.api.registerOrganization({ issuerSecret });
printTx(tx);
console.log('result   : organization registered');

await closeBackend(backend);
