/**
 * B4.5 — CLI: verify an authorship key export. 100% off-chain arithmetic +
 * one ledger read.
 *
 *   node dist/scripts/verify-authorship.js --file <export.json> [--network]
 *   node dist/scripts/verify-authorship.js            # simulator self-demo
 *
 * With `--file`, the export JSON (the package the whistleblower handed to
 * the prosecutor) is parsed, its arithmetic is recomputed with the
 * contract's pure circuits and the hashes are looked up on the ledger the
 * chosen backend sees.
 *
 * Without a file, simulator mode runs the whole demo in-memory — register,
 * issue, report, reveal — and then verifies TWO exports of the same report:
 * the prosecutor's (✅ verifies) and the employer's (❌ not on the ledger).
 * That is the product's key moment, with zero infrastructure.
 */
import '../config/init.js';

import { readFile } from 'node:fs/promises';

import { parseKeyExport } from '../api/verify.js';
import type { VerificationResult } from '../api/types.js';

import {
  bootstrapCredential,
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
  console.log(`  arithmetic ok : ${v.ok}`);
  console.log(`  on ledger     : ${v.onLedger}`);
  console.log(`  detail        : ${v.detail}`);
};

const fileFlag = args.flags.get('file') ?? args.positional[0];

if (typeof fileFlag === 'string') {
  // Verify a real export file against the backend's ledger.
  const raw: unknown = JSON.parse(await readFile(fileFlag, 'utf8'));
  const pkg = parseKeyExport(raw);
  console.log(`export   : ${fileFlag}`);
  console.log(`reportId : ${pkg.reportId}`);
  if (backend.mode === 'simulator') {
    console.log('note     : simulator backend starts with an EMPTY ledger — the');
    console.log('           arithmetic checks are meaningful, "on ledger" is not.');
  }
  printVerdict('verdict', await backend.api.verifyAuthorship(pkg));
  await closeBackend(backend);
} else if (backend.mode === 'network') {
  fatal('pass --file <export.json> to verify against the network ledger');
} else {
  // Simulator self-demo: full flow, then prosecutor ✅ / employer ❌.
  const orgId = hexArgOrRandom(undefined, 'orgId');
  const prosecutorPk = hexArgOrRandom(undefined, 'prosecutorPk');
  const employerPk = hexArgOrRandom(undefined, 'employerPk');

  await bootstrapOrg(backend, orgId, hexArgOrRandom(undefined, 'anchor'));
  await bootstrapCredential(backend, orgId);
  const sealed = await backend.api.report({
    orgId,
    period: backend.api.currentPeriod(),
    evidence: Buffer.from('demo evidence for verify-authorship'),
  });
  console.log(`(setup)  : report ${sealed.reportId.slice(0, 16)}… sealed`);
  await backend.api.revealAuthorship({ reportId: sealed.reportId, prosecutorPk });
  console.log(`(setup)  : authorship revealed to prosecutor ${prosecutorPk.slice(0, 16)}…`);

  console.log('\n--- same report, two verifiers ---');
  const prosecutorKey = backend.api.exportKey(sealed.reportId, prosecutorPk);
  printVerdict('PROSECUTOR', await backend.api.verifyAuthorship(prosecutorKey));
  const employerKey = backend.api.exportKey(sealed.reportId, employerPk);
  printVerdict('EMPLOYER  ', await backend.api.verifyAuthorship(employerKey));

  await closeBackend(backend);
}
