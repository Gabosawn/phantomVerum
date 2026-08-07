// Adversarial regression. Each block is an attack that at some point
// WORKED against this contract; the test now fails if it works again.
// Origin: security review of 2026-08-07 (findings HIGH-1 and MEDIUM-1).

import {
  pureCircuits, newWorld, b32, check, checkRejects, summary, EPOCH,
} from './harness.mjs';

const orgA = b32(0x11);
const orgB = b32(0xb0); // NEVER registered
const anchor = b32(0xaa);
const cred = b32(0x22);
const sec = b32(0x44);

const secrets = { ev: b32(0x33) };
const credComm = pureCircuits.credCommitmentOf(cred);
let wantedLeaf = pureCircuits.leafOf(orgA, credComm);

const witnesses = {
  credentialSecret: (c) => [c.privateState, cred],
  personalSecret: (c) => [c.privateState, sec],
  evidenceHash: (c) => [c.privateState, secrets.ev],
  credentialPath: (c) => {
    const p = c.ledger.credentials.findPathForLeaf(wantedLeaf);
    if (!p) throw new Error('no credential');
    return [c.privateState, p.path];
  },
};

const m = newWorld(witnesses);
m.call('registerOrganization', orgA, anchor);
m.call('issueCredential', orgA, credComm);
m.call('report', orgA, EPOCH);

console.log('=== A. What the public transcript of report exposes ===');
// Not an attack: it is the disclosure surface we declare in the README.
// Kept as executable documentation of what an observer sees.
const r = m.call('revealAuthorship', pureCircuits.reportIdOf(secrets.ev, sec), b32(0x66));
const dump = JSON.stringify(r.proofData, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
check('the transcript exists and is inspectable', dump.length > 0, `${dump.length} chars`);
console.log('  Public by design: orgId, epoch, reportId, nullifier, authorshipHash, Merkle root.');
console.log('  NEVER leaves: credentialSecret, personalSecret, the evidence file.');

console.log('\n=== B. [HIGH-1] The period CANNOT be chosen by the caller ===');
// Before: `period` was a free Bytes<32> -> the same credential produced N
// nullifiers by varying the label, and the anti-spam of spec §4.2 was
// worthless. Now the circuit binds it to blockTime.
let accepted = 0;
for (const delta of [1n, 2n, 3n]) {
  secrets.ev = b32(0x33 + Number(delta)); // different evidence -> another reportId
  try { m.call('report', orgA, EPOCH + delta); accepted++; } catch { /* expected */ }
}
check('no extra report gets in by changing the period', accepted === 0, `${accepted}/3 accepted`);
check('nullifiers.size stays at 1', m.state().nullifiers.size() === 1n,
  `size=${m.state().nullifiers.size()}`);

console.log('\n=== C. [MEDIUM-1] issueCredential binds the orgId to the leaf ===');
// Before: `issueCredential(orgId, leaf)` received the leaf precomputed, so
// the registered-organization assert was decorative: one passed a registered
// orgId and smuggled in the leaf of a phantom org.
check('orgB was never registered', !m.state().organizations.member(orgB));
const phantomLeaf = pureCircuits.leafOf(orgB, credComm);
m.call('issueCredential', orgA, credComm); // the attacker only controls the commitment
check('the tree does NOT contain a leaf for the phantom org',
  m.state().credentials.findPathForLeaf(phantomLeaf) === undefined);
checkRejects('issueCredential against an unregistered org',
  () => m.call('issueCredential', orgB, credComm), 'organization not registered');
wantedLeaf = phantomLeaf;
secrets.ev = b32(0x70);
checkRejects('reporting on behalf of the phantom org',
  () => m.call('report', orgB, EPOCH), 'no credential');
wantedLeaf = pureCircuits.leafOf(orgA, credComm);

console.log('\n=== D. [DECLARED] Whoever holds the key export acts as the author ===');
// The §3.2 export contains {secret, evidenceHash}: the prosecutor learns the
// secret. It is a DECLARED limitation of the MVP (roadmap: ZK proof to the
// prosecutor). This block documents the exact consequence so nobody is
// surprised.
secrets.ev = b32(0x33); // back to the original report's evidence
const reportId = pureCircuits.reportIdOf(b32(0x33), sec);
const prosecutor2 = b32(0x99);
const withTheExport = {
  credentialSecret: (c) => [c.privateState, b32(0)],
  credentialPath: (c) => [c.privateState, []],
  personalSecret: (c) => [c.privateState, sec],
  evidenceHash: (c) => [c.privateState, b32(0x33)],
};
let republished = true;
try { m.callAs(withTheExport, 'revealAuthorship', reportId, b32(0x88)); } catch { republished = false; }
check('KNOWN: with the export the authorship can be republished to another pk', republished);
m.callAs(withTheExport, 'revealAuthorship', reportId, prosecutor2);
checkRejects('KNOWN: and burn the (report, prosecutor2) slot of the real author',
  () => m.call('revealAuthorship', reportId, prosecutor2), 'authorship already revealed to this prosecutor');
console.log('  -> Current mitigation: the export is handed to ONE prosecutor, out of band.');
console.log('  -> Roadmap: ZK proof to the prosecutor instead of handing over the secret.');

console.log('\n=== E. The Merkle root changes with every insertion ===');
// An observer can use the revealed root as a synchronization counter.
// That is why the witness must ALWAYS use the path of the latest state.
const roots = [];
for (let i = 0; i < 4; i++) {
  m.call('issueCredential', orgA, b32(0xc0 + i));
  roots.push(m.state().credentials.root().field.toString());
}
check('4 insertions -> 4 distinct roots', new Set(roots).size === 4);
const hist = [...{ [Symbol.iterator]: () => m.state().credentials.history() }];
check('the history keeps the past roots', hist.length > 1, `history=${hist.length}`);
console.log('  -> Guidance for app/src/witnesses: NEVER cache the path; recompute it');
console.log('     with findPathForLeaf over the latest state before every report.');

summary('sec-audit');
