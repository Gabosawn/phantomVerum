/**
 * B3 — Entry point of the Testigo API.
 *
 * It is what the B4 CLI scripts, `ui/` (block C) and `tests/` (block D)
 * consume. The signatures are frozen in `docs/03-plan-ejecucion.md` §3.1.
 *
 * The two paths:
 *
 *     // against the active network (NETWORK=preview|local)
 *     const api = await connectContract();
 *
 *     // against the local simulator: no network, no proof server, no tDUST
 *     const { api } = connectSimulator();
 *
 * From there down the code is identical.
 */

// ── Main API ────────────────────────────────────────────────────────────
export {
  TestigoApi,
  type ApiConfig,
  type LocalCredential,
  type DeployResult,
  connectContract,
  connectSimulator,
  deployContract,
} from './testigo.js';

// ── Off-chain: verification and export (need no wallet nor proof server) ──
export {
  InvalidExportError,
  MissingReportSecretsError,
  exportKey,
  parseKeyExport,
  verifyAuthorship,
} from './verify.js';

// ── Ledger reading ──────────────────────────────────────────────────────
export {
  ContractNotFoundError,
  IndexerReader,
  createReadOnlyReader,
  ledgerFromState,
  readLedgerState,
  summarizeLedger,
  type ReadOnlyReaderOptions,
} from './ledger.js';

// ── Executors ───────────────────────────────────────────────────────────
export {
  type PrivateStateStore,
  type CircuitArgs,
  type TestigoCircuit,
  type TestigoExecutor,
  type LedgerReader,
} from './executor.js';
export {
  SimulatorExecutor,
  type SimulatorOptions,
  createSimulatorExecutor,
} from './executor-simulator.js';
export {
  NetworkExecutor,
  CONTRACT_TAG,
  type CompiledTestigoContract,
  type TestigoContract,
  type NetworkOptions,
  compileContract,
} from './executor-network.js';

// ── Typed errors ────────────────────────────────────────────────────────
export {
  AuthorshipAlreadyRevealedError,
  InvalidCredentialError,
  ReportDoesNotExistError,
  ReportAlreadySealedError,
  CircuitError,
  TestigoError,
  NotTheAuthorError,
  RepeatedNullifierError,
  OrganizationNotRegisteredError,
  OrganizationAlreadyRegisteredError,
  InvalidPeriodError,
  TxRejectedError,
  failedAtProofTime,
  mapCircuitError,
  chainedMessages,
} from './errors.js';

// ── Frozen types (§3.1 / §3.2) ──────────────────────────────────────────
export type {
  Bytes32Input,
  LedgerState,
  AuthorshipKeyExport,
  Hex32,
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

// ── B2 re-exports that B4 needs ─────────────────────────────────────────
// Re-exported here so the CLI scripts have a single import.
export { EPOCH_DURATION_SEC, currentEpoch, epochOfSeconds } from '../witnesses/epoch.js';
export { hashEvidenceFile, hashEvidenceBytes, evidenceSummary } from '../witnesses/evidence.js';
export { toBytes32, toHex, randomBytes32, asBytes32, asHex32, isHex32 } from '../witnesses/hex.js';
export { pureCircuits } from '../witnesses/index.js';
