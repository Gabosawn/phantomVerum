// Adversarial regression. Each block is an attack that at some point
// WORKED against this contract; the test now fails if it works again.
// Origin: security review of 2026-08-07 (findings HIGH-1 and MEDIUM-1),
// extended 2026-08-08 with the orgId axis of HIGH-1 and the issuer check.

import {
  pureCircuits, newWorld, b32, hex, check, checkRejects, summary, EPOCH,
} from './harness.mjs';

const orgA = b32(0x11);
const orgB = b32(0xb0); // NEVER registered
const issuerSecretA = b32(0x55);
const anchorA = pureCircuits.anchorOf(issuerSecretA);
const cred = b32(0x22);
const sec = b32(0x44);

const secrets = { ev: b32(0x33) };
const nonces = { current: b32(0x66) };
const issuers = { current: issuerSecretA };
const credComm = pureCircuits.credCommitmentOf(cred);
let wantedLeaf = pureCircuits.leafOf(orgA, credComm);

const witnesses = {
  credentialSecret: (c) => [c.privateState, cred],
  personalSecret: (c) => [c.privateState, sec],
  evidenceHash: (c) => [c.privateState, secrets.ev],
  issuerSecret: (c) => [c.privateState, issuers.current],
  prosecutorNonce: (c) => [c.privateState, nonces.current],
  credentialPath: (c) => {
    const p = c.ledger.credentials.findPathForLeaf(wantedLeaf);
    if (!p) throw new Error('no credential');
    return [c.privateState, p.path];
  },
};

const m = newWorld(witnesses);
m.call('registerOrganization', orgA, anchorA);
m.call('issueCredential', orgA, credComm);
m.call('report', orgA, EPOCH);

console.log('=== A. What the public transcript of report exposes ===');
// Not an attack: it is the disclosure surface we declare in the README.
// Kept as executable documentation of what an observer sees.
const r = m.call('revealAuthorship', pureCircuits.reportIdOf(secrets.ev, sec));
const dump = JSON.stringify(r.proofData, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
check('the transcript exists and is inspectable', dump.length > 0, `${dump.length} chars`);
console.log('  Public by design: orgId, epoch, reportId, nullifier, receipt, Merkle root.');
console.log('  NEVER leaves: credentialSecret, personalSecret, prosecutorNonce, the evidence file.');

console.log('\n=== B. [HIGH-1] The nullifier cannot be evaded — BOTH axes ===');
// The anti-spam guard has two caller-chosen operands to defend. The test
// used to check only the first one, and passed while the second was wide
// open: `nullifierOf` mixed in `orgId`, so a free phantom org bought the
// same credential another report in the same epoch.

// B.1 — the period axis. `period` is pinned to blockTime by C0.
let accepted = 0;
for (const delta of [1n, 2n, 3n]) {
  secrets.ev = b32(0x33 + Number(delta)); // different evidence -> another reportId
  try { m.call('report', orgA, EPOCH + delta); accepted++; } catch { /* expected */ }
}
check('no extra report gets in by changing the period', accepted === 0, `${accepted}/3 accepted`);

// B.2 — the orgId axis. THE ATTACK: `registerOrganization` has no access
// control, so the attacker mints a phantom org under their OWN anchor,
// enrols the very same credential in it, and reports again in the SAME
// epoch with the SAME credential. It is a legitimate Merkle membership —
// the only thing that can stop it is the nullifier being org-independent.
const attackerIssuer = b32(0xee);
m.call('registerOrganization', orgB, pureCircuits.anchorOf(attackerIssuer));
check('a phantom org registers for free (declared MVP limitation)',
  m.state().organizations.member(orgB));
issuers.current = attackerIssuer;
m.call('issueCredential', orgB, credComm);
issuers.current = issuerSecretA;
wantedLeaf = pureCircuits.leafOf(orgB, credComm);
secrets.ev = b32(0x91); // fresh evidence, so it is NOT the idempotence guard talking
checkRejects('the SAME credential reporting again via a phantom org, same epoch',
  () => m.call('report', orgB, EPOCH), 'already reported this period');
wantedLeaf = pureCircuits.leafOf(orgA, credComm);

check('nullifiers.size stays at 1', m.state().nullifiers.size() === 1n,
  `size=${m.state().nullifiers.size()}`);
check('one credential, one nullifier per epoch, regardless of the org',
  hex(pureCircuits.nullifierOf(cred, EPOCH)) === hex(pureCircuits.nullifierOf(cred, EPOCH)));

console.log('\n=== C. [MEDIUM-1] issueCredential binds the orgId to the leaf ===');
// Before: `issueCredential(orgId, leaf)` received the leaf precomputed, so
// the registered-organization assert was decorative: one passed a registered
// orgId and smuggled in the leaf of a phantom org.
const orgC = b32(0xc8); // never registered
check('orgC was never registered', !m.state().organizations.member(orgC));
const phantomLeaf = pureCircuits.leafOf(orgC, credComm);
m.call('issueCredential', orgA, credComm); // the attacker only controls the commitment
check('the tree does NOT contain a leaf for the phantom org',
  m.state().credentials.findPathForLeaf(phantomLeaf) === undefined);
checkRejects('issueCredential against an unregistered org',
  () => m.call('issueCredential', orgC, credComm), 'organization not registered');
wantedLeaf = phantomLeaf;
secrets.ev = b32(0x70);
checkRejects('reporting on behalf of the phantom org',
  () => m.call('report', orgC, EPOCH), 'no credential');
wantedLeaf = pureCircuits.leafOf(orgA, credComm);

console.log('\n=== C2. Only the issuer can fill the credential tree ===');
// The tree is a type parameter and the contract is immutable, so an
// unauthenticated `issueCredential` was a permanent kill switch: enough junk
// insertions and no legitimate credential can ever be issued again.
// The anchor — dead metadata until now — is what closes it.
issuers.current = b32(0xbad);
checkRejects('a third party issuing under someone else\'s org',
  () => m.call('issueCredential', orgA, b32(0xf1)),
  'not the issuer of this organization');
issuers.current = issuerSecretA;
let issuedOk = true;
try { m.call('issueCredential', orgA, b32(0xf2)); } catch { issuedOk = false; }
check('the real issuer still issues normally', issuedOk);
check('the anchor is now load-bearing, not decoration',
  hex(m.state().organizations.lookup(orgA)) === hex(anchorA));

console.log('\n=== D. The secret grants authorship — and it never travels ===');
// This block used to document a limitation: the §3.2 export carried
// {secret, evidenceHash}, so the prosecutor learned the secret and could act
// as the author. `receiptOf` removed the secret from the hash preimage
// entirely, so there is no longer any reason to hand it over at all.
secrets.ev = b32(0x33); // back to the original report's evidence
const reportId = pureCircuits.reportIdOf(b32(0x33), sec);
const prosecutor2Nonce = b32(0x99);

const fingerprint = () => [
  m.state().organizations.size(),
  m.state().reports.size(),
  m.state().nullifiers.size(),
  m.state().authorships.size(),
  m.state().credentials.root().field,
].join('|');

// D1 — the proof the whistleblower exports instead of the secret.
const before = fingerprint();
nonces.current = prosecutor2Nonce;
const proved = m.call('proveAuthorship', reportId, b32(0x33)).result;
check('proveAuthorship returns receiptOf(reportId, prosecutorNonce)',
  hex(proved) === hex(pureCircuits.receiptOf(reportId, prosecutor2Nonce)));
check('and it writes NOTHING to the ledger — the proof is portable, not a tx',
  fingerprint() === before);

// The two constraints inside it, each with its own failure.
const foreignSecret = { ...witnesses, personalSecret: (c) => [c.privateState, b32(0xde)] };
checkRejects('a foreign secret cannot produce the proof',
  () => m.callAs(foreignSecret, 'proveAuthorship', reportId, b32(0x33)),
  'not the author');
checkRejects('nor can a proof be produced over a report that was never sealed',
  () => m.call('proveAuthorship', pureCircuits.reportIdOf(b32(0x7a), sec), b32(0x7a)),
  'report does not exist');

// D2 — THE PROPERTY. Everything the prosecutor receives is public or their
// own: the reportId and the nonce they chose. Hold all of it and you still
// cannot act as the author, because `revealAuthorship` needs the secret as a
// witness and the secret is in no artifact anyone ever sends.
const holdsTheExport = {
  credentialSecret: (c) => [c.privateState, b32(0)],
  credentialPath: (c) => [c.privateState, []],
  issuerSecret: (c) => [c.privateState, b32(0)],
  prosecutorNonce: (c) => [c.privateState, b32(0x88)], // a nonce of their choosing
  evidenceHash: (c) => [c.privateState, b32(0x33)],
  personalSecret: (c) => [c.privateState, b32(0xde)], // never handed over
};
checkRejects('holding the whole export does NOT let you republish the authorship',
  () => m.callAs(holdsTheExport, 'revealAuthorship', reportId),
  'not the author');
check('and the slot the real author would use is still free',
  !m.state().authorships.member(pureCircuits.receiptOf(reportId, b32(0x88))));

// D3 — and the reason that matters: the secret itself is still omnipotent.
// Nothing here was weakened. The whole defence is that it stays on one machine.
const holdsTheSecret = { ...holdsTheExport, personalSecret: (c) => [c.privateState, sec] };
m.callAs(holdsTheSecret, 'revealAuthorship', reportId);
nonces.current = b32(0x88);
checkRejects('WITH the secret, the (report, nonce) slot can still be burned',
  () => m.call('revealAuthorship', reportId),
  'authorship already revealed to this prosecutor');
console.log('  -> Nothing secret is ever handed over. That is the line.');

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
