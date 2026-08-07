/**
 * B3.6 + B3.8 — Authorship verification and key export. 100% off-chain.
 *
 * Nothing in this module needs a wallet, a seed, a proof server or tDUST.
 * The verification is four hashes with the contract's exported `pure
 * circuit`s, plus one indexer read. That is what lets a prosecutor verify an
 * authorship with a URL and a JSON file, and it is — literally — the video
 * moment: the same proof, the prosecutor's key ✅, the employer's ❌.
 *
 * That it comes for free is a consequence of exporting `reportIdOf`,
 * `authorshipOf`, etc. as `export pure circuit` (docs/03 §2.4).
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
 * Reads the `reportSecret` from the local store (`secrets/denunciante.json`)
 * and recomputes `authorshipHash` for THAT prosecutor. It is 100% local: it
 * does not touch the network.
 *
 * ⚠️ The result is sensitive material — see the `AuthorshipKeyExport` note.
 * One export per prosecutor: the `authorshipHash` depends on `prosecutorPk`,
 * so the package for prosecutor A does not verify against prosecutor B's
 * record.
 */
export const exportKey = (
  reportId: Bytes32Input,
  prosecutorPk: Bytes32Input,
  secretsPath?: string,
): AuthorshipKeyExport => {
  const idHex = asHex32(reportId, 'reportId');
  const idBytes = asBytes32(idHex, 'reportId');
  const pkBytes = asBytes32(prosecutorPk, 'prosecutorPk');

  const record = getReport(idHex, secretsPath);
  if (record === null) {
    throw new MissingReportSecretsError(idHex);
  }
  const secretBytes = asBytes32(record.reportSecret, 'reportSecret');

  return {
    version: 2,
    reportId: idHex,
    evidenceHash: record.evidenceHash,
    reportSecret: record.reportSecret,
    prosecutorPk: toHex(pkBytes),
    authorshipHash: toHex(pureCircuits.authorshipOf(secretBytes, idBytes, pkBytes)),
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
  if (o['version'] !== 2) {
    throw new InvalidExportError(
      `version ${String(o['version'])}, expected 2. The v1 format carried a ` +
        'global secret (insecure per H-3, docs/03 §3.4) and is not migrated.',
    );
  }
  const fields = ['reportId', 'evidenceHash', 'reportSecret', 'prosecutorPk', 'authorshipHash'] as const;
  for (const field of fields) {
    if (!isHex32(o[field])) {
      throw new InvalidExportError(`"${field}" is not a 64-char lowercase hex string`);
    }
  }
  return {
    version: 2,
    reportId: o['reportId'] as Hex32,
    evidenceHash: o['evidenceHash'] as Hex32,
    reportSecret: o['reportSecret'] as Hex32,
    prosecutorPk: o['prosecutorPk'] as Hex32,
    authorshipHash: o['authorshipHash'] as Hex32,
  };
};

/**
 * B3.6 — `verifyAuthorship`.
 *
 * Two independent questions (see `VerificationResult`):
 *
 *  1. `ok`       — does the arithmetic close? `reportIdOf` and
 *                  `authorshipOf` are recomputed with the pure circuits. It
 *                  is the same C1 condition the `revealAuthorship` circuit
 *                  checks, run off-chain.
 *  2. `onLedger` — is that `authorshipHash` published on-chain?
 *
 * The ledger lookups use the RECOMPUTED values, not the ones declared in the
 * file. If someone copies a real `reportId` and `authorshipHash` from the
 * chain but invents the `reportSecret`, the recomputed values match nothing
 * and they get `ok: false, onLedger: false`. Trusting the declared fields
 * for the lookup would turn the "verifier" into a repeater of whatever the
 * file says.
 *
 * Without a `reader`, it queries the active network's indexer against the
 * `deployment.json` address. The simulator passes its own and exercises the
 * same code.
 */
export const verifyAuthorship = async (
  exported: AuthorshipKeyExport,
  reader?: LedgerReader,
): Promise<VerificationResult> => {
  const pkg = parseKeyExport(exported);

  const evBytes = asBytes32(pkg.evidenceHash, 'evidenceHash');
  const secBytes = asBytes32(pkg.reportSecret, 'reportSecret');
  const declaredId = asBytes32(pkg.reportId, 'reportId');
  const pkBytes = asBytes32(pkg.prosecutorPk, 'prosecutorPk');

  // Off-chain C1: does this secret + this evidence produce that report?
  const recomputedId = pureCircuits.reportIdOf(evBytes, secBytes);
  const reportIdMatches = toHex(recomputedId) === pkg.reportId;

  // The authorship is bound to THIS prosecutor's pk. Another pk, another hash.
  const recomputedAuthorship = pureCircuits.authorshipOf(secBytes, declaredId, pkBytes);
  const authorshipHashMatches = toHex(recomputedAuthorship) === pkg.authorshipHash;

  const ok = reportIdMatches && authorshipHashMatches;

  const source = reader ?? (await createReadOnlyReader());
  const ledger = await source.readLedger();
  const reportOnLedger = ledger.reports.member(recomputedId);
  const authorshipOnLedger = ledger.authorships.member(recomputedAuthorship);
  const onLedger = reportOnLedger && authorshipOnLedger;

  return {
    ok,
    onLedger,
    detail: describe({ ok, reportIdMatches, authorshipHashMatches, reportOnLedger, authorshipOnLedger }),
    checks: { reportIdMatches, authorshipHashMatches, reportOnLedger, authorshipOnLedger },
  };
};

/** Human-readable message. It is what `verify-authorship.ts` (B4.5) prints. */
const describe = (r: {
  ok: boolean;
  reportIdMatches: boolean;
  authorshipHashMatches: boolean;
  reportOnLedger: boolean;
  authorshipOnLedger: boolean;
}): string => {
  if (!r.reportIdMatches) {
    return 'the package\'s reportSecret does NOT reconstruct that reportId: whoever built it is not the author';
  }
  if (!r.authorshipHashMatches) {
    return 'the declared authorshipHash does not match the one derived from (secret, reportId, prosecutorPk): tampered package';
  }
  if (!r.reportOnLedger) {
    return 'the arithmetic closes, but that report is not sealed on the ledger';
  }
  if (!r.authorshipOnLedger) {
    return (
      'the arithmetic closes and the report exists, but the authorship is NOT published ' +
      'for this prosecutorPk (the on-chain authorship is bound to another recipient\'s key)'
    );
  }
  return 'authorship verified: the package is consistent and the hash is published on-chain for this prosecutorPk';
};
