// The 4 acts of the demo (docs/01-arquitectura.md §2), end to end, against
// the REAL COMPILED contract in the local simulator. No network, no proof
// server. It is the same path app/ will walk in B3.

import {
  pureCircuits, newWorld, b32, hex, check, checkRejects, summary, EPOCH,
} from './harness.mjs';

const orgId = b32(0x11);
const issuerSecret = b32(0x55);
const anchor = pureCircuits.anchorOf(issuerSecret);
const credSecret = b32(0x22);
const personalSecret = b32(0x44);
const evidenceHash = b32(0x33);
// Nonces the prosecutor / the employer would each pick for their own reveal.
const prosecutorNonce = b32(0x66);
const employerNonce = b32(0x77);

const credComm = pureCircuits.credCommitmentOf(credSecret);
const leaf = pureCircuits.leafOf(orgId, credComm);

const nonces = { current: prosecutorNonce };

// The real witness set that lives in app/src/witnesses/index.ts.
const witnesses = {
  credentialSecret: (c) => [c.privateState, credSecret],
  personalSecret: (c) => [c.privateState, personalSecret],
  evidenceHash: (c) => [c.privateState, evidenceHash],
  issuerSecret: (c) => [c.privateState, issuerSecret],
  prosecutorNonce: (c) => [c.privateState, nonces.current],
  credentialPath: (c) => {
    const path = c.ledger.credentials.findPathForLeaf(leaf);
    if (path === undefined) throw new Error('no credential issued for this org');
    return [c.privateState, path.path];
  },
};

const m = newWorld(witnesses);

console.log('=== T1. The org registers and issues a credential ===');
m.call('registerOrganization', orgId, anchor);
check('organizations.size == 1', m.state().organizations.size() === 1n);
console.log(`  credCommitment = ${hex(credComm)}`);
console.log(`  leaf           = ${hex(leaf)}`);
// The issuer sends the COMMITMENT; the contract builds the leaf in-circuit.
m.call('issueCredential', orgId, credComm);
check('credentials.firstFree == 1', m.state().credentials.firstFree() === 1n);

const path = m.state().credentials.findPathForLeaf(leaf);
check('findPathForLeaf finds the leaf built in-circuit', path !== undefined);
check('the path has 16 siblings', path?.path.length === 16, `len=${path?.path.length}`);
check('findPathForLeaf of a foreign leaf -> undefined',
  m.state().credentials.findPathForLeaf(b32(0x99)) === undefined);

console.log('\n=== T2. Report (uses the credentialPath witness) ===');
m.call('report', orgId, EPOCH);
const reportId = pureCircuits.reportIdOf(evidenceHash, personalSecret);
const nullifier = pureCircuits.nullifierOf(credSecret, EPOCH);
console.log(`  reportId  = ${hex(reportId)}`);
console.log(`  nullifier = ${hex(nullifier)}`);
check('the report got sealed', m.state().reports.member(reportId));
check('the nullifier got burned', m.state().nullifiers.member(nullifier));

console.log('\n=== T3. Evidence cannot be altered nor re-reported ===');
checkRejects('re-report within the same epoch',
  () => m.call('report', orgId, EPOCH), 'already reported this period');

console.log('\n=== T4. Deferred authorship, bound to the prosecutor\'s nonce ===');
m.call('revealAuthorship', reportId);
// The prosecutor recomputes this from the public reportId and their own
// nonce. Nothing secret was ever handed to them.
const receipt = pureCircuits.receiptOf(reportId, prosecutorNonce);
console.log(`  receipt = ${hex(receipt)}`);
check('the authorship got recorded', m.state().authorships.member(receipt));

checkRejects('a foreign secret cannot claim the authorship',
  () => m.callAs({ ...witnesses, personalSecret: (c) => [c.privateState, b32(0x99)] },
    'revealAuthorship', reportId),
  'not the author');

console.log('\n--- The video moment: same report, two verifiers ---');
const employerReceipt = pureCircuits.receiptOf(reportId, employerNonce);
check('PROSECUTOR -> the authorship verifies', m.state().authorships.member(receipt));
check('EMPLOYER   -> does not verify', !m.state().authorships.member(employerReceipt));

summary('merkle-roundtrip');
