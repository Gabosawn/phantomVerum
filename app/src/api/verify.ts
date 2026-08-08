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
import type {
  Bytes32Input,
  AuthorshipKeyExport,
  AuthorshipVerdict,
  VerificationResult,
} from './types.js';

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
 * One export per prosecutor: `authorshipHash` depends on `prosecutorPk`, so
 * the package for prosecutor A does not verify against prosecutor B's record.
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
  const authorshipHash = toHex(pureCircuits.authorshipOf(secretBytes, idBytes, pkBytes));

  return {
    version: 2,
    reportId: idHex,
    evidenceHash: record.evidenceHash,
    prosecutorPk: toHex(pkBytes),
    authorshipHash,
    // Demo build: `proveAuthorship` returns exactly this hash, so the
    // stand-in is the hash itself. Production replaces it with the proof
    // bytes from the proof server — the shape of the package does not change.
    proof: authorshipHash,
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
      `version ${String(o['version'])}, expected 2. The v1 format carried the ` +
        'reportSecret in the file (docs/03 §3.4) and is not migrated: a v1 ' +
        'package should be treated as a leaked secret, not as an input.',
    );
  }
  const fields = ['reportId', 'evidenceHash', 'prosecutorPk', 'authorshipHash', 'proof'] as const;
  for (const field of fields) {
    if (!isHex32(o[field])) {
      throw new InvalidExportError(`"${field}" is not a 64-char lowercase hex string`);
    }
  }
  // A v2 file has no business carrying a secret. If one shows up, the sender
  // is running an old build and has just leaked it — say so instead of
  // silently dropping the field.
  if (o['reportSecret'] !== undefined) {
    throw new InvalidExportError(
      'the package declares version 2 but still carries a "reportSecret" field. ' +
        'That secret is now compromised: whoever produced this file must treat ' +
        'the report as burned and stop using that build.',
    );
  }
  return {
    version: 2,
    reportId: o['reportId'] as Hex32,
    evidenceHash: o['evidenceHash'] as Hex32,
    prosecutorPk: o['prosecutorPk'] as Hex32,
    authorshipHash: o['authorshipHash'] as Hex32,
    proof: o['proof'] as Hex32,
  };
};

/**
 * B3.6 — `verifyAuthorship`.
 *
 * `verifierPk` is the key of whoever is running the verification, and it is a
 * SEPARATE argument from the package on purpose. The package declares who it
 * was addressed to; the question to answer is whether that matches the person
 * asking. Reading the recipient out of the file — the shape this function had
 * while the secret travelled with it — lets anyone who intercepts the file
 * designate themselves, and the answer comes back ✅.
 *
 * Two independent questions (see `VerificationResult`):
 *
 *  1. `verdict`  — what can be concluded: `verified`, `refuted` or
 *                  `unavailable`. See `AuthorshipVerdict`.
 *  2. `onLedger` — are the declared `reportId` and `authorshipHash` on-chain?
 *
 * FAIL-CLOSED. Every check that feeds a POSITIVE verdict has to be something
 * the verifier can establish without trusting the file. Right now none is:
 * `proof` is a copy of `authorshipHash` in this build, so comparing them is a
 * tautology over two attacker-supplied fields, and the ledger lookups use the
 * DECLARED values because without the secret there is nothing to recompute
 * them from. So this function can never return `verified` — it can only
 * refute. Concretely, these two attacks used to come back green and now come
 * back `refuted`/`unavailable`:
 *
 *  · An employer scrapes a `reportId` and an `authorshipHash` off the public
 *    ledger, writes their own key into `prosecutorPk`, and gets a verdict
 *    they can screenshot as "the whistleblower named me".
 *  · Mixing the `reportId` of one report with the `authorshipHash` of another
 *    passes every check, because nothing binds the two together.
 *
 * What closes this is the ZK binding: `proveAuthorship` attests that the
 * authorship hash was derived from a secret satisfying
 * `reportIdOf(evidenceHash, secret) == reportId`, with the prosecutor's key
 * as a public input. Verifying it needs the proof bytes and the circuit's
 * verifier key. Until that ships, `unavailable` is the honest ceiling.
 *
 * Without a `reader`, it queries the active network's indexer against the
 * `deployment.json` address. The simulator passes its own and exercises the
 * same code.
 */
export const verifyAuthorship = async (
  exported: AuthorshipKeyExport,
  verifierPk: Bytes32Input,
  reader?: LedgerReader,
): Promise<VerificationResult> => {
  const pkg = parseKeyExport(exported);

  const declaredId = asBytes32(pkg.reportId, 'reportId');
  const declaredAuthorship = asBytes32(pkg.authorshipHash, 'authorshipHash');

  // Read the chain BEFORE deciding anything. The old order computed the
  // verdict from the file alone and consulted the ledger afterwards, which
  // meant the answer never depended on the chain at all.
  const source = reader ?? (await createReadOnlyReader());
  const ledger = await source.readLedger();
  const reportOnLedger = ledger.reports.member(declaredId);
  const authorshipOnLedger = ledger.authorships.member(declaredAuthorship);
  const onLedger = reportOnLedger && authorshipOnLedger;

  // Addressed to me, or to somebody else? This is the EMPLOYER ❌ of the
  // video, and it is a genuine refutation: the hash on-chain was computed for
  // some other key, so it is not addressed to whoever is asking.
  const designatedToVerifier = toHex(asBytes32(verifierPk, 'verifierPk')) === pkg.prosecutorPk;

  // Asymmetric on purpose, and the asymmetry IS the fail-closed principle.
  // This build ships no verifier for `proveAuthorship`, so a proof can never
  // be CONFIRMED here — `null`, never `true`. It can still be REJECTED:
  // `exportKey` writes `proof = authorshipHash`, so a package where the two
  // differ did not come from this build. Rejecting on attacker-supplied data
  // is safe (nobody gains by malforming their own package); accepting the
  // equality as evidence is not, since both fields come from whoever handed
  // over the file — which is exactly the tautology this replaced.
  const proofVerified: boolean | null = pkg.proof === pkg.authorshipHash ? null : false;

  const checks = { proofVerified, designatedToVerifier, reportOnLedger, authorshipOnLedger };
  return { verdict: decide(checks), onLedger, detail: describe(checks), checks };
};

/** The individual checks a verdict is derived from. */
interface Checks {
  readonly proofVerified: boolean | null;
  readonly designatedToVerifier: boolean;
  readonly reportOnLedger: boolean;
  readonly authorshipOnLedger: boolean;
}

/**
 * Maps the checks onto a verdict, fail-closed.
 *
 * `verified` requires `proofVerified === true`. Nothing else can produce it —
 * in particular, the absence of a refutation cannot.
 */
const decide = (r: Checks): AuthorshipVerdict => {
  if (r.proofVerified === false) return 'refuted';
  if (!r.designatedToVerifier) return 'refuted';
  if (!r.reportOnLedger || !r.authorshipOnLedger) return 'refuted';
  return r.proofVerified === true ? 'verified' : 'unavailable';
};

/** Human-readable message. It is what `verify-authorship.ts` (B4.5) prints. */
const describe = (r: Checks): string => {
  if (r.proofVerified === false) {
    return 'the authorship proof does not verify against the circuit: tampered package';
  }
  if (!r.designatedToVerifier) {
    return (
      'this package was addressed to ANOTHER key. The authorship may well be genuine — ' +
      'it was simply not revealed to you, and nothing here proves anything to you'
    );
  }
  if (!r.reportOnLedger) {
    return 'the package is addressed to you, but that report is not sealed on the ledger';
  }
  if (!r.authorshipOnLedger) {
    return (
      'the package is addressed to you and the report exists, but the authorship was ' +
      'never published on-chain for your key'
    );
  }
  if (r.proofVerified === null) {
    return (
      'NOT VERIFIABLE IN THIS BUILD. The report is sealed on the ledger and an authorship ' +
      'is published for the key this package names — but nothing here ties the two to the ' +
      'author. The `proof` field is a copy of `authorshipHash`, and both come from whoever ' +
      'handed you the file, so anyone who read those two values off the public ledger could ' +
      'have produced this package. Establishing authorship needs the proveAuthorship proof ' +
      'checked against the circuit verifier key.'
    );
  }
  return 'authorship verified: the proof checks out and the hash is published on-chain';
};
