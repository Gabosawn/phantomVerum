/**
 * B3.2–B3.5 + B3.8 — The Testigo API (signatures frozen in docs/03 §3.1).
 *
 * Everything here is written against `TestigoExecutor`, so it is THE SAME
 * code on the simulator and against the network. The only thing that changes
 * is which executor is injected.
 */
import { epochOfSeconds } from '../witnesses/epoch.js';
import { hashEvidenceFile, hashEvidenceBytes } from '../witnesses/evidence.js';
import { type Hex32, toHex, asBytes32, asHex32 } from '../witnesses/hex.js';
import {
  type TestigoPrivateState,
  credentialCommitment,
  withCredential,
  withIssuerSecret,
  issuerAnchor,
  organizationId,
  clearActiveReport,
  pureCircuits,
  stageNonce,
  stageStoredReport,
  stageNewReport,
} from '../witnesses/index.js';
import {
  addReport,
  setLeafIndex,
  readOrCreateSecrets,
  getReport,
} from '../witnesses/secrets.js';

import type { TestigoExecutor } from './executor.js';
import { SimulatorExecutor, type SimulatorOptions } from './executor-simulator.js';
import { NetworkExecutor, type NetworkOptions } from './executor-network.js';
import { InvalidCredentialError, mapCircuitError } from './errors.js';
import { readLedgerState } from './ledger.js';
import type {
  Bytes32Input,
  LedgerState,
  AuthorshipKeyExport,
  ReportParams,
  IssueCredentialParams,
  RegisterOrganizationParams,
  RevealAuthorshipParams,
  ReportResult,
  IssueCredentialResult,
  RevealAuthorshipResult,
  VerificationResult,
  TxResult,
} from './types.js';
import { MissingReportSecretsError, exportKey, verifyAuthorship } from './verify.js';

export interface ApiConfig {
  /**
   * Path of the secrets store. Defaults to `secrets/denunciante.json`
   * (or `TESTIGO_SECRETS`). Tests override it so they never touch the real
   * secrets.
   */
  readonly secretsPath?: string;
  /**
   * Persist each report's secrets in the local store. Default `true`.
   *
   * Turning it off is almost always a mistake: without the stored
   * `reportSecret`, that report is left with NO way to reveal authorship,
   * forever. It exists only for inspection flows that must not write to
   * disk.
   */
  readonly persistSecrets?: boolean;
}

/** Client-side prepared credential (local half of B3.3). */
export interface LocalCredential {
  /** The ONLY thing handed to the issuer. */
  readonly credCommitment: Hex32;
  /** Stays on the whistleblower's machine. The issuer never sees it (H-4). */
  readonly credentialSecret: Hex32;
  readonly orgId: Hex32;
}

export class TestigoApi {
  constructor(
    readonly executor: TestigoExecutor,
    private readonly config: ApiConfig = {},
  ) {}

  get contractAddress(): string {
    return this.executor.contractAddress;
  }

  get mode(): 'simulator' | 'network' {
    return this.executor.mode;
  }

  /**
   * Current epoch according to the clock this executor sees.
   *
   * Computed against `executor.nowSeconds()` and not against `Date.now()`
   * because it is the same clock that `blockTimeGte`/`blockTimeLt` will
   * validate.
   */
  currentPeriod(): bigint {
    return epochOfSeconds(this.executor.nowSeconds());
  }

  // ── B3.2 ──────────────────────────────────────────────────────────────

  /**
   * Registers an organization: publishes the anchor of its issuer secret under
   * the orgId that same secret derives.
   *
   * Registration is PERMISSIONLESS — anyone can create their own organization —
   * but since the H-2 fix it is no longer SQUATTABLE. Both public arguments are
   * derived from the issuer secret and asserted in-circuit, so the id you can
   * register is the one you hold the key for. Taking the label a real
   * organization was about to use, and denying it permanently on an immutable
   * contract, is no longer possible.
   */
  async registerOrganization(p: RegisterOrganizationParams): Promise<TxResult> {
    const issuerSecret = asBytes32(p.issuerSecret, 'issuerSecret');
    const orgId = organizationId(issuerSecret);
    const anchor = issuerAnchor(issuerSecret);

    // A supplied orgId is a cross-check, not an input: rejecting it here names
    // the problem, where the circuit would only report a failed constraint.
    if (p.orgId !== undefined) {
      const claimed = asBytes32(p.orgId, 'orgId');
      if (toHex(claimed) !== toHex(orgId)) {
        throw new Error(
          `orgId ${toHex(claimed)} is not derived from this issuer secret ` +
            `(expected ${toHex(orgId)}). Since the H-2 fix an orgId is not ` +
            'chosen but derived — build it with `organizationId(issuerSecret)`.',
        );
      }
    }

    try {
      return await this.executor.call('registerOrganization', orgId, anchor);
    } catch (error) {
      throw mapCircuitError(error, 'registerOrganization');
    }
  }

  // ── B3.3 ──────────────────────────────────────────────────────────────

  /**
   * CLIENT half of the issuance: generates (or recovers) the local
   * `credentialSecret` and returns only the commitment.
   *
   * SECURITY (H-4, docs/03 §3.4): the secret is generated here, on the
   * whistleblower's machine, and never leaves it. The issuer is given
   * `credCommitment`. If the issuer generated the secret it could recompute
   * `nullifierOf(credSecret, period)` for any employee and learn who
   * reported in each period.
   *
   * It also leaves the credential loaded in the private state, which is
   * where the witnesses read it from.
   */
  async prepareLocalCredential(orgId: Bytes32Input): Promise<LocalCredential> {
    const orgBytes = asBytes32(orgId, 'orgId');
    const secrets = readOrCreateSecrets(orgBytes, this.config.secretsPath);

    const ps = await this.executor.readPrivateState();
    const withCred = withCredential(ps, secrets.credentialSecret, secrets.orgId);
    await this.executor.writePrivateState(withCred);

    return {
      credCommitment: toHex(credentialCommitment(withCred)),
      credentialSecret: secrets.credentialSecret,
      orgId: secrets.orgId,
    };
  }

  /**
   * ISSUER half: inserts the leaf into the global tree.
   *
   * Receives the commitment, never the secret. The contract builds the leaf
   * IN-CIRCUIT with the `orgId` it just validated (`leafOf(orgId,
   * credCommitment)`), so a credential cannot be forged for an unregistered
   * org — that is the M-1 fix.
   *
   * `leafIndex` comes from `firstFree()` read BEFORE inserting: it is the
   * index the new leaf will occupy.
   */
  async issueCredential(p: IssueCredentialParams): Promise<IssueCredentialResult> {
    const orgId = asBytes32(p.orgId, 'orgId');
    const credCommitment = asBytes32(p.credCommitment, 'credCommitment');
    const issuer = asBytes32(p.issuerSecret, 'issuerSecret');

    // The witness reads it from here; the circuit asserts it against the
    // anchor the org published.
    const ps = await this.executor.readPrivateState();
    await this.executor.writePrivateState(withIssuerSecret(ps, issuer));

    const before = await this.executor.readLedger();
    const leafIndex = Number(before.credentials.firstFree());

    let tx: TxResult;
    try {
      tx = await this.executor.call('issueCredential', orgId, credCommitment);
    } catch (error) {
      throw mapCircuitError(error, 'issueCredential');
    }

    // The local store is touched only if the issued leaf is OURS. This
    // circuit is run by the issuer, who may be issuing for any employee:
    // writing someone else's leafIndex into our secrets file would simply
    // be wrong.
    await this.persistLeafIndexIfOurs(credCommitment, leafIndex);

    return { leafIndex, tx };
  }

  private async persistLeafIndexIfOurs(
    credCommitment: Uint8Array,
    leafIndex: number,
  ): Promise<void> {
    if (this.config.persistSecrets === false) return;
    const ps = await this.executor.readPrivateState();
    if (ps.credentialSecret === null) return;
    const ours = pureCircuits.credCommitmentOf(ps.credentialSecret);
    if (toHex(ours) !== toHex(credCommitment)) return;
    setLeafIndex(leafIndex, this.config.secretsPath);
  }

  // ── B3.4 ──────────────────────────────────────────────────────────────

  /**
   * Seals a report.
   *
   * Order of operations, and the order matters:
   *
   *  1. hash the evidence LOCALLY (the file does not leave the machine);
   *  2. generate a FRESH `reportSecret` and stage it in the private state
   *     (witnesses take no arguments: it is the only channel);
   *  3. **PERSIST the secret BEFORE submitting the tx**;
   *  4. only then call the circuit.
   *
   * Step 3 goes before step 4 on purpose. If the process dies between the
   * submit and the save, the report ends up sealed on-chain with its secret
   * lost — and without that secret NOBODY can ever claim its authorship.
   * Over-persisting (a report that ends up not sealed) costs a dead entry
   * in a JSON; under-persisting costs the report.
   *
   * Typed errors: `InvalidCredentialError` and `RepeatedNullifierError`,
   * both at proof time and with no transaction submitted.
   */
  async report(p: ReportParams): Promise<ReportResult> {
    const orgId = asBytes32(p.orgId, 'orgId');
    const evidenceHash = await hashEvidence(p.evidence);

    const ps = await this.executor.readPrivateState();

    // The witness looks the leaf up with the private state's orgId and the
    // circuit rebuilds it with the argument's orgId. If they differ, the
    // `checkRoot` fails anyway — closed — but with an error that says
    // nothing. This check is local and over the caller's own data: it is not
    // a membership oracle.
    if (ps.orgId !== null && toHex(ps.orgId) !== toHex(orgId)) {
      throw new InvalidCredentialError(
        `the loaded credential belongs to org ${toHex(ps.orgId)} and the ` +
          `report targets ${toHex(orgId)}`,
        'report',
      );
    }

    const { state, report } = stageNewReport(ps, evidenceHash);
    await this.executor.writePrivateState(state);

    // ⚠️ BEFORE the tx. See the comment above.
    if (this.config.persistSecrets !== false) {
      addReport(
        report.reportId,
        {
          reportSecret: report.reportSecret,
          evidenceHash: report.evidenceHash,
          period: p.period,
        },
        this.config.secretsPath,
      );
    }

    let tx: TxResult;
    try {
      tx = await this.executor.call('report', orgId, p.period);
    } catch (error) {
      // The report is taken out of focus so no "armed" secret is left that
      // a later call could use by mistake. The store record is NOT deleted:
      // if the tx actually did land, deleting it would lose the authorship.
      await this.executor.writePrivateState(clearActiveReport(state));
      throw mapCircuitError(error, 'report');
    }

    // The nullifier is recomputed locally with the same pure circuit the
    // contract used: for display and so the UI can cross-check it.
    const credentialSecret = state.credentialSecret;
    /* c8 ignore next */
    if (credentialSecret === null) {
      throw new InvalidCredentialError('no credential in the private state', 'report');
    }
    const nullifier = pureCircuits.nullifierOf(credentialSecret, p.period);

    await this.executor.writePrivateState(clearActiveReport(state));

    return {
      reportId: toHex(report.reportId),
      nullifier: toHex(nullifier),
      reportSecret: toHex(report.reportSecret),
      evidenceHash: toHex(report.evidenceHash),
      tx,
    };
  }

  // ── B3.5 ──────────────────────────────────────────────────────────────

  /**
   * Claims the authorship of a report before a prosecutor.
   *
   * Reads the `reportSecret` from the store and stages it.
   * `stageStoredReport` with the 3rd argument performs the SAME check as the
   * circuit's C1, but with a hash instead of a proof: if the store does not
   * reconstruct that `reportId` it fails instantly and saves ~30 s of
   * proving. It does not replace the circuit's `assert`, which is the one
   * that counts.
   *
   * Typed error: `NotTheAuthorError`, at proof time and with no tx
   * submitted.
   */
  async revealAuthorship(p: RevealAuthorshipParams): Promise<RevealAuthorshipResult> {
    const reportId = asBytes32(p.reportId, 'reportId');
    const prosecutorNonce = asBytes32(p.prosecutorNonce, 'prosecutorNonce');
    const idHex = asHex32(reportId, 'reportId');

    const record = getReport(idHex, this.config.secretsPath);
    if (record === null) {
      throw new MissingReportSecretsError(idHex);
    }

    const ps = await this.executor.readPrivateState();
    let staged: TestigoPrivateState;
    try {
      // The 3rd arg is the cheap local check. An inconsistent store exits
      // here as NotTheAuthorError, without touching the proof server.
      staged = stageNonce(stageStoredReport(ps, record, reportId), prosecutorNonce);
    } catch (error) {
      throw mapCircuitError(error, 'revealAuthorship');
    }
    await this.executor.writePrivateState(staged);

    let tx: TxResult;
    try {
      tx = await this.executor.call('revealAuthorship', reportId);
    } catch (error) {
      await this.executor.writePrivateState(clearActiveReport(staged));
      throw mapCircuitError(error, 'revealAuthorship');
    }

    // Recomputed with the same pure circuit the contract used. The
    // prosecutor can derive this themselves from the public reportId and
    // their own nonce — nothing secret is involved.
    const receipt = pureCircuits.receiptOf(reportId, prosecutorNonce);

    // As soon as it confirms, out of focus: no secret left ready to use.
    await this.executor.writePrivateState(clearActiveReport(staged));

    return { receipt: toHex(receipt), tx };
  }

  // ── B3.6 / B3.7 / B3.8 ────────────────────────────────────────────────

  /**
   * B3.6 — off-chain verification against the ledger this executor sees.
   *
   * `verifierPk` is the caller's own key, not the one inside the package:
   * the check is whether those two agree.
   */
  verifyAuthorship(p: AuthorshipKeyExport, verifierPk: Bytes32Input): Promise<VerificationResult> {
    return verifyAuthorship(p, verifierPk, this.executor);
  }

  /** B3.7 — public state of the contract, in the §3.1 shape. */
  readLedgerState(): Promise<LedgerState> {
    return readLedgerState(this.executor);
  }

  /** B3.8 — authorship key package for a prosecutor. 100% local. */
  exportKey(reportId: Bytes32Input, prosecutorPk: Bytes32Input): AuthorshipKeyExport {
    return exportKey(reportId, prosecutorPk, this.config.secretsPath);
  }

  /** Releases wallet and LevelDB, if the executor has anything to release. */
  async close(): Promise<void> {
    await this.executor.close?.();
  }
}

/** Hashes the evidence: in-memory bytes or a file via stream. */
const hashEvidence = async (
  evidence: ReportParams['evidence'],
): Promise<Uint8Array> => {
  if (evidence instanceof Uint8Array) {
    return hashEvidenceBytes(evidence);
  }
  // Via stream: a large piece of evidence (a scanned PDF, a mail dump) has
  // no reason to fit whole in memory.
  return hashEvidenceFile(evidence.filePath);
};

// ── B3.1 — construction ─────────────────────────────────────────────────

export interface DeployResult {
  readonly api: TestigoApi;
  readonly contractAddress: string;
  /** txId of the deploy. `undefined` if the executor does not report it. */
  readonly deployTxId: string | undefined;
}

/**
 * B3.1 — fresh deploy against the active network.
 *
 * Needs a seed WITH tDUST (`DEPLOY_SEED`). Does not write `deployment.json`:
 * that is done by the B5.1 deploy script, which also records the
 * `compilerVersion` read from the artifacts.
 */
export const deployContract = async (
  options: NetworkOptions & ApiConfig = {},
): Promise<DeployResult> => {
  const executor = await NetworkExecutor.deploy(options);
  return {
    api: new TestigoApi(executor, options),
    contractAddress: executor.contractAddress,
    deployTxId: executor.deployTxId,
  };
};

/**
 * B3.1 — connection to an already deployed contract.
 *
 * Without `contractAddress` it uses the one from `deployment.json` (§3.2:
 * the single source of the address). It is the path of the B5.4 re-connect
 * smoke and the one `ui/` and `tests/` will use.
 */
export const connectContract = async (
  contractAddress?: string,
  options: NetworkOptions & ApiConfig = {},
): Promise<TestigoApi> =>
  new TestigoApi(await NetworkExecutor.connect(contractAddress, options), options);

/**
 * Same API, against the local simulator: no network, no proof server, no
 * tDUST.
 *
 * It is what the B3 selftest uses and what lets B4/`tests/` run the full E2E
 * even if Preview is down (plan B of docs/03 §6).
 */
export const connectSimulator = (
  options: SimulatorOptions & ApiConfig = {},
): { api: TestigoApi; executor: SimulatorExecutor } => {
  const executor = new SimulatorExecutor(options);
  return { api: new TestigoApi(executor, options), executor };
};
