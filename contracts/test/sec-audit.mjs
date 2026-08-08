// Adversarial regression. Each block is an attack that at some point
// WORKED against this contract; the test now fails if it works again.
// Origin: security review of 2026-08-07 (findings HIGH-1 and MEDIUM-1).

import {
  pureCircuits, newWorld, b32, hex, check, checkRejects, summary, EPOCH,
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

console.log('\n=== D. The secret grants authorship — which is why it no longer travels ===');
// This block used to document a limitation: the §3.2 export carried
// {secret, evidenceHash}, so the prosecutor learned the secret and could act
// as the author. `proveAuthorship` (§4.4) removed the secret from the export.
// What is asserted here is the property that replaced it — and, at the end,
// the reason the secret must stay home, which has not changed at all.
secrets.ev = b32(0x33); // back to the original report's evidence
const reportId = pureCircuits.reportIdOf(b32(0x33), sec);
const prosecutor2 = b32(0x99);

const fingerprint = () => [
  m.state().organizations.size(),
  m.state().reports.size(),
  m.state().nullifiers.size(),
  m.state().authorships.size(),
  m.state().credentials.root().field,
].join('|');

// D1 — the proof the whistleblower exports instead of the secret.
const before = fingerprint();
const proved = m.call('proveAuthorship', reportId, b32(0x33), prosecutor2).result;
check('proveAuthorship returns authorshipOf(secret, reportId, prosecutorPk)',
  hex(proved) === hex(pureCircuits.authorshipOf(sec, reportId, prosecutor2)));
check('and it writes NOTHING to the ledger — the proof is portable, not a tx',
  fingerprint() === before);

// The two constraints inside it, each with its own failure.
const foreignSecret = { ...witnesses, personalSecret: (c) => [c.privateState, b32(0xde)] };
checkRejects('a foreign secret cannot produce the proof',
  () => m.callAs(foreignSecret, 'proveAuthorship', reportId, b32(0x33), prosecutor2),
  'not the author');
checkRejects('nor can a proof be produced over a report that was never sealed',
  () => m.call('proveAuthorship', pureCircuits.reportIdOf(b32(0x7a), sec), b32(0x7a), prosecutor2),
  'report does not exist');

// D2 — THE PROPERTY. Everything the v2 export carries is public: reportId,
// evidenceHash, prosecutorPk, authorshipHash, the proof. Hold all of it and
// you still cannot act as the author, because `revealAuthorship` needs the
// secret as a witness and the secret is not in the file.
const holdsTheExport = {
  credentialSecret: (c) => [c.privateState, b32(0)],
  credentialPath: (c) => [c.privateState, []],
  evidenceHash: (c) => [c.privateState, b32(0x33)], // in the export
  personalSecret: (c) => [c.privateState, b32(0xde)], // NOT in the export
};
checkRejects('holding the whole export does NOT let you republish the authorship',
  () => m.callAs(holdsTheExport, 'revealAuthorship', reportId, b32(0x88)),
  'not the author');
check('and the slot the real author would use is still free',
  !m.state().authorships.member(pureCircuits.authorshipOf(sec, reportId, b32(0x88))));

// D3 — and the reason that matters: the secret itself is still omnipotent.
// Nothing here was weakened. The whole defence is that it stays on one machine.
const holdsTheSecret = { ...holdsTheExport, personalSecret: (c) => [c.privateState, sec] };
m.callAs(holdsTheSecret, 'revealAuthorship', reportId, prosecutor2);
checkRejects('WITH the secret, the (report, prosecutor2) slot can still be burned',
  () => m.call('revealAuthorship', reportId, prosecutor2),
  'authorship already revealed to this prosecutor');
console.log('  -> The export is safe to hand over; the secrets file is not. That is the line.');

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
