// The load-bearing properties of the Option A design, verified by executing
// the compiled contract. If any of these falls, the design does not hold.

import {
  pureCircuits, newWorld, b32, check, checkRejects, summary, EPOCH, EPOCH_DURATION, NOW,
} from './harness.mjs';

const orgA = b32(0x11);
const orgB = b32(0x88);
const credSecret = b32(0x22);
const sec = b32(0x44);
const ev = b32(0x33);

const credComm = pureCircuits.credCommitmentOf(credSecret);
const leafA = pureCircuits.leafOf(orgA, credComm);

// Mutable evidence: two distinct reports need distinct reportIds
// (otherwise the "report already sealed" idempotence guard trips).
const secrets = { ev };

const mkWitnesses = (pathOverride, wantedLeaf = leafA) => ({
  credentialSecret: (c) => [c.privateState, credSecret],
  personalSecret: (c) => [c.privateState, sec],
  evidenceHash: (c) => [c.privateState, secrets.ev],
  credentialPath: (c) => {
    if (pathOverride) return [c.privateState, pathOverride];
    const p = c.ledger.credentials.findPathForLeaf(wantedLeaf);
    if (p === undefined) throw new Error('no credential issued for this org');
    return [c.privateState, p.path];
  },
});

const m = newWorld(mkWitnesses());
m.call('registerOrganization', orgA, b32(0xaa));
m.call('registerOrganization', orgB, b32(0xbb));
m.call('issueCredential', orgA, credComm);

console.log('=== (1) The witness cannot lie about its organization ===');
// A real employee of A, with their real path, declaring orgId = B.
// The leaf is rebuilt in-circuit: leafOf(orgB, comm) != leafA -> another root.
checkRejects('employee of A reporting as an employee of B',
  () => m.call('report', orgB, EPOCH), 'credential does not belong to the organization');

console.log('\n=== (2) HistoricMerkleTree: an old path remains valid ===');
const oldPath = m.state().credentials.findPathForLeaf(leafA).path;
const oldRoot = m.state().credentials.root().field;
for (let i = 0; i < 3; i++) {
  m.call('issueCredential', orgA, b32(0xc0 + i));
}
const newRoot = m.state().credentials.root().field;
check('the root changed after 3 insertions', oldRoot !== newRoot);
check('firstFree == 4', m.state().credentials.firstFree() === 4n);
let ok = true;
try {
  m.callAs(mkWitnesses(oldPath), 'report', orgA, EPOCH);
} catch (e) {
  ok = false;
  console.log(`    (${String(e.message).split('\n')[0]})`);
}
check('a path issued BEFORE the insertions still proves membership', ok);

console.log('\n=== (3) No issued credential, no report ===');
check('findPathForLeaf of a nonexistent leaf -> undefined',
  m.state().credentials.findPathForLeaf(b32(0xfe)) === undefined);

console.log('\n=== (4) The epoch is fixed by blockTime, not by the caller ===');
const m2 = newWorld(mkWitnesses());
m2.call('registerOrganization', orgA, b32(0xaa));
m2.call('issueCredential', orgA, credComm);
checkRejects('future epoch', () => m2.call('report', orgA, EPOCH + 1n), 'period not started yet');
checkRejects('past epoch', () => m2.call('report', orgA, EPOCH - 1n), 'period already over');
let okEpoch = true;
try { m2.call('report', orgA, EPOCH); } catch { okEpoch = false; }
check('the current epoch IS accepted', okEpoch);

console.log('\n=== (5) Distinct epochs -> unlinkable nullifiers ===');
const n1 = pureCircuits.nullifierOf(credSecret, orgA, EPOCH);
const n2 = pureCircuits.nullifierOf(credSecret, orgA, EPOCH + 1n);
check('the nullifier changes from epoch to epoch', Buffer.compare(n1, n2) !== 0);
// Moving the clock one epoch forward, the same credential can report again
// (with DIFFERENT evidence: the same report twice is cut by the guard).
m2.at(NOW + Number(EPOCH_DURATION));
secrets.ev = b32(0x5a);
let okNext = true;
try { m2.call('report', orgA, EPOCH + 1n); } catch (e) {
  okNext = false;
  console.log(`    (${String(e.message).split('\n')[0]})`);
}
check('the next epoch enables a new report', okNext);

summary('security-claims');
