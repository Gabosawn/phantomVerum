/**
 * B3 — Typed API errors.
 *
 * ── Why map by message and not by class ─────────────────────────────────
 * Compact `assert`s do not travel as error classes: the runtime raises them
 * as a generic error whose message contains the literal text of the `assert`
 * in the `.compact`. There is no code or tag to query. So the mapping is by
 * text fragment, and the fragments in `CONTRACT_MESSAGES` are copied one by
 * one from `contracts/src/testigo.compact`.
 *
 * That makes it fragile to a rewording in the contract, which is why
 * `contracts/src/testigo.compact` is the source: if someone rewrites an
 * `assert`, the B3 selftest (`selftest-simulator.ts`) fails on the matching
 * negative case instead of silently degrading to `CircuitError`. It is
 * deliberate that the test covers the 3 negatives of the acceptance
 * criteria.
 *
 * ── "Proof time, no tx" ─────────────────────────────────────────────────
 * `InvalidCredentialError`, `RepeatedNullifierError` and `NotTheAuthorError`
 * must fire BEFORE a transaction is submitted — a plan requirement (§3.1),
 * not a preference. It holds because midnight-js runs the circuit LOCALLY to
 * build the transcript before proving and before submitting: a failing
 * `assert` stops there, spending no proving and touching no network.
 *
 * The counter-proof is `TxRejectedError`: it wraps a `CallTxFailedError` /
 * `DeployTxFailedError`, which by definition are txs that WERE submitted and
 * the chain rejected. If a negative case ever comes out through there
 * instead of through the proof-time errors, the property broke and the error
 * type gives it away.
 */
import {
  CallTxFailedError,
  DeployTxFailedError,
  TxFailedError,
} from '@midnight-ntwrk/midnight-js-contracts';

import type { TestigoCircuitId } from '../config/providers.js';

/** Base of every Testigo domain error. */
export class TestigoError extends Error {
  constructor(
    message: string,
    /** Circuit where it originated, if applicable. */
    readonly circuit?: TestigoCircuitId,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

/**
 * The credential does not prove membership in the organization.
 *
 * Covers THREE situations that are deliberately indistinguishable (rule 4 of
 * H-5, docs/03 §3.4): no credential is loaded, the credential belongs to
 * another org, or the credential exists but was not issued into the tree
 * yet. Distinguishing them would turn the error into an
 * organization-membership oracle.
 *
 * Fires at PROOF TIME, without submitting a transaction.
 */
export class InvalidCredentialError extends TestigoError {}

/**
 * Already reported this epoch with this credential (the nullifier is
 * burned).
 *
 * It is the contract's anti-spam. Fires at PROOF TIME, no tx submitted.
 */
export class RepeatedNullifierError extends TestigoError {}

/**
 * The `reportSecret` used to claim the authorship does not reconstruct that
 * `reportId`.
 *
 * Fires at PROOF TIME, no tx submitted — and, when the local store suffices
 * to know it, even BEFORE the proving: `stageStoredReport(ps, record,
 * expectedId)` does the same check with a hash and saves ~30 s of proof.
 */
export class NotTheAuthorError extends TestigoError {}

/** The requested `period` is not the current epoch per the chain's clock. */
export class InvalidPeriodError extends TestigoError {}

/** The organization was already registered (idempotence guard). */
export class OrganizationAlreadyRegisteredError extends TestigoError {}

/** The organization is not registered: credentials cannot be issued for it. */
export class OrganizationNotRegisteredError extends TestigoError {}

/** That report was already sealed (re-submission of an identical tx). */
export class ReportAlreadySealedError extends TestigoError {}

/** Tried to reveal the authorship of a report that is not on the ledger. */
export class ReportDoesNotExistError extends TestigoError {}

/** The authorship of that report was already revealed to that prosecutor. */
export class AuthorshipAlreadyRevealedError extends TestigoError {}

/**
 * The transaction was submitted and the chain rejected it.
 *
 * Different from all of the above: here a tx DID happen. If a business
 * negative (invalid credential, repeated nullifier, someone else's secret)
 * arrives through this path, the "fails at proof time without submitting a
 * tx" property broke.
 */
export class TxRejectedError extends TestigoError {
  constructor(
    readonly txCause: TxFailedError,
    circuit?: TestigoCircuitId,
  ) {
    super(
      `the chain rejected the "${circuit ?? 'unknown'}" transaction: ` +
        `status=${String(txCause.finalizedTxData.status)} ` +
        `txId=${String(txCause.finalizedTxData.txId)}`,
      circuit,
      { cause: txCause },
    );
  }
}

/** Circuit failure matching no known case. The original is preserved. */
export class CircuitError extends TestigoError {}

/**
 * Literal fragments from `contracts/src/testigo.compact` and from the B2
 * witness errors. Order matters: evaluated top to bottom, first match wins.
 */
const CONTRACT_MESSAGES: readonly {
  readonly fragment: string;
  readonly create: (msg: string, circuit?: TestigoCircuitId, cause?: unknown) => TestigoError;
}[] = [
  // ── report ──
  {
    // `credentialPath` witness (B2): the leaf is not in the tree.
    fragment: 'credential not issued for this org',
    create: (m, c, e) => new InvalidCredentialError(m, c, { cause: e }),
  },
  {
    // in-circuit assert: the `checkRoot` did not close.
    fragment: 'credential does not belong to the organization',
    create: (m, c, e) => new InvalidCredentialError(m, c, { cause: e }),
  },
  {
    fragment: 'already reported this period',
    create: (m, c, e) => new RepeatedNullifierError(m, c, { cause: e }),
  },
  {
    fragment: 'report already sealed',
    create: (m, c, e) => new ReportAlreadySealedError(m, c, { cause: e }),
  },
  {
    fragment: 'period not started yet',
    create: (m, c, e) => new InvalidPeriodError(m, c, { cause: e }),
  },
  {
    fragment: 'period already over',
    create: (m, c, e) => new InvalidPeriodError(m, c, { cause: e }),
  },
  // ── revealAuthorship ──
  {
    fragment: 'not the author',
    create: (m, c, e) => new NotTheAuthorError(m, c, { cause: e }),
  },
  {
    // B2 local pre-check: the stored secrets do not give that reportId.
    // Same condition as the circuit's C1, caught before proving.
    fragment: 'stored secrets do not reconstruct that report',
    create: (m, c, e) => new NotTheAuthorError(m, c, { cause: e }),
  },
  {
    fragment: 'report does not exist',
    create: (m, c, e) => new ReportDoesNotExistError(m, c, { cause: e }),
  },
  {
    fragment: 'authorship already revealed to this prosecutor',
    create: (m, c, e) => new AuthorshipAlreadyRevealedError(m, c, { cause: e }),
  },
  // ── registration / issuance ──
  {
    fragment: 'organization already registered',
    create: (m, c, e) => new OrganizationAlreadyRegisteredError(m, c, { cause: e }),
  },
  {
    fragment: 'organization not registered',
    create: (m, c, e) => new OrganizationNotRegisteredError(m, c, { cause: e }),
  },
];

/**
 * Joins the error's message with those of its whole `cause` chain.
 *
 * Needed because midnight-js wraps runtime failures: the `assert` text can
 * sit two or three levels deep. An `includes` over the outermost layer's
 * message would not find it.
 */
export const chainedMessages = (error: unknown, depth = 8): string => {
  const parts: string[] = [];
  let current: unknown = error;
  for (let i = 0; i < depth && current !== null && current !== undefined; i += 1) {
    if (current instanceof Error) {
      parts.push(current.message);
      current = (current as { cause?: unknown }).cause;
    } else if (typeof current === 'string') {
      parts.push(current);
      current = undefined;
    } else if (typeof current === 'object') {
      const obj = current as { message?: unknown; cause?: unknown };
      if (typeof obj.message === 'string') parts.push(obj.message);
      current = obj.cause;
    } else {
      parts.push(String(current));
      current = undefined;
    }
  }
  return parts.join(' | ');
};

/**
 * Translates a circuit failure to the matching typed error.
 *
 * If the error already is a `TestigoError` it is returned as-is (idempotent:
 * the layer above can map without fear of double-wrapping).
 */
export const mapCircuitError = (
  error: unknown,
  circuit?: TestigoCircuitId,
): TestigoError => {
  if (error instanceof TestigoError) {
    return error;
  }

  // A tx the chain rejected is NOT a proof-time failure. It is marked as
  // such so a negative case arriving through here is evident.
  if (error instanceof CallTxFailedError || error instanceof DeployTxFailedError) {
    return new TxRejectedError(error, circuit);
  }
  if (error instanceof TxFailedError) {
    return new TxRejectedError(error, circuit);
  }

  const text = chainedMessages(error);
  for (const { fragment, create } of CONTRACT_MESSAGES) {
    if (text.includes(fragment)) {
      return create(text, circuit, error);
    }
  }
  return new CircuitError(text === '' ? String(error) : text, circuit, { cause: error });
};

/** `true` if the error means "no transaction was submitted". */
export const failedAtProofTime = (error: unknown): boolean =>
  error instanceof TestigoError && !(error instanceof TxRejectedError);
