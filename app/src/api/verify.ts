/**
 * B3.6 + B3.8 — Authorship verification and key export. 100% off-chain.
 *
 * Nothing in this module needs a wallet, a seed, a proof server or tDUST.
 * The verification is a hash comparison, a key comparison and one indexer
 * read. That is what lets a prosecutor verify an authorship with a URL and a
 * JSON file, and it is — literally — the video moment: the same package, the
 * prosecutor's key ✅, the employer's ❌.
 *
 * The package no longer carries the `reportSecret` (v2, `proveAuthorship`
 * §4.4). The consequence for THIS module is that verification can no longer
 * recompute the hashes from the secret: it compares what the package declares
 * against what the ledger holds, and against the key of whoever is asking.
 * See `AuthorshipKeyExport` for what that does and does not prove.
 */
import {
  type Hex32,
  toHex,
  asBytes32,
  asHex32,
  isHex32,
} from '../witnesses/hex.js';
import { pureCircuits } from '../witnesses/index.js';
import { getReport } from '../witnesses/secrets.js';

import type { LedgerReader } from './executor.js';
import { TestigoError } from './errors.js';
import { createReadOnlyReader } from './ledger.js';
import type { Bytes32Input, AuthorshipKeyExport, VerificationResult } from './types.js';

/** The local store has no secrets for that report. */
export class MissingReportSecretsError extends TestigoError {
  constructor(reportId: Hex32) {
    super(
      `no local secrets for report ${reportId}. ` +
        'Without the reportSecret there is no way to claim or export its authorship: ' +
        'it is generated once, at report time, and cannot be recovered.',
    );
  }
}

/** The loaded JSON does not have the shape of a v2 export. */
export class InvalidExportError extends TestigoError {
  constructor(detail: string) {
    super(`invalid authorship key export: ${detail}`);
  }
}

/**
 * B3.8 — Builds the package the whistleblower hands to the prosecutor.
 *
 * Reads the `reportSecret` from the local store (`secrets/denunciante.json`),
 * derives `authorshipHash` for THAT prosecutor — and leaves the secret
 * behind. It is 100% local: it does not touch the network.
 *
 * The secret is read here and used here, and that is the whole point: the
 * returned object is what goes into a file and out the door, and there is no
 * field in it that could carry the secret. Anyone reviewing this function
 * only has to check the returned literal.
 *
 * One export per prosecutor: the receipt depends on the nonce THAT prosecutor
 * chose, so the package for prosecutor A does not verify against B's nonce.
 *
 * Note what is NOT in the returned literal: the nonce. It is the prosecutor's
 * own — they generated it and sent it over — so putting it in the file would
 * hand an interceptor everything needed to designate themselves, which is the
 * exact hole this format closes.
 */
export const exportKey = (
  reportId: Bytes32Input,
  prosecutorNonce: Bytes32Input,
  _secretsPath?: string,
): AuthorshipKeyExport => {
  const idHex = asHex32(reportId, 'reportId');
  const idBytes = asBytes32(idHex, 'reportId');
  const nonceBytes = asBytes32(prosecutorNonce, 'prosecutorNonce');

  return {
    version: 3,
    reportId: idHex,
    receipt: toHex(pureCircuits.receiptOf(idBytes, nonceBytes)),
  };
};

/**
 * Validates an export that came from outside (a file handed to the
 * prosecutor).
 *
 * It is UNTRUSTED input: validated field by field before touching it.
 * Without this, a short hex would blow up inside a pure circuit with an
 * unreadable error instead of a message saying which file is wrong.
 */
export const parseKeyExport = (raw: unknown): AuthorshipKeyExport => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new InvalidExportError('expected a JSON object');
  }
  const o = raw as Record<string, unknown>;
  if (o['version'] !== 3) {
    throw new InvalidExportError(
      `version ${String(o['version'])}, expected 3. v1 carried the reportSecret in ` +
        'the file; v2 dropped it but left a verdict that any holder could satisfy ' +
        'by editing a field. Neither is migrated — treat a v1 package as a leaked ' +
        'secret and a v2 package as unverifiable.',
    );
  }
  const fields = ['reportId', 'receipt'] as const;
  for (const field of fields) {
    if (!isHex32(o[field])) {
      throw new InvalidExportError(`"${field}" is not a 64-char lowercase hex string`);
    }
  }
  // Nothing secret, and nothing that identifies the recipient, has any business
  // being in this file. A stray field means an old build produced it.
  for (const leaked of ['reportSecret', 'prosecutorNonce', 'evidenceHash'] as const) {
    if (o[leaked] !== undefined) {
      throw new InvalidExportError(
        `the package declares version 3 but still carries "${leaked}". Whoever ` +
          'produced it is running an old build; that field is what made the ' +
          'previous formats forgeable or leaky.',
      );
    }
  }
  return {
    version: 3,
    reportId: o['reportId'] as Hex32,
    receipt: o['receipt'] as Hex32,
  };
};

/**
 * B3.6 — `verifyAuthorship`.
 *
 * `verifierNonce` is the nonce the caller generated and sent to the
 * whistleblower, and it is a SEPARATE argument from the package on purpose:
 * it never travels in the file.
 *
 * That separation is what makes the verdict mean something. The check is a
 * RECOMPUTATION — `receiptOf(reportId, myNonce)` — against a value that is on
 * the ledger. Two attacks that both worked against the previous format die
 * here:
 *
 *  - Deanonymization by scraping. The employer reads `reportId` and the
 *    receipt off the public ledger and runs this with their own nonce. The
 *    recomputation yields a different receipt, which is on no ledger.
 *  - Incrimination by mixing. Splicing the `reportId` of one report onto the
 *    receipt of an unrelated one no longer passes, because the value looked up
 *    on-chain is the RECOMPUTED one, and recomputing binds the two together.
 *
 * The previous version compared `proof === authorshipHash` — two fields of the
 * same file, supplied by whoever brought it — and computed the verdict before
 * even reading the ledger. It was a tautology.
 *
 * Without a `reader`, it queries the active network's indexer against the
 * `deployment.json` address. The simulator passes its own and exercises the
 * same code.
 */
export const verifyAuthorship = async (
  exported: AuthorshipKeyExport,
  verifierNonce: Bytes32Input,
  reader?: LedgerReader,
): Promise<VerificationResult> => {
  const pkg = parseKeyExport(exported);

  const declaredId = asBytes32(pkg.reportId, 'reportId');
  const nonceBytes = asBytes32(verifierNonce, 'verifierNonce');

  // The whole verdict, recomputed locally from the public reportId and the
  // caller's own nonce. Nothing secret is involved, and nothing in the file
  // can influence it except the reportId.
  const recomputed = toHex(pureCircuits.receiptOf(declaredId, nonceBytes));

  // Addressed to me, or to somebody else? This is the EMPLOYER of the video —
  // and now it is a hash preimage question, not a string comparison the holder
  // controls.
  const designatedToVerifier = recomputed === pkg.receipt;

  const source = reader ?? (await createReadOnlyReader());
  const ledger = await source.readLedger();
  const reportOnLedger = ledger.reports.member(declaredId);
  // The RECOMPUTED receipt, never the declared one.
  const receiptOnLedger = ledger.authorships.member(asBytes32(recomputed, 'receipt'));
  const onLedger = reportOnLedger && receiptOnLedger;

  const ok = designatedToVerifier && receiptOnLedger;

  const checks = { designatedToVerifier, receiptOnLedger, reportOnLedger };
  return { ok, onLedger, detail: describe(checks), checks };
};

/** Human-readable message. It is what `verify-authorship.ts` (B4.5) prints. */
const describe = (r: {
  designatedToVerifier: boolean;
  receiptOnLedger: boolean;
  reportOnLedger: boolean;
}): string => {
  if (!r.reportOnLedger) {
    return 'that report is not sealed on the ledger: there is nothing to have authored';
  }
  if (!r.designatedToVerifier) {
    return (
      'recomputing the receipt with your nonce does not reproduce the one in this ' +
      'package. The authorship may well be genuine — it was simply not revealed ' +
      'to you, and nothing here proves anything to you'
    );
  }
  if (!r.receiptOnLedger) {
    return (
      'the receipt matches your nonce but was never published on-chain: nobody ' +
      'has revealed authorship of this report to you'
    );
  }
  return (
    'authorship verified: the receipt recomputed from your own nonce is published ' +
    'on-chain, and only someone who knew the report secret could have put it there'
  );
};
