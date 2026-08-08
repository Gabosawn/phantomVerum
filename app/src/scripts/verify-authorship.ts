/**
 * B4.5 — CLI: verify an authorship key export. 100% off-chain checks + one
 * ledger read.
 *
 *   node dist/scripts/verify-authorship.js --file <export.json> --as <pk> [--network]
 *   node dist/scripts/verify-authorship.js            # simulator self-demo
 *
 * With `--file`, the export JSON (the package the whistleblower handed to the
 * prosecutor) is parsed, checked against `--as` — the key of whoever is
 * verifying — and its hashes are looked up on the ledger the chosen backend
 * sees. `--as` is mandatory: a package verified against the key written
 * inside it always says yes, which is not a verification.
 *
 * Without a file, simulator mode runs the whole demo in-memory — register,
 * issue, report, reveal — and then hands ONE package to two different
 * verifiers: the prosecutor it was addressed to (✅) and the employer who
 * intercepted it (❌). Same bytes, two verdicts. That is the product's key
 * moment, with zero infrastructure.
 */
import '../config/init.js';

import { readFile } from 'node:fs/promises';

import { parseKeyExport } from '../api/verify.js';
import type { VerificationResult } from '../api/types.js';

import {
  bootstrapCredential,
  bootstrapIssuerSecret,
  bootstrapOrg,
  closeBackend,
  createBackend,
  fatal,
  hexArgOrRandom,
  parseArgs,
  printMode,
} from './common.js';

const args = parseArgs();
const backend = await createBackend(args);
printMode(backend);

const printVerdict = (label: string, v: VerificationResult): void => {
  const verdict = v.ok && v.onLedger ? '✅ AUTHORSHIP VERIFIED' : '❌ DOES NOT VERIFY';
  console.log(`${label}: ${verdict}`);
  console.log(`  recomputes to me: ${v.checks.designatedToVerifier}`);
  console.log(`  receipt on chain: ${v.checks.receiptOnLedger}`);
  console.log(`  report on chain : ${v.checks.reportOnLedger}`);
  console.log(`  detail          : ${v.detail}`);
};

const fileFlag = args.flags.get('file') ?? args.positional[0];

if (typeof fileFlag === 'string') {
  // Verify a real export file against the backend's ledger.
  const asFlag = args.flags.get('as');
  if (typeof asFlag !== 'string') {
    fatal(
      'pass --as <your nonce, 64 hex chars>. The nonce is the one YOU generated ' +
        'and sent to the whistleblower; it is not in the package, which is what ' +
        'makes the verdict mean something.',
    );
  }
  const verifierNonce = hexArgOrRandom(asFlag as string, 'as');
  const raw: unknown = JSON.parse(await readFile(fileFlag, 'utf8'));
  const pkg = parseKeyExport(raw);
  console.log(`export   : ${fileFlag}`);
  console.log(`reportId : ${pkg.reportId}`);
  console.log(`as nonce : ${verifierNonce}`);
  if (backend.mode === 'simulator') {
    console.log('note     : simulator backend starts with an EMPTY ledger — the');
    console.log('           local checks are meaningful, "on ledger" is not.');
  }
  printVerdict('verdict', await backend.api.verifyAuthorship(pkg, verifierNonce));
  await closeBackend(backend);
} else if (backend.mode === 'network') {
  fatal('pass --file <export.json> to verify against the network ledger');
} else {
  // Simulator self-demo: full flow, then prosecutor ✅ / employer ❌.
  const prosecutorNonce = hexArgOrRandom(undefined, 'prosecutorNonce');
  const employerNonce = hexArgOrRandom(undefined, 'employerNonce');

  // H-2: the orgId is derived from the issuer secret `bootstrapOrg` mints.
  const orgId = await bootstrapOrg(backend);
  await bootstrapCredential(backend, orgId);
  const sealed = await backend.api.report({
    orgId,
    period: backend.api.currentPeriod(),
    evidence: Buffer.from('demo evidence for verify-authorship'),
  });
  console.log(`(setup)  : report ${sealed.reportId.slice(0, 16)}… sealed`);
  await backend.api.revealAuthorship({ reportId: sealed.reportId, prosecutorNonce });
  console.log(`(setup)  : authorship revealed for nonce ${prosecutorNonce.slice(0, 16)}…`);

  // ONE package, addressed to the prosecutor, read by two people. The
  // employer does not get a package of their own — they intercept this one.
  console.log('\n--- one package, two verifiers ---');
  const pkg = backend.api.exportKey(sealed.reportId, prosecutorNonce);
  console.log(`package  : carries no secret (fields: ${Object.keys(pkg).join(', ')})`);
  printVerdict('PROSECUTOR', await backend.api.verifyAuthorship(pkg, prosecutorNonce));
  printVerdict('EMPLOYER  ', await backend.api.verifyAuthorship(pkg, employerNonce));

  await closeBackend(backend);
}
