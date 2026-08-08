// A.6 — smoke test of the pure circuits in the generated TS module.
// Runs without state or context: they are pure functions.

import { pureCircuits, b32, hex, check, summary, EPOCH } from './harness.mjs';

const orgId = b32(0x11);
const credSecret = b32(0x22);
const evidence = b32(0x33);
const secret = b32(0x44);
const prosecutorNonce = b32(0x66);
const issuerSecret = b32(0x55);
const credComm = pureCircuits.credCommitmentOf(credSecret);

const cases = [
  ['credCommitmentOf', () => pureCircuits.credCommitmentOf(credSecret)],
  ['anchorOf', () => pureCircuits.anchorOf(issuerSecret)],
  ['leafOf', () => pureCircuits.leafOf(orgId, credComm)],
  ['reportIdOf', () => pureCircuits.reportIdOf(evidence, secret)],
  ['nullifierOf', () => pureCircuits.nullifierOf(credSecret, EPOCH)],
  ['receiptOf', () => pureCircuits.receiptOf(b32(0x77), prosecutorNonce)],
];

console.log('=== 1. The pure circuits return Bytes<32> ===');
const outputs = {};
for (const [name, fn] of cases) {
  const out = fn();
  outputs[name] = out;
  console.log(`${name.padEnd(17)} -> ${hex(out)}`);
  check(`${name}: Uint8Array of 32 bytes`, out instanceof Uint8Array && out.length === 32);
}

console.log('\n=== 2. Determinism ===');
for (const [name, fn] of cases) {
  check(`${name}: deterministic`, hex(fn()) === hex(outputs[name]));
}

console.log('\n=== 3. Input sensitivity ===');
check(
  'reportIdOf changes with the secret',
  hex(pureCircuits.reportIdOf(evidence, b32(0x45))) !== hex(outputs.reportIdOf),
);
check(
  'nullifierOf changes with the epoch',
  hex(pureCircuits.nullifierOf(credSecret, EPOCH + 1n)) !== hex(outputs.nullifierOf),
);
// The org is no longer an operand, so enrolling the same credential in a
// second organization buys nothing: same epoch, same nullifier.
check(
  'nullifierOf does NOT depend on the organization',
  hex(pureCircuits.nullifierOf(credSecret, EPOCH)) === hex(outputs.nullifierOf),
);

console.log('\n=== 4. Domain separation (plan §2.2) ===');
// Same inputs in the same positions, different domain tag: this is the
// cross-collision attack the plan describes (registering an org with
// orgId = reportId). The tags make it impossible. `receiptOf` and
// `reportIdOf` are both Vector<3> over Bytes<32>, so the tag is the ONLY
// thing separating them.
const x = b32(0x44);
const a = pureCircuits.receiptOf(x, orgId);
const b = pureCircuits.reportIdOf(x, orgId);
check('receiptOf != reportIdOf with identical inputs', hex(a) !== hex(b));
check(
  'leafOf != reportIdOf with identical inputs',
  hex(pureCircuits.leafOf(x, orgId)) !== hex(b),
);
check(
  'leafOf(org, cred) != credCommitmentOf(cred)',
  hex(pureCircuits.leafOf(orgId, credComm)) !== hex(credComm),
);

summary('smoke');
