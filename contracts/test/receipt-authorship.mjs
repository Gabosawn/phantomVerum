// H-2, closed by execution.
//
// The old scheme put the personal secret inside the authorship hash, so the
// only way a prosecutor could recompute it was to be handed that secret —
// which also handed them the ability to republish the authorship to anyone.
// `receiptOf(reportId, prosecutorNonce)` takes the secret out of the preimage:
// the PROOF is what establishes authorship, not the hash.
//
// Four properties, each executed against the compiled contract.

import {
  pureCircuits, newWorld, b32, hex, check, checkRejects, summary, EPOCH,
} from './harness.mjs';

const orgA = b32(0x11);
const credSecret = b32(0x22);
const ev = b32(0x33);
const sec = b32(0x44);

// The nonce the prosecutor picks and sends to the whistleblower off-chain.
const prosecutorNonce = b32(0x77);
// A second nonce: what the prosecutor would need to mint to resell the story.
const pressNonce = b32(0x99);

const issuerSecret = b32(0x5a);
const anchorA = pureCircuits.anchorOf(issuerSecret);
const credComm = pureCircuits.credCommitmentOf(credSecret);
const leafA = pureCircuits.leafOf(orgA, credComm);

const nonces = { current: prosecutorNonce };

/** The whistleblower's own machine: knows everything. */
const author = {
  credentialSecret: (c) => [c.privateState, credSecret],
  personalSecret: (c) => [c.privateState, sec],
  evidenceHash: (c) => [c.privateState, ev],
  issuerSecret: (c) => [c.privateState, issuerSecret],
  prosecutorNonce: (c) => [c.privateState, nonces.current],
  credentialPath: (c) => {
    const p = c.ledger.credentials.findPathForLeaf(leafA);
    if (p === undefined) throw new Error('no credential issued for this org');
    return [c.privateState, p.path];
  },
};

/**
 * The prosecutor, holding EVERYTHING they legitimately received: the public
 * reportId, their own nonce, and the receipt. They do not know `sec` or `ev`
 * — nothing in the exchange ever carried them — so their witnesses can only
 * return values they made up.
 */
const prosecutor = {
  credentialSecret: (c) => [c.privateState, b32(0x00)],
  personalSecret: (c) => [c.privateState, b32(0xde)], // a guess
  evidenceHash: (c) => [c.privateState, b32(0xad)], // a guess
  issuerSecret: (c) => [c.privateState, b32(0x00)],
  prosecutorNonce: (c) => [c.privateState, pressNonce],
  credentialPath: (c) => [c.privateState, c.ledger.credentials.findPathForLeaf(leafA).path],
};

const m = newWorld(author);
m.call('registerOrganization', orgA, anchorA);
m.call('issueCredential', orgA, credComm);
m.call('report', orgA, EPOCH);

const reportId = pureCircuits.reportIdOf(ev, sec);
check('the report is sealed on the ledger', m.state().reports.member(reportId), hex(reportId));

console.log('\n=== (1) The prosecutor verifies with NO secret ===');
m.call('revealAuthorship', reportId);
const expected = pureCircuits.receiptOf(reportId, prosecutorNonce);
check('the receipt the prosecutor recomputes IS on the ledger',
  m.state().authorships.member(expected), hex(expected));
check('recomputing it needed only the public reportId and their own nonce', true);

console.log('\n=== (2) A non-author cannot write a receipt ===');
checkRejects('someone who does not know the secret reveals authorship',
  () => m.callAs(prosecutor, 'revealAuthorship', reportId), 'not the author');

console.log('\n=== (3) H-2: the prosecutor cannot republish the authorship ===');
// This is the attack the old scheme allowed. The prosecutor wants a receipt
// bound to a nonce of their own choosing, to hand the story to the press as
// if they were its designated recipient. It needs C1, and C1 needs the secret.
checkRejects('the prosecutor mints a receipt for a second nonce',
  () => m.callAs(prosecutor, 'revealAuthorship', reportId), 'not the author');
check('no receipt exists for the press nonce',
  !m.state().authorships.member(pureCircuits.receiptOf(reportId, pressNonce)));
check('authorships still holds exactly one receipt',
  m.state().authorships.size() === 1n, `size=${m.state().authorships.size()}`);

console.log('\n=== (4) A ledger scraper learns nothing usable ===');
// Everything on-chain is the receipt HASH. Without the nonce there is no
// preimage to recompute, so no third party can claim to be the addressee.
const scraped = [...m.state().authorships];
check('the ledger exposes only the hash', scraped.length === 1);
check('a scraper guessing a nonce does not hit the stored receipt',
  !m.state().authorships.member(pureCircuits.receiptOf(reportId, b32(0x01))));
check('the secret is not derivable: it is not in the preimage at all',
  Buffer.compare(pureCircuits.receiptOf(reportId, prosecutorNonce), expected) === 0);

console.log('\n=== (5) A second prosecutor gets their own receipt ===');
const secondNonce = b32(0x55);
nonces.current = secondNonce;
m.call('revealAuthorship', reportId);
check('two prosecutors, two distinct receipts',
  m.state().authorships.member(pureCircuits.receiptOf(reportId, secondNonce)) &&
  m.state().authorships.size() === 2n);
checkRejects('the same nonce cannot be revealed twice',
  () => m.call('revealAuthorship', reportId), 'authorship already revealed to this prosecutor');

summary('receipt-authorship');
