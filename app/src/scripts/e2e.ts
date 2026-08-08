/**
 * B4.6 — CLI: the demo's 4 acts, end to end.
 *
 *   node dist/scripts/e2e.js [--network]
 *
 * Act 1 — the organization registers and issues a credential (mock issuer;
 *         the client only hands over the COMMITMENT, never the secret).
 * Act 2 — the whistleblower seals a report bound to the current epoch.
 * Act 3 — the anti-spam nullifier blocks a second report in the same epoch.
 * Act 4 — the authorship is revealed to a designated prosecutor and the
 *         export verifies for the prosecutor (✅) but not for the employer
 *         (❌) — the video moment.
 *
 * Simulator by default: no network, no proof server, no tDUST. `--network`
 * runs the same acts against the active network (needs an issued credential
 * environment; every act pays real proving).
 */
import '../config/init.js';

import { RepeatedNullifierError } from '../api/errors.js';
import { toHex, randomBytes32 } from '../witnesses/hex.js';
import { organizationId, pureCircuits } from '../witnesses/index.js';

import {
  closeBackend,
  createBackend,
  hexArgOrRandom,
  parseArgs,
  printMode,
  printTx,
} from './common.js';

const args = parseArgs();
const backend = await createBackend(args);
printMode(backend);
const { api } = backend;

const issuerSecret = hexArgOrRandom(undefined, 'issuerSecret');
// H-2: derived, not drawn. `registerOrganization` asserts this equality.
const orgId = toHex(organizationId(issuerSecret));
// Nonces, not keys: each verifier generates its own and sends it over.
const prosecutorNonce = hexArgOrRandom(undefined, 'prosecutorNonce');
const employerNonce = hexArgOrRandom(undefined, 'employerNonce');

console.log('\n=== ACT 1 — organization and credential ===');
const orgTx = await api.registerOrganization({ orgId, issuerSecret });
console.log(`organization ${orgId.slice(0, 16)}… registered`);
printTx(orgTx);

const credential = await api.prepareLocalCredential(orgId);
console.log(`client generated its secret locally; issuer sees only ${credential.credCommitment.slice(0, 16)}…`);
const issued = await api.issueCredential({ orgId, credCommitment: credential.credCommitment, issuerSecret });
console.log(`credential issued at leafIndex ${issued.leafIndex}`);
printTx(issued.tx);

// H-1: `report` refuses to run while the tree holds fewer than
// `minAnonymitySet()` credentials — a membership proof against a tree of one
// names exactly one person. These are the rest of the crowd. Issuing them in a
// batch is also the operational half of the mitigation, since the floor alone
// does nothing about timing.
const floor = Number(pureCircuits.minAnonymitySet());
for (let i = 1; i < floor; i += 1) {
  await api.issueCredential({
    orgId,
    credCommitment: toHex(randomBytes32()),
    issuerSecret,
  });
}
console.log(`${floor - 1} more credentials issued — anonymity floor of ${floor} reached`);

console.log('\n=== ACT 2 — the report ===');
const period = api.currentPeriod();
const sealed = await api.report({
  orgId,
  period,
  evidence: Buffer.from('internal audit dump — e2e demo evidence'),
});
console.log(`report sealed in epoch ${period}`);
console.log(`reportId  : ${sealed.reportId}`);
console.log(`nullifier : ${sealed.nullifier}`);
printTx(sealed.tx);

console.log('\n=== ACT 3 — the anti-spam nullifier ===');
try {
  await api.report({ orgId, period, evidence: Buffer.from('second try, same epoch') });
  console.error('UNEXPECTED: the second report in the same epoch was accepted');
  process.exit(1);
} catch (error) {
  if (!(error instanceof RepeatedNullifierError)) throw error;
  console.log('second report in the same epoch rejected: "already reported this period" ✔');
  console.log('(rejected at proof time — no transaction was submitted)');
}

console.log('\n=== ACT 4 — deferred authorship, one receipt per nonce ===');
const reveal = await api.revealAuthorship({ reportId: sealed.reportId, prosecutorNonce });
console.log(`authorship revealed for nonce ${prosecutorNonce.slice(0, 16)}…`);
console.log(`receipt        : ${reveal.receipt}`);
printTx(reveal.tx);

// ONE package, addressed to the prosecutor. The employer intercepts it and
// reads it with their own key — the bytes are identical, the verdict is not.
const pkg = api.exportKey(sealed.reportId, prosecutorNonce);
console.log(`package fields : ${Object.keys(pkg).join(', ')} — no secret leaves the machine`);
const vProsecutor = await api.verifyAuthorship(pkg, prosecutorNonce);
const vEmployer = await api.verifyAuthorship(pkg, employerNonce);

const label = (v: { ok: boolean; onLedger: boolean }): string =>
  v.ok && v.onLedger ? '✅ AUTHORSHIP VERIFIED' : '❌ DOES NOT VERIFY';

console.log('\n--- one package, two verifiers ---');
console.log(`PROSECUTOR : ${label(vProsecutor)}`);
console.log(`EMPLOYER   : ${label(vEmployer)} (${vEmployer.detail})`);

const ledger = await api.readLedgerState();
console.log('\n=== final ledger state ===');
console.log(`organizations      : ${ledger.organizations}`);
console.log(`credentials issued : ${ledger.issuedCredentials ?? '?'}`);
console.log(`reports sealed     : ${ledger.reports.length}`);
console.log(`nullifiers burned  : ${ledger.nullifiers}`);
console.log(`authorships        : ${ledger.authorships.length}`);

// The ✅ is earned rather than asserted: the prosecutor RECOMPUTES
// `receiptOf(reportId, theirNonce)` from data they already hold and finds it
// on the ledger, where only someone who knew the report secret could have put
// it. The employer recomputes with their own nonce, gets a different value,
// and finds nothing — which is why their ❌ is a refutation and not a shrug.
const ok = vProsecutor.ok && vProsecutor.onLedger && !vEmployer.ok;
console.log(ok ? '\nE2E: the 4 acts completed ✔' : '\nE2E: FAILED');
await closeBackend(backend);
process.exit(ok ? 0 : 1);
