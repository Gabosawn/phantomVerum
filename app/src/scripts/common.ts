/**
 * B4 — Shared plumbing for the CLI scripts.
 *
 * Every script runs against the SIMULATOR by default (zero infrastructure:
 * no network, no proof server, no tDUST) and against the active network with
 * `--network` (or `TESTIGO_MODE=network`). The network flavor keeps the
 * existing switches: `NETWORK=preview|local` picks the environment and
 * `deployment.json` provides the contract address (docs/03 §3.2).
 *
 * In simulator mode the world is in-memory and throwaway, so the secrets
 * store goes to a temp directory (unless `TESTIGO_SECRETS` overrides it):
 * a demo run must never overwrite the whistleblower's real secrets.
 */
import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { TestigoApi, connectContract, connectSimulator } from '../api/testigo.js';
import type { SimulatorExecutor } from '../api/executor-simulator.js';
import type { TxResult } from '../api/types.js';
import { type Hex32, toHex, randomBytes32, isHex32 } from '../witnesses/hex.js';

export type CliMode = 'simulator' | 'network';

export interface CliArgs {
  readonly mode: CliMode;
  /** `--key value` and bare `--flag` options. */
  readonly flags: ReadonlyMap<string, string | true>;
  /** Everything that is not a flag, in order. */
  readonly positional: readonly string[];
}

/** Tiny flag parser: `--key value`, `--key=value`, `--flag`, positional. */
export const parseArgs = (argv: readonly string[] = process.argv.slice(2)): CliArgs => {
  const flags = new Map<string, string | true>();
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const body = arg.slice(2);
    const eq = body.indexOf('=');
    if (eq !== -1) {
      flags.set(body.slice(0, eq), body.slice(eq + 1));
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(body, next);
      i += 1;
    } else {
      flags.set(body, true);
    }
  }
  const mode: CliMode =
    flags.has('network') || process.env['TESTIGO_MODE'] === 'network'
      ? 'network'
      : 'simulator';
  return { mode, flags, positional };
};

/** The connected API plus the simulator handle when there is one. */
export interface CliBackend {
  readonly api: TestigoApi;
  readonly mode: CliMode;
  /** Only present in simulator mode (lets a script move the clock). */
  readonly executor?: SimulatorExecutor;
}

/**
 * Connects the backend the CLI asked for.
 *
 * Simulator: fresh in-memory contract + throwaway secrets store.
 * Network: `connectContract()` — NETWORK env + `deployment.json`, real store.
 */
export const createBackend = async (args: CliArgs): Promise<CliBackend> => {
  if (args.mode === 'network') {
    const api = await connectContract();
    return { api, mode: 'network' };
  }
  const secretsPath =
    process.env['TESTIGO_SECRETS'] ??
    path.join(mkdtempSync(path.join(tmpdir(), 'testigo-cli-')), 'denunciante.json');
  const { api, executor } = connectSimulator({ secretsPath });
  return { api, mode: 'simulator', executor };
};

/** Validates a 64-hex argument, or generates a random one when absent. */
export const hexArgOrRandom = (value: string | undefined, field: string): Hex32 => {
  if (value === undefined) return toHex(randomBytes32());
  if (!isHex32(value)) {
    return fatal(`"${field}" must be 64 lowercase hex chars (got: ${value})`);
  }
  return value;
};

/** Validates a required 64-hex argument. */
export const requireHexArg = (value: string | undefined, field: string): Hex32 => {
  if (value === undefined || !isHex32(value)) {
    return fatal(`"${field}" is required and must be 64 lowercase hex chars`);
  }
  return value;
};

export const fatal = (message: string): never => {
  console.error(`error: ${message}`);
  process.exit(1);
};

export const printMode = (backend: CliBackend): void => {
  console.log(
    backend.mode === 'simulator'
      ? `mode     : simulator (in-memory contract ${backend.api.contractAddress.slice(0, 16)}…)`
      : `mode     : network (contract ${backend.api.contractAddress})`,
  );
};

export const printTx = (tx: TxResult): void => {
  console.log(`tx       : ${tx.txId}${tx.simulated === true ? ' (simulated)' : ''}`);
  if (tx.blockHeight !== undefined) console.log(`block    : ${tx.blockHeight}`);
};

/**
 * Simulator-only demo bootstrap: performs the acts PRIOR to the one the
 * script demonstrates, so each script is runnable with zero infrastructure.
 * On the network these steps already happened in previous invocations.
 */
/**
 * Demo issuer secret for an org, derived deterministically from the orgId.
 *
 * The scripts run one at a time and share no state, so `register-org` and
 * `issue-credential` have to arrive at the SAME secret independently or the
 * anchor check rejects the issuance. A real issuer keeps this in a vault; for
 * the simulator and the demo, reproducible is exactly what is wanted.
 *
 * ⚠️ SECURITY (declared limitation, audit 2026-08-09): this secret is derived
 * from `orgId`, which is PUBLIC (both `registerOrganization` and
 * `issueCredential` disclose it on-chain). So anyone who reads the chain can
 * recompute `sha256("phantomtrace:demo-issuer:v1:" + orgId)`, pass the contract's
 * `anchorOf(issuerSecret()) == lookup(orgId)` check, and mint credentials under
 * that org. The contract's issuer authentication is real; this DEMO derivation
 * makes it public-grade. `issue-credential.ts` and `register-org.ts` use this in
 * `--network` mode too, so orgs registered by the shipped tooling (incl. on
 * Preview) are NOT protected. A production issuer must generate this with
 * `randomBytes32()` and keep it secret. See README "Known limitations".
 */
export const bootstrapIssuerSecret = (orgId: Hex32): Hex32 =>
  createHash('sha256').update(`phantomtrace:demo-issuer:v1:${orgId}`).digest('hex') as Hex32;

export const bootstrapOrg = async (
  backend: CliBackend,
  orgId: Hex32,
  issuerSecret: Hex32,
): Promise<void> => {
  await backend.api.registerOrganization({ orgId, issuerSecret });
  console.log(`(setup)  : organization ${orgId.slice(0, 16)}… registered`);
};

export const bootstrapCredential = async (
  backend: CliBackend,
  orgId: Hex32,
): Promise<void> => {
  const credential = await backend.api.prepareLocalCredential(orgId);
  await backend.api.issueCredential({
    orgId,
    credCommitment: credential.credCommitment,
    issuerSecret: bootstrapIssuerSecret(orgId),
  });
  console.log(`(setup)  : credential issued (commitment ${credential.credCommitment.slice(0, 16)}…)`);
};

/** Releases wallet/LevelDB handles in network mode; no-op on the simulator. */
export const closeBackend = async (backend: CliBackend): Promise<void> => {
  await backend.api.close();
};
