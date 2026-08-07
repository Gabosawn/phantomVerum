// The 4 acts of the demo (docs/01-arquitectura.md §2), end to end, against
// the REAL COMPILED contract in the local simulator. No network, no proof
// server. It is the same path app/ will walk in B3.

import {
  pureCircuits, newWorld, b32, hex, check, checkRejects, summary, EPOCH,
} from './harness.mjs';

const orgId = b32(0x11);
const anchor = b32(0xaa);
const credSecret = b32(0x22);
const personalSecret = b32(0x44);
const evidenceHash = b32(0x33);
const prosecutorPk = b32(0x66);
const employerPk = b32(0x77);

const credComm = pureCircuits.credCommitmentOf(credSecret);
const leaf = pureCircuits.leafOf(orgId, credComm);

// The real witness set that will live in app/src/witnesses/index.ts (B2.3).
const witnesses = {
  credentialSecret: (c) => [c.privateState, credSecret],
  personalSecret: (c) => [c.privateState, personalSecret],
  evidenceHash: (c) => [c.privateState, evidenceHash],
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
check('the path has 8 siblings', path?.path.length === 8, `len=${path?.path.length}`);
check('findPathForLeaf of a foreign leaf -> undefined',
  m.state().credentials.findPathForLeaf(b32(0x99)) === undefined);

console.log('\n=== T2. Report (uses the credentialPath witness) ===');
m.call('report', orgId, EPOCH);
const reportId = pureCircuits.reportIdOf(evidenceHash, personalSecret);
const nullifier = pureCircuits.nullifierOf(credSecret, orgId, EPOCH);
console.log(`  reportId  = ${hex(reportId)}`);
console.log(`  nullifier = ${hex(nullifier)}`);
check('the report got sealed', m.state().reports.member(reportId));
check('the nullifier got burned', m.state().nullifiers.member(nullifier));

console.log('\n=== T3. Evidence cannot be altered nor re-reported ===');
checkRejects('re-report within the same epoch',
  () => m.call('report', orgId, EPOCH), 'already reported this period');

console.log('\n=== T4. Deferred authorship, bound to the prosecutor ===');
m.call('revealAuthorship', reportId, prosecutorPk);
const authorshipHash = pureCircuits.authorshipOf(personalSecret, reportId, prosecutorPk);
console.log(`  authorshipHash = ${hex(authorshipHash)}`);
check('the authorship got recorded', m.state().authorships.member(authorshipHash));

checkRejects('a foreign secret cannot claim the authorship',
  () => m.callAs({ ...witnesses, personalSecret: (c) => [c.privateState, b32(0x99)] },
    'revealAuthorship', reportId, prosecutorPk),
  'not the author');

console.log('\n--- The video moment: same report, two verifiers ---');
const employerHash = pureCircuits.authorshipOf(personalSecret, reportId, employerPk);
check('PROSECUTOR -> the authorship verifies', m.state().authorships.member(authorshipHash));
check('EMPLOYER   -> does not verify', !m.state().authorships.member(employerHash));

summary('merkle-roundtrip');
