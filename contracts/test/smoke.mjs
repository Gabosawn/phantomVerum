// A.6 — smoke test of the pure circuits in the generated TS module.
// Runs without state or context: they are pure functions.

import { pureCircuits, b32, hex, check, summary, EPOCH } from './harness.mjs';

const orgId = b32(0x11);
const credSecret = b32(0x22);
const evidence = b32(0x33);
const secret = b32(0x44);
const prosecutorPk = b32(0x66);
const credComm = pureCircuits.credCommitmentOf(credSecret);

const cases = [
  ['credCommitmentOf', () => pureCircuits.credCommitmentOf(credSecret)],
  ['leafOf', () => pureCircuits.leafOf(orgId, credComm)],
  ['reportIdOf', () => pureCircuits.reportIdOf(evidence, secret)],
  ['nullifierOf', () => pureCircuits.nullifierOf(credSecret, orgId, EPOCH)],
  ['authorshipOf', () => pureCircuits.authorshipOf(secret, b32(0x77), prosecutorPk)],
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
  hex(pureCircuits.nullifierOf(credSecret, orgId, EPOCH + 1n)) !== hex(outputs.nullifierOf),
);

console.log('\n=== 4. Domain separation (plan §2.2) ===');
// Same inputs in the same positions, different domain tag: this is the
// cross-collision attack the plan describes (registering an org with
// orgId = reportId). The tags make it impossible.
const secAsBytes = b32(0x44);
const a = pureCircuits.authorshipOf(secAsBytes, orgId, b32(0x66));
const b = pureCircuits.reportIdOf(secAsBytes, orgId);
check('authorshipOf != reportIdOf with overlapping inputs', hex(a) !== hex(b));
check(
  'leafOf(org, cred) != credCommitmentOf(cred)',
  hex(pureCircuits.leafOf(orgId, credComm)) !== hex(credComm),
);

summary('smoke');
