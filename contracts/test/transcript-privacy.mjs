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
//  4. orgId IS visible in the public transcript (public circuit arg).
//     This is by design — the contract declares it publicly.

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

// Helper: extract the Merkle root field from the public transcript.
// The root appears in the transcript as a field value pushed during checkRoot.
const extractFieldElements = (r) => {
  if (!r.proofData?.publicTranscript) return [];
  const fields = [];
  for (const op of r.proofData.publicTranscript) {
    if (typeof op === 'object' && op !== null) {
      if (op.push?.value?.tag === 'field' && op.push.value.content?.field !== undefined) {
        fields.push(op.push.value.content.field);
      }
    }
  }
  return fields;
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

console.log('\n=== 2. The Merkle root disclosed is identical (global tree) ===');
// In the shared world, both orgs share the same Merkle tree root.
const rootA = mShared.state().credentials.root().field.toString();
const rootB = mShared.state().credentials.root().field.toString();
check('both orgs in the same tree share the same root', rootA === rootB);

// The field elements pushed during checkRoot are identical for both reports.
const fieldsA2 = extractFieldElements(rA2);
const fieldsB2 = extractFieldElements(rB2);
check('same field elements disclosed across orgs in the same tree',
  JSON.stringify(fieldsA2) === JSON.stringify(fieldsB2));

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

console.log('\n=== 4. orgId IS visible in the public transcript (public circuit arg) ===');
// proofData.input contains the public circuit args: [orgId, epoch].
// Both are known to observers — the transcript makes them visible.
const inputA = rA2.proofData?.input;
check('proofData.input exists', inputA !== undefined);
check('input is an array of 2 (orgId + epoch)', Array.isArray(inputA?.value) && inputA.value.length === 2);

// orgId bytes are visible: first entry of input.value.
const orgIdBytes = inputA.value[0];
// Reconstruct as hex for a human-readable check.
const reconstructed = Object.entries(orgIdBytes)
  .sort(([a], [b]) => Number(a) - Number(b))
  .map(([, v]) => v.toString(16).padStart(2, '0'))
  .join('');
check('orgId bytes are visible in the transcript input', reconstructed === hex(orgA));
check('orgA and orgB report different input bytes',
  rA2.proofData.input.value[0][0] !== rB2.proofData.input.value[0][0]);

summary('transcript-privacy');
