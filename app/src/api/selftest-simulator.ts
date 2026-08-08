// B3 integration selftest — the REAL API against the REAL COMPILED contract,
// on the local simulator. No network, no proof server, no tDUST, no mocks.
//
//   npm run build --workspace=app && node app/dist/api/selftest-simulator.js
//
// Requires a prior `npm run compile --workspace=contracts` (ZK artifacts are
// not needed here: the simulator executes, it does not prove).
//
// What it covers: the demo's 4 acts going THROUGH THE API (`TestigoApi`),
// not through hand-driven circuits — that is the difference with
// `witnesses/selftest-simulator.ts`, which validates the layer below. Here
// we verify that register -> issue -> report -> reveal -> verify works with
// the frozen docs/03 §3.1 signatures, plus the three negatives of the
// acceptance criteria (invalid credential, repeated nullifier, someone
// else's secret) and that none of them moves the ledger.
//
// What this selftest does NOT cover, and it is worth saying: the transaction
// layer — proving, balancing and submit. That lives in `executor-network.ts`
// and B5 validates it against Preview. The business logic, which is what
// this is, is the same on both paths by construction (see `executor.ts`).

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { check, checkRejects, checkRejectsAsync, summary } from '../witnesses/check.js';
import { epochOfSeconds } from '../witnesses/epoch.js';
import { hashEvidenceBytes } from '../witnesses/evidence.js';
import { toBytes32, toHex, randomBytes32 } from '../witnesses/hex.js';
import { pureCircuits, stageStoredReport } from '../witnesses/index.js';
import {
  addReport,
  createSecrets,
  readSecrets,
  getReport,
} from '../witnesses/secrets.js';

import {
  InvalidCredentialError,
  NotTheAuthorError,
  RepeatedNullifierError,
  mapCircuitError,
} from './errors.js';
import { TestigoApi, connectSimulator } from './testigo.js';
import { parseKeyExport } from './verify.js';
import type { LedgerState, AuthorshipKeyExport } from './types.js';

// Same fixed instant as the other selftests: 2026-08-07T00:00:00Z, in
// SECONDS. Fixing it makes the test deterministic and makes
// `currentPeriod()` independent of when it runs.
const NOW = 1786147200;

// Throwaway secrets store: this test does NOT touch the real secrets.
const tmpDir = mkdtempSync(path.join(tmpdir(), 'testigo-b3-'));
const secretsPath = path.join(tmpDir, 'denunciante.json');
const impostorSecretsPath = path.join(tmpDir, 'impostor.json');
process.on('exit', () => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const orgId = randomBytes32();
const anchor = randomBytes32();
const prosecutorPk = randomBytes32();
const employerPk = randomBytes32();

const { api, executor } = connectSimulator({ now: NOW, secretsPath });
const EPOCH = epochOfSeconds(NOW);

/** Fingerprint of the ledger, to compare before/after a negative. */
const fingerprint = (e: LedgerState): string =>
  JSON.stringify([e.organizations, e.reports.length, e.nullifiers, e.authorships.length]);

/** Does `fn` throw an error of type `Type`? */
const isOfType = async (
  fn: () => Promise<unknown>,
  Type: new (...a: never[]) => Error,
): Promise<boolean> => {
  try {
    await fn();
    return false;
  } catch (e) {
    return e instanceof Type;
  }
};

// ─────────────────────────────────────────────────────────────────────────

console.log('=== 0. The API starts against the simulator ===');
check('simulator mode', api.mode === 'simulator');
check('there is a contractAddress', api.contractAddress.length > 0);
check(
  'currentPeriod() uses the executor clock, not Date.now()',
  api.currentPeriod() === EPOCH,
  `${api.currentPeriod()} == ${EPOCH}`,
);

const empty = await api.readLedgerState();
check(
  'the ledger starts empty',
  empty.organizations === 0 &&
    empty.reports.length === 0 &&
    empty.nullifiers === 0 &&
    empty.authorships.length === 0,
);

console.log('\n=== 1. T1 — the organization registers (B3.2) ===');
const orgTx = await api.registerOrganization({ orgId, anchor });
check('returns a txId', orgTx.txId.length > 0, orgTx.txId);
check('marked as simulated (not an explorer txId)', orgTx.simulated === true);
check('organizations == 1', (await api.readLedgerState()).organizations === 1);

console.log('\n=== 2. T1 — credential: the client generates, the issuer only sees the commitment ===');
const credential = await api.prepareLocalCredential(orgId);
check('the commitment is 64 hex chars', credential.credCommitment.length === 64);
check(
  'the commitment is NOT the secret (H-4: the issuer never sees the secret)',
  credential.credCommitment !== credential.credentialSecret,
);
check(
  'matches credCommitmentOf() from the pure circuit',
  credential.credCommitment ===
    toHex(pureCircuits.credCommitmentOf(toBytes32(credential.credentialSecret))),
);

console.log('\n=== 3. NEGATIVE: reporting before the issuer inserts the leaf ===');
// One of the three cases H-5 (rule 4) forces to be indistinguishable:
// "I have a credential but it was not issued yet" must exit through the same
// place and with the same text as "I have no credential" and "it belongs to
// another org".
const beforeIssue = fingerprint(await api.readLedgerState());
await checkRejectsAsync(
  'reporting without the leaf in the tree -> InvalidCredentialError',
  () =>
    api.report({ orgId, period: EPOCH, evidence: Buffer.from('premature attempt') }),
  'credential not issued for this org',
);
check(
  'the error is InvalidCredentialError',
  await isOfType(
    () => api.report({ orgId, period: EPOCH, evidence: Buffer.from('another attempt') }),
    InvalidCredentialError,
  ),
);
check(
  'and the ledger did not move: no tx was submitted',
  fingerprint(await api.readLedgerState()) === beforeIssue,
);

console.log('\n=== 4. T1 — the issuer inserts the leaf (B3.3) ===');
const issuance = await api.issueCredential({ orgId, credCommitment: credential.credCommitment });
check('leafIndex == 0 (first leaf of the tree)', issuance.leafIndex === 0, String(issuance.leafIndex));
check('returns a tx', issuance.tx.txId.length > 0);
check(
  'the leafIndex got persisted in the local store',
  readSecrets(secretsPath)?.leafIndex === 0,
);
check(
  'issuedCredentials == 1 on the ledger',
  (await api.readLedgerState()).issuedCredentials === 1,
);

console.log('\n=== 5. T2 — the report (B3.4) ===');
const evidence1 = Buffer.from('internal file — plant 3');
const report1 = await api.report({ orgId, period: EPOCH, evidence: evidence1 });
check('returns reportId', report1.reportId.length === 64);
check('returns nullifier', report1.nullifier.length === 64);
check('returns reportSecret', report1.reportSecret.length === 64);
check(
  'the evidenceHash is the local sha-256 of the evidence',
  report1.evidenceHash === toHex(hashEvidenceBytes(evidence1)),
);
check(
  'the reportId is reportIdOf(evidenceHash, reportSecret)',
  report1.reportId ===
    toHex(
      pureCircuits.reportIdOf(
        toBytes32(report1.evidenceHash),
        toBytes32(report1.reportSecret),
      ),
    ),
);
check(
  'the nullifier is nullifierOf(credSecret, orgId, period)',
  report1.nullifier ===
    toHex(pureCircuits.nullifierOf(toBytes32(credential.credentialSecret), orgId, EPOCH)),
);

const afterReport = await api.readLedgerState();
check('the report got sealed', afterReport.reports.includes(report1.reportId));
check('1 nullifier got burned', afterReport.nullifiers === 1);

console.log('\n--- The secret was persisted BEFORE the tx (if lost, no authorship) ---');
const stored = getReport(report1.reportId, secretsPath);
check('the record is in the local store', stored !== null);
check(
  'with the same reportSecret the API returned',
  stored?.reportSecret === report1.reportSecret,
);
check('and with the epoch it was submitted in', stored?.period === String(EPOCH));

console.log('\n=== 6. NEGATIVE: repeated nullifier (the anti-spam) ===');
const beforeRepeat = fingerprint(await api.readLedgerState());
await checkRejectsAsync(
  're-reporting in the same epoch -> RepeatedNullifierError',
  () =>
    api.report({
      orgId,
      period: EPOCH,
      evidence: Buffer.from('other evidence, same epoch'),
    }),
  'already reported this period',
);
check(
  'the error is RepeatedNullifierError',
  await isOfType(
    () => api.report({ orgId, period: EPOCH, evidence: Buffer.from('and one more') }),
    RepeatedNullifierError,
  ),
);
check(
  'and the ledger did not move: no tx was submitted',
  fingerprint(await api.readLedgerState()) === beforeRepeat,
);

console.log('\n=== 7. Second report, next epoch (H-3: fresh secret per report) ===');
executor.advanceClock(86400);
const EPOCH2 = api.currentPeriod();
check('the epoch advanced by 1', EPOCH2 === EPOCH + 1n, `${EPOCH} -> ${EPOCH2}`);

const report2 = await api.report({
  orgId,
  period: EPOCH2,
  evidence: Buffer.from('payroll sheet 2026'),
});
check(
  'report 2 uses a reportSecret DIFFERENT from report 1\'s (H-3)',
  report2.reportSecret !== report1.reportSecret,
);
check('and therefore another reportId', report2.reportId !== report1.reportId);
const afterReport2 = await api.readLedgerState();
check('reports == 2', afterReport2.reports.length === 2);
check('nullifiers == 2', afterReport2.nullifiers === 2);

console.log('\n=== 8. T4 — revealing the authorship to the prosecutor (B3.5) ===');
const reveal = await api.revealAuthorship({ reportId: report1.reportId, prosecutorPk });
check('returns authorshipHash', reveal.authorshipHash.length === 64);
check(
  'it is authorshipOf(reportSecret, reportId, prosecutorPk)',
  reveal.authorshipHash ===
    toHex(
      pureCircuits.authorshipOf(
        toBytes32(report1.reportSecret),
        toBytes32(report1.reportId),
        prosecutorPk,
      ),
    ),
);
check('the authorship got published', (await api.readLedgerState()).authorships.includes(reveal.authorshipHash));

console.log('\n=== 9. NEGATIVE: someone else\'s secret — through BOTH paths ===');

// 9a. Cheap path: the local store does not reconstruct that reportId. Costs
// one hash and avoids ~30 s of proving.
createSecrets(orgId, impostorSecretsPath);
addReport(
  report1.reportId, // claims to be the victim's report...
  { reportSecret: randomBytes32(), evidenceHash: randomBytes32() }, // ...with invented secrets
  impostorSecretsPath,
);
const impostorApi = new TestigoApi(executor, { secretsPath: impostorSecretsPath });
const beforeImpostor = fingerprint(await api.readLedgerState());
await checkRejectsAsync(
  'someone else\'s secret -> rejected by the local check, no proving',
  () => impostorApi.revealAuthorship({ reportId: report1.reportId, prosecutorPk }),
  'stored secrets do not reconstruct that report',
);
check(
  'the error is NotTheAuthorError',
  await isOfType(
    () => impostorApi.revealAuthorship({ reportId: report1.reportId, prosecutorPk }),
    NotTheAuthorError,
  ),
);

// 9b. The one that really counts: the circuit's `assert`. The local check is
// skipped on purpose (staging WITHOUT the expected reportId) to reach the
// contract. If this passed, security would depend on an app `if` instead of
// the circuit.
const victimPs = await executor.readPrivateState();
await executor.writePrivateState(
  stageStoredReport(victimPs, {
    reportSecret: randomBytes32(),
    evidenceHash: randomBytes32(),
  }),
);
await checkRejectsAsync(
  'someone else\'s secret -> the CIRCUIT assert also rejects',
  async () => {
    try {
      await executor.call('revealAuthorship', toBytes32(report1.reportId), prosecutorPk);
    } catch (e) {
      throw mapCircuitError(e, 'revealAuthorship');
    }
  },
  'not the author',
);
await executor.writePrivateState(victimPs);
check(
  'and the ledger did not move in either case',
  fingerprint(await api.readLedgerState()) === beforeImpostor,
);

console.log('\n=== 10. B3.8 + B3.6 — key export and off-chain verification ===');
const prosecutorKey = api.exportKey(report1.reportId, prosecutorPk);
check('the export is v2', prosecutorKey.version === 2);
check(
  'carries the 5 fields of the §3.2 format',
  prosecutorKey.reportId.length === 64 &&
    prosecutorKey.evidenceHash.length === 64 &&
    prosecutorKey.prosecutorPk.length === 64 &&
    prosecutorKey.authorshipHash.length === 64 &&
    prosecutorKey.proof.length === 64,
);
// The claim the README makes. Asserted over the serialized bytes, not over
// the type: the type can be right while an extra property rides along.
const serialized = JSON.stringify(prosecutorKey);
check(
  'THE SECRET NEVER LEAVES THE MACHINE: it is not in the package',
  !('reportSecret' in prosecutorKey) && !serialized.includes(report1.reportSecret),
);
check('its authorshipHash is the one published on-chain', prosecutorKey.authorshipHash === reveal.authorshipHash);
checkRejects(
  'a v2 file that still carries a reportSecret is rejected, not sanitized',
  () => parseKeyExport({ ...prosecutorKey, reportSecret: toHex(randomBytes32()) }),
  'still carries a "reportSecret"',
);

console.log('\n--- The 4 cases of the README table ---');

// (1) The package reaches the prosecutor it was addressed to. This is NOT a
//     pass: the report is sealed and the authorship is published for their
//     key, but nothing in the package ties either to the author. See (5) —
//     the employer can mint exactly this state for themselves.
const v1 = await api.verifyAuthorship(prosecutorKey, prosecutorPk);
check('REAL AUTHOR       -> unavailable, NOT verified', v1.verdict === 'unavailable', v1.detail);
check('                     the records ARE on the ledger', v1.onLedger);
check('                     no proof was verified, and none is claimed', v1.checks.proofVerified === null);

// (2) Tampered package: the proof is not the one this build's format emits.
//     Rejecting on attacker-supplied data is sound; accepting is not.
const v2 = await api.verifyAuthorship(
  { ...prosecutorKey, proof: toHex(randomBytes32()) },
  prosecutorPk,
);
check('TAMPERED PROOF    -> refuted', v2.verdict === 'refuted', v2.detail);
check('                     the failing check is the proof', v2.checks.proofVerified === false);
check('                     but the report itself IS still on the ledger', v2.checks.reportOnLedger);

// (3) A report that was never sealed: the package is self-consistent but
//     there is nothing on-chain to back it. Self-consistency is not evidence.
const ghostHash = toHex(randomBytes32());
const ghostKey: AuthorshipKeyExport = {
  version: 2,
  reportId: toHex(randomBytes32()),
  evidenceHash: toHex(randomBytes32()),
  prosecutorPk: toHex(prosecutorPk),
  authorshipHash: ghostHash,
  proof: ghostHash,
};
const v3 = await api.verifyAuthorship(ghostKey, prosecutorPk);
check('NONEXISTENT REPORT -> refuted', v3.verdict === 'refuted', v3.detail);
check('                     the report is not sealed', !v3.checks.reportOnLedger);

// (4) THE VIDEO MOMENT: the SAME package, intercepted, read with another key.
//     Nothing about the file changes — only who is asking.
const v4 = await api.verifyAuthorship(prosecutorKey, employerPk);
check('INTERCEPTED       -> refuted: addressed to another key', v4.verdict === 'refuted', v4.detail);
check('                     the failing check is the designation', !v4.checks.designatedToVerifier);
check(
  '                     and the authorship IS on-chain — it just is not theirs',
  v4.checks.authorshipOnLedger,
);
check(
  '                     an export addressed to the employer has ANOTHER hash',
  api.exportKey(report1.reportId, employerPk).authorshipHash !== prosecutorKey.authorshipHash,
);

// (5) THE ATTACK, reproduced. The employer never sees the package. They read
//     `reportId` and `authorshipHash` off the PUBLIC ledger — both are
//     published in the clear — and write their own key into `prosecutorPk`.
//     Every field is theirs, every value is real, and the old code returned
//     `ok: true` AND `onLedger: true` for this, which is a screenshot saying
//     "the whistleblower named me". It must never verify.
const forged: AuthorshipKeyExport = {
  version: 2,
  reportId: report1.reportId,            // scraped from the ledger
  evidenceHash: toHex(randomBytes32()),  // not checked by anything on-chain
  prosecutorPk: toHex(employerPk),       // the employer designates themselves
  authorshipHash: reveal.authorshipHash, // scraped from the ledger
  proof: reveal.authorshipHash,          // the stand-in this build emits
};
const v5 = await api.verifyAuthorship(forged, employerPk);
check('FORGED FROM LEDGER -> never verified', v5.verdict !== 'verified', v5.detail);
check('                     both scraped records really are on-chain', v5.onLedger);
check('                     and it still passes the designation check', v5.checks.designatedToVerifier);

// (6) Incrimination: the reportId of one report with the authorshipHash of
//     another. Nothing binds the two, so both lookups succeed independently.
const mixed: AuthorshipKeyExport = {
  ...forged,
  reportId: report2.reportId,
};
const v6 = await api.verifyAuthorship(mixed, employerPk);
check('MIXED RECORDS      -> never verified', v6.verdict !== 'verified', v6.detail);

console.log('\n--- PROSECUTOR ⚠️ / EMPLOYER ❌ over the SAME bytes ---');
check('PROSECUTOR -> NOT VERIFIABLE IN THIS BUILD', v1.verdict === 'unavailable');
check('EMPLOYER   -> DOES NOT VERIFY', v4.verdict === 'refuted');
check('NOTHING in this build can reach `verified`',
  [v1, v2, v3, v4, v5, v6].every((v) => v.verdict !== 'verified'));

console.log('\n=== 11. B3.7 — final ledger state ===');
const final = await api.readLedgerState();
check('organizations == 1', final.organizations === 1);
check('reports == 2', final.reports.length === 2);
check('nullifiers == 2', final.nullifiers === 2);
check('authorships == 1', final.authorships.length === 1);
check('credentials issued == 1', final.issuedCredentials === 1);
check(
  'the two reports are the ones the API returned',
  final.reports.includes(report1.reportId) && final.reports.includes(report2.reportId),
);

summary('selftest API B3 vs simulator');
