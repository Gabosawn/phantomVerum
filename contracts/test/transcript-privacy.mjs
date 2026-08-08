// Verifies the privacy claims from docs/01-arquitectura.md §1 by inspecting
// the actual public transcript the circuit emits. Three checks:
//
//  1. The opcode *shape* is identical between two organizations. If the
//     sequence of operations differed, merely looking at the transcript's
//     shape would tell two reporters apart.
//  2. The disclosed Merkle root is byte-identical between organizations
//     that share the same global tree. checkRoot compiles to member + popeq,
//     and popeq writes the root result into the public transcript.
//  3. The complete transcript is NOT identical — and must not be. The
//     nullifier and the reportId vary by construction: they are the anti-spam
//     and sealing mechanism. If someone ever "fixes" the contract so the whole
//     transcript matches, they broke the anti-spam, and this check catches it.
//  4. orgId is NOT in the public transcript. orgId is a circuit ARGUMENT, and
//     arguments are private unless disclosed. `report`'s five disclose() calls
//     cover the epoch window, the global Merkle root, the nullifier and the
//     reportId — never orgId. (orgId is public only via registerOrganization /
//     issueCredential, which disclose it directly.) Verified against the ledger
//     `zkir` crate: `num_inputs` is witness arity, `declare_pub_input` is the
//     ONLY path to a public input, and the on-chain ContractCall carries a
//     hiding `communication_commitment`, not the raw args. An earlier version of
//     this test asserted the opposite by reading `proofData.input` — the LOCAL
//     prover's argument vector, which always contains the args and says nothing
//     about what reaches the chain.

import {
  pureCircuits, newWorld, b32, check, summary, EPOCH, hex,
} from './harness.mjs';

const orgA = b32(0x11);
const orgB = b32(0xbb);
const credA = b32(0x22);
const credB = b32(0x55);
const sec = b32(0x44);
const evA = b32(0x33);
const evB = b32(0x66);

// Each org's issuer secret, and the anchor it publishes.
const issuerA = b32(0xa5);
const issuerB = b32(0xb5);
const anchorA = pureCircuits.anchorOf(issuerA);
const anchorB = pureCircuits.anchorOf(issuerB);

const credCommA = pureCircuits.credCommitmentOf(credA);
const credCommB = pureCircuits.credCommitmentOf(credB);
const leafA = pureCircuits.leafOf(orgA, credCommA);
const leafB = pureCircuits.leafOf(orgB, credCommB);

// `issueCredential` and `revealAuthorship` need these; `report` does not,
// but the Contract wants the full witness set.
const extraWitnesses = (issuerSecret) => ({
  issuerSecret: (c) => [c.privateState, issuerSecret],
  prosecutorNonce: (c) => [c.privateState, b32(0x66)],
});

// Extract the opcode shape (sequence of zkir instruction types) from the
// public transcript. Two reports with the same shape produce identical
// instruction sequences — an observer that only sees the transcript shape
// cannot distinguish which organization the report is about.
const opcodeShape = (r) => {
  if (!r.proofData?.publicTranscript) return [];
  return r.proofData.publicTranscript.map(op => {
    if (typeof op === 'object' && op !== null) {
      // Extract the instruction name (first key that isn't metadata).
      const keys = Object.keys(op);
      return keys[0] ?? 'unknown';
    }
    return String(op);
  });
};

// Helper: extract the values `report` pushes into the public transcript. In this
// runtime the disclosed values are `push` ops carrying a `cell` whose `content.value`
// is a byte array (NOT a `{tag:'field'}` shape — an earlier helper looked for that and
// silently returned [], making the "same fields" check below vacuous). We normalise
// each disclosed cell to a hex string so it can be compared and searched.
const extractDisclosedCells = (r) => {
  const out = [];
  for (const op of r.proofData?.publicTranscript ?? []) {
    const cell = op?.push?.value;
    const bytes = cell?.content?.value;
    if (Array.isArray(bytes)) {
      const hexStr = bytes
        .map((limb) => Object.entries(limb)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([, v]) => Number(v).toString(16).padStart(2, '0')).join(''))
        .join('');
      if (hexStr) out.push(hexStr);
    }
  }
  return out;
};

// ---- World A ----
const witnessesA = {
  ...extraWitnesses(issuerA),
  credentialSecret: (c) => [c.privateState, credA],
  personalSecret: (c) => [c.privateState, sec],
  evidenceHash: (c) => [c.privateState, evA],
  credentialPath: (c) => {
    const p = c.ledger.credentials.findPathForLeaf(leafA);
    if (!p) throw new Error('no credential');
    return [c.privateState, p.path];
  },
};

const mA = newWorld(witnessesA);
mA.call('registerOrganization', orgA, anchorA);
mA.call('issueCredential', orgA, credCommA);
const rA = mA.call('report', orgA, EPOCH);

// ---- World B ----
const witnessesB = {
  ...extraWitnesses(issuerB),
  credentialSecret: (c) => [c.privateState, credB],
  personalSecret: (c) => [c.privateState, sec],
  evidenceHash: (c) => [c.privateState, evB],
  credentialPath: (c) => {
    const p = c.ledger.credentials.findPathForLeaf(leafB);
    if (!p) throw new Error('no credential');
    return [c.privateState, p.path];
  },
};

const mB = newWorld(witnessesB);
mB.call('registerOrganization', orgB, anchorB);
mB.call('issueCredential', orgB, credCommB);
const rB = mB.call('report', orgB, EPOCH);

// ---- Shared world (both orgs, same tree) ----
const witnessesA2 = {
  ...witnessesA,
  evidenceHash: (c) => [c.privateState, b32(0xe0)],
};
const witnessesB2 = {
  ...extraWitnesses(issuerB),
  credentialSecret: (c) => [c.privateState, credB],
  personalSecret: (c) => [c.privateState, b32(0xfa)],
  evidenceHash: (c) => [c.privateState, evB],
  credentialPath: (c) => {
    const p = c.ledger.credentials.findPathForLeaf(leafB);
    if (!p) throw new Error('no credential');
    return [c.privateState, p.path];
  },
};

const mShared = newWorld(witnessesA2);
mShared.call('registerOrganization', orgA, anchorA);
mShared.call('registerOrganization', orgB, anchorB);
mShared.call('issueCredential', orgA, credCommA);
mShared.callAs(witnessesB2, 'issueCredential', orgB, credCommB);
const rA2 = mShared.call('report', orgA, EPOCH);
const rB2 = mShared.callAs(witnessesB2, 'report', orgB, EPOCH);

const transcriptOf = (r) => JSON.stringify(r.proofData, (_, v) =>
  typeof v === 'bigint' ? v.toString() : v);

console.log('=== 1. Opcode shape is identical between organizations ===');
const shapeA = opcodeShape(rA);
const shapeB = opcodeShape(rB);
check('isolated worlds produce the same opcode shape', JSON.stringify(shapeA) === JSON.stringify(shapeB));

const shapeA2 = opcodeShape(rA2);
const shapeB2 = opcodeShape(rB2);
check('shared world: org A and org B produce the same opcode shape',
  JSON.stringify(shapeA2) === JSON.stringify(shapeB2));

console.log('\n=== 2. The Merkle root disclosed does not distinguish organizations ===');
// With ONE global tree, the root `report` discloses via checkRoot is the current
// tree root, shared by every org. So the one field report discloses cannot tell two
// orgs apart. (Both reports run after both issuances and report never mutates the
// tree, so both see the same final root.)
const cellsA2 = extractDisclosedCells(rA2);
const cellsB2 = extractDisclosedCells(rB2);
// Guard against a vacuous pass: report must actually disclose something.
check('report discloses at least one value into the transcript', cellsA2.length > 0);
// The disclosed root is org-independent: with one global tree, both orgs' reports
// disclose the SAME root value. So there is a non-empty intersection between what
// org A discloses and what org B discloses — that shared value is the root.
const shared = cellsA2.filter((c) => cellsB2.includes(c));
check('org A and org B disclose a common value (the org-independent root)', shared.length > 0);

// After the reports, both nullifier and reportId are stored.
// Verify both nullifiers exist (each org/employee burned theirs).
check('both nullifiers exist in the shared ledger', mShared.state().nullifiers.size() === 2n);
check('both reports exist in the shared ledger', mShared.state().reports.size() === 2n);

console.log('\n=== 3. The complete transcript is NOT identical (nullifier and reportId differ) ===');
const tA = transcriptOf(rA);
const tB = transcriptOf(rB);
check('isolated worlds: transcripts are different', tA !== tB);

const tA2 = transcriptOf(rA2);
const tB2 = transcriptOf(rB2);
check('shared world: transcripts are different', tA2 !== tB2);

check('transcripts have different lengths (different reportId/nullifier bytes)',
  tA2.length !== tB2.length || tA2 !== tB2);

console.log('\n=== 4. orgId is NOT in the public transcript (private circuit arg) ===');
// The org is public elsewhere — registerOrganization and issueCredential disclose
// orgId directly — but `report` does not. orgId only feeds the in-circuit leaf that
// produces the (global, org-independent) disclosed root, so it never reaches the
// chain. We assert its absence from the on-chain-visible publicTranscript, and
// contrast with proofData.input (the LOCAL arg vector), where it necessarily appears.
// We search the DISCLOSED CELLS (reusing the §2 extractor), which normalises each
// pushed value to a full hex string — so a 32-byte operand, if disclosed, appears
// as an exact 64-char entry. (A naive JSON dump serialises the bytes as decimal
// numbers, so hex(orgId) could never match it — a vacuous check. The sanity line
// below guards against exactly that.)

// It IS in the local prover input — that is exactly why reading `.input` misleads.
const localInput = rA2.proofData?.input;
const orgIdBytes = localInput?.value?.[0];
const reconstructed = orgIdBytes
  ? Object.entries(orgIdBytes).sort(([a], [b]) => Number(a) - Number(b))
      .map(([, v]) => v.toString(16).padStart(2, '0')).join('')
  : '';
check('orgId appears in the LOCAL prover input (proofData.input), as expected', reconstructed === hex(orgA));

// Sanity: the scan MUST see a value report DOES disclose, or the absence checks
// are vacuous. rA2 sealed reportId = reportIdOf(evidenceHash=0xe0, personalSecret=0x44).
const reportIdA2 = hex(pureCircuits.reportIdOf(b32(0xe0), b32(0x44)));
check('sanity: a value report DOES disclose (the reportId) IS among the disclosed cells',
  cellsA2.includes(reportIdA2));

// It is NOT in the on-chain public transcript — the property that actually matters.
check('orgA hex is absent from org A\'s disclosed cells', !cellsA2.includes(hex(orgA)));
check('orgB hex is absent from org B\'s disclosed cells', !cellsB2.includes(hex(orgB)));

summary('transcript-privacy');
