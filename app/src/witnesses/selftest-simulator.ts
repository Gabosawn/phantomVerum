// Selftest of B2.3 — the REAL witnesses against the REAL COMPILED contract,
// in the local simulator of @midnight-ntwrk/compact-runtime. No network, no
// proof server, no mocks.
//
//   npm run build --workspace=app && node app/dist/witnesses/selftest-simulator.js
//
// Requires a prior `npm run compile --workspace=contracts` (or
// `compile:fast`).
//
// Note on `contracts/test/harness.mjs`: it does exactly this context
// construction and was read to write this, but it is NOT imported. Two
// reasons: it is untyped JavaScript and this workspace compiles in `strict`
// (importing it would make the whole simulator world an implicit `any`,
// which is exactly what this selftest must verify), and another agent is
// editing it in parallel. What IS shared is the fixed instant, so both
// scripts speak of the same epoch.

import type { ChargedState } from '@midnight-ntwrk/compact-runtime';

import { Contract, ledger as readLedger } from '../../../contracts/output/contract/index.js';

import { check, checkRejects, errorMessage, summary } from './check.js';
import {
  appRuntimePath,
  contractRuntimePath,
  runtime,
  runtimeUnified,
} from './contract-runtime.js';
import { epochOfSeconds } from './epoch.js';
import { hashEvidenceBytes } from './evidence.js';
import { toHex, randomBytes32 } from './hex.js';
import {
  type TestigoPrivateState,
  type Ledger,
  CredentialNotIssuedError,
  credentialCommitment,
  withCredential,
  createWitnesses,
  reportIdOfRecord,
  privateStateToJson,
  privateStateFromJson,
  emptyPrivateState,
  credentialLeaf,
  clearActiveReport,
  pureCircuits,
  stageStoredReport,
  stageNewReport,
  witnesses,
} from './index.js';

const { createCircuitContext, createConstructorContext, sampleContractAddress } = runtime;

if (!runtimeUnified) {
  console.warn(
    '⚠️  compact-runtime is DUPLICATED — this selftest uses the contract\'s ' +
      'copy so it can run, but B3 (midnight-js) will hit\n' +
      "    CompactError: 'contractState' parameter ... has unexpected type\n" +
      `    contract: ${contractRuntimePath}\n` +
      `    app:      ${appRuntimePath}\n` +
      '    Fix: delete contracts/node_modules and reinstall from the root.\n',
  );
}

// Same fixed instant as contracts/test/harness.mjs: 2026-08-07T00:00:00Z.
const NOW = 1786147200;
const EPOCH = epochOfSeconds(NOW);

const orgId = randomBytes32();
const foreignOrg = randomBytes32();
const anchor = randomBytes32();
const prosecutorPk = randomBytes32();
const employerPk = randomBytes32();

// ── Simulator world ─────────────────────────────────────────────────────

const contract = new Contract<TestigoPrivateState>(witnesses);
const address = sampleContractAddress();
const initial = contract.initialState(
  createConstructorContext<TestigoPrivateState>(emptyPrivateState(), '0'.repeat(64)),
);

let contractState: ChargedState = initial.currentContractState.data;
let zswap = initial.currentZswapLocalState;
let ps: TestigoPrivateState = emptyPrivateState();
let clock = NOW;

const ctx = () =>
  createCircuitContext<TestigoPrivateState>(
    address,
    zswap,
    contractState,
    ps,
    undefined,
    undefined,
    clock,
  );

const state = (): Ledger => readLedger(contractState);

type Impure = Contract<TestigoPrivateState>['impureCircuits'];

/** Runs a circuit and absorbs the resulting state. */
function call<N extends keyof Impure>(name: N, ...args: unknown[]): void {
  const fn = contract.impureCircuits[name] as (
    ...a: unknown[]
  ) => { context: ReturnType<typeof ctx> };
  const r = fn(ctx(), ...args);
  contractState = r.context.currentQueryContext.state;
  zswap = r.context.currentZswapLocalState;
  ps = r.context.currentPrivateState;
}

/** Same, but with ANOTHER private state (impostors). Absorbs nothing. */
function callAs(otherPs: TestigoPrivateState, name: keyof Impure, ...args: unknown[]): void {
  const other = new Contract<TestigoPrivateState>(createWitnesses());
  const fn = other.impureCircuits[name] as (...a: unknown[]) => unknown;
  fn(
    createCircuitContext<TestigoPrivateState>(
      address,
      zswap,
      contractState,
      otherPs,
      undefined,
      undefined,
      clock,
    ),
    ...args,
  );
}

/** Hand-built WitnessContext, to call a witness in isolation. */
const witnessCtx = (privateState: TestigoPrivateState) => ({
  ledger: state(),
  privateState,
  contractAddress: address,
});

// ─────────────────────────────────────────────────────────────────────────

console.log('=== 1. The private state starts empty and fails closed ===');
check('without a credential the leaf cannot be computed', errorMessage(() => credentialLeaf(ps)) !== null);
checkRejects(
  'without a credential, credentialCommitment rejects',
  () => credentialCommitment(ps),
  'credential not issued for this org',
);

console.log('\n=== 2. The org registers; the client generates its credential ===');
call('registerOrganization', orgId, anchor);
check('organizations.size == 1', state().organizations.size() === 1n);

// H-4: the client generates the secret. The issuer is sent the COMMITMENT.
const credentialSecret = randomBytes32();
ps = withCredential(ps, credentialSecret, orgId);
const commitment = credentialCommitment(ps);
check(
  'the commitment is credCommitmentOf(credSecret) from the pure circuit',
  toHex(commitment) === toHex(pureCircuits.credCommitmentOf(credentialSecret)),
);
check(
  'the commitment does NOT reveal the secret (distinct values)',
  toHex(commitment) !== toHex(credentialSecret),
);

console.log('\n=== 3. Before issuance, the path witness fails CLOSED ===');
const evidence1 = hashEvidenceBytes(Buffer.from('internal file — plant 3'));
const stage1 = stageNewReport(ps, evidence1);
ps = stage1.state;
checkRejects(
  'reporting without the credential in the tree',
  () => call('report', orgId, EPOCH),
  'credential not issued for this org',
);
check('no report was sealed', state().reports.isEmpty());
check('no nullifier was burned', state().nullifiers.isEmpty());

console.log('\n--- The failure message is UNIQUE (H-5 rule 4) ---');
// Three distinct situations must be indistinguishable: no credential, a
// credential from another org, and the right credential not yet issued.
const msgNoCredential = errorMessage(() =>
  witnesses.credentialPath(witnessCtx(stageNewReport(emptyPrivateState(), evidence1).state)),
);
const msgOtherOrg = errorMessage(() =>
  witnesses.credentialPath(witnessCtx(withCredential(ps, randomBytes32(), foreignOrg))),
);
const msgNotIssued = errorMessage(() => witnesses.credentialPath(witnessCtx(ps)));
check('no credential -> throws', msgNoCredential !== null, String(msgNoCredential));
check(
  'the 3 cases give EXACTLY the same message',
  msgNoCredential === msgOtherOrg && msgOtherOrg === msgNotIssued,
  `"${String(msgNotIssued)}"`,
);
check(
  'and the same error type',
  (() => {
    try {
      witnesses.credentialPath(witnessCtx(emptyPrivateState()));
      return false;
    } catch (e) {
      return e instanceof CredentialNotIssuedError;
    }
  })(),
);

console.log('\n=== 4. The issuer adds the leaf; the witness finds it ===');
call('issueCredential', orgId, commitment);
check('credentials.firstFree == 1', state().credentials.firstFree() === 1n);
const leaf = credentialLeaf(ps);
check(
  'credentialLeaf matches leafOf(orgId, credCommitmentOf(secret))',
  toHex(leaf) === toHex(pureCircuits.leafOf(orgId, pureCircuits.credCommitmentOf(credentialSecret))),
);
check('findPathForLeaf now finds it', state().credentials.findPathForLeaf(leaf) !== undefined);

const [, path1] = witnesses.credentialPath(witnessCtx(ps));
check('the witness returns 8 siblings', path1.length === 8, `len=${path1.length}`);
check(
  'and they are {sibling:{field}, goes_left} entries (goes_left is snake_case)',
  typeof path1[0]?.sibling.field === 'bigint' && typeof path1[0]?.goes_left === 'boolean',
);

console.log('\n=== 5. Real report (the 4 witnesses in a single circuit) ===');
call('report', orgId, EPOCH);
const reportId1 = stage1.report.reportId;
const nullifier1 = pureCircuits.nullifierOf(credentialSecret, orgId, EPOCH);
check(
  'the precomputed reportId matches the one sealed on-chain',
  state().reports.member(reportId1),
  toHex(reportId1),
);
check('the epoch nullifier got burned', state().nullifiers.member(nullifier1));
console.log(`  period (epoch) = ${EPOCH}`);

checkRejects(
  're-report in the same epoch',
  () => call('report', orgId, EPOCH),
  'already reported this period',
);

console.log('\n=== 6. The path is NEVER cached (H-5) ===');
// Other employees' credentials are issued: the tree moves. The witness must
// return the path of the NEW state, not the one it just saw.
const rootBefore = state().credentials.root().field;
for (let i = 0; i < 3; i++) call('issueCredential', orgId, randomBytes32());
const rootAfter = state().credentials.root().field;
check('3 insertions moved the root', rootBefore !== rootAfter);

const [, path2] = witnesses.credentialPath(witnessCtx(ps));
const series = (c: typeof path1) => c.map((e) => `${e.sibling.field}:${String(e.goes_left)}`).join('|');
check(
  'the witness returns a DIFFERENT path after the tree moved (no cache)',
  series(path1) !== series(path2),
);
check('and it still has 8 siblings', path2.length === 8);
check(
  'the leaf did not change: what changes are the siblings',
  toHex(credentialLeaf(ps)) === toHex(leaf),
);

console.log('\n=== 7. Second report: FRESH secret, not the first one\'s (H-3) ===');
clock = NOW + 86400; // next epoch, otherwise the nullifier blocks
const EPOCH2 = epochOfSeconds(clock);
check('the epoch advanced by 1', EPOCH2 === EPOCH + 1n, `${EPOCH} -> ${EPOCH2}`);

const evidence2 = hashEvidenceBytes(Buffer.from('payroll sheet 2026'));
const stage2 = stageNewReport(ps, evidence2);
ps = stage2.state;
check(
  'report 2 uses a reportSecret distinct from report 1\'s',
  toHex(stage2.report.reportSecret) !== toHex(stage1.report.reportSecret),
);
call('report', orgId, EPOCH2);
const reportId2 = stage2.report.reportId;
check('report 2 got sealed', state().reports.member(reportId2));
check('reports.size == 2', state().reports.size() === 2n);
check(
  'the new epoch\'s nullifier also got burned',
  state().nullifiers.member(pureCircuits.nullifierOf(credentialSecret, orgId, EPOCH2)),
);
check(
  'the two reportIds are distinct and not linkable through the secret',
  toHex(reportId1) !== toHex(reportId2),
);

console.log('\n=== 8. Revealing ONE report\'s authorship (staging from the store) ===');
// Exactly as B3 will do it: the stored record is read and staged.
const record1 = {
  reportSecret: toHex(stage1.report.reportSecret),
  evidenceHash: toHex(stage1.report.evidenceHash),
};
check(
  'reportIdOfRecord reconstructs the id from the store',
  toHex(reportIdOfRecord(record1)) === toHex(reportId1),
);
ps = stageStoredReport(ps, record1, reportId1);
call('revealAuthorship', reportId1, prosecutorPk);
const authorshipHash = pureCircuits.authorshipOf(stage1.report.reportSecret, reportId1, prosecutorPk);
check('the authorship got registered', state().authorships.member(authorshipHash));

console.log('\n--- The video moment: same report, two verifiers ---');
check('PROSECUTOR -> the authorship verifies', state().authorships.member(authorshipHash));
check(
  'EMPLOYER   -> the hash is different and NOT on the ledger',
  !state().authorships.member(
    pureCircuits.authorshipOf(stage1.report.reportSecret, reportId1, employerPk),
  ),
);

console.log('\n=== 9. The per-report secret bounds the damage (H-3) ===');
// Whoever receives report 1's export learns its reportSecret. That secret is
// NO GOOD for report 2: it is the whole point of the v2 change.
checkRejects(
  'report 1\'s secret does not claim report 2\'s authorship',
  () => callAs(stageStoredReport(ps, record1), 'revealAuthorship', reportId2, prosecutorPk),
  'not the author',
);
checkRejects(
  'neither does an invented secret',
  () =>
    callAs(
      stageStoredReport(ps, {
        reportSecret: randomBytes32(),
        evidenceHash: evidence1,
      }),
      'revealAuthorship',
      reportId1,
      prosecutorPk,
    ),
  'not the author',
);
checkRejects(
  'the local check saves the proving when the store does not match',
  () => stageStoredReport(ps, record1, reportId2),
  'stored secrets do not reconstruct that report',
);

console.log('\n=== 10. Without a staged report, witnesses fail readably ===');
ps = clearActiveReport(ps);
check('activeReport is now null', ps.activeReport === null);
checkRejects(
  'revealAuthorship without staging',
  () => call('revealAuthorship', reportId1, employerPk),
  'no active report in the private state',
);
check('no authorship was added', state().authorships.size() === 1n);

console.log('\n=== 11. The private state survives a JSON round-trip ===');
ps = stageStoredReport(ps, record1, reportId1);
const jsonPs = privateStateToJson(ps);
check('serializes without loose bigints', typeof JSON.stringify(jsonPs) === 'string');
const psBack = privateStateFromJson(JSON.parse(JSON.stringify(jsonPs)) as typeof jsonPs);
check(
  'exact round-trip of the credential',
  psBack.credentialSecret !== null && toHex(psBack.credentialSecret) === toHex(credentialSecret),
);
check(
  'exact round-trip of the staged report',
  psBack.activeReport !== null &&
    toHex(psBack.activeReport.reportId) === toHex(reportId1),
);
check(
  'and the deserialized state serves to reveal to another prosecutor',
  (() => {
    try {
      callAs(psBack, 'revealAuthorship', reportId1, employerPk);
      return true;
    } catch {
      return false;
    }
  })(),
);

summary('selftest witnesses vs simulator');
