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
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { TestigoApi, connectContract, connectSimulator } from '../api/testigo.js';
import type { SimulatorExecutor } from '../api/executor-simulator.js';
import type { TxResult } from '../api/types.js';
import { type Hex32, toHex, randomBytes32, isHex32 } from '../witnesses/hex.js';
import { organizationId, pureCircuits } from '../witnesses/index.js';
import { ensureIssuerSecret, requireIssuerSecret, saveIssuerSecret } from './issuer-keystore.js';

/** The anonymity floor the contract enforces, read from the contract itself. */
const minAnonymitySet = (): bigint => pureCircuits.minAnonymitySet();

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
  const scratch = mkdtempSync(path.join(tmpdir(), 'testigo-cli-'));
  const secretsPath =
    process.env['TESTIGO_SECRETS'] ?? path.join(scratch, 'denunciante.json');
  // The ISSUER keystore gets the same throwaway treatment as the
  // whistleblower store: a simulator run must never write a key into the real
  // `secrets/issuer-keys.json`, where it would masquerade as the key of an org
  // that exists on-chain. Set before any script calls `bootstrapIssuerSecret`.
  if ((process.env['TESTIGO_ISSUER_KEYS'] ?? '') === '') {
    process.env['TESTIGO_ISSUER_KEYS'] = path.join(scratch, 'issuer-keys.json');
  }
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

/* ── Simulator-only demo bootstrap ─────────────────────────────────────────
 * Performs the acts PRIOR to the one each script demonstrates, so every script
 * runs with zero infrastructure. On the network these already happened in
 * previous invocations.
 */

/**
 * The issuer secret for an org already registered on this machine.
 *
 * C-1 FIX (audit 2026-08-09). This used to be
 * `sha256("phantomtrace:demo-issuer:v1:" + orgId)` — derived from a PUBLIC
 * value, so anyone reading the chain could recompute it and mint credentials
 * under any org registered with the shipped tooling, Preview included. The
 * reason it was derived was that `register-org` and `issue-credential` are
 * separate processes that must agree on the same secret; the answer to that is
 * persistence, not public derivability. See `issuer-keystore.ts`.
 *
 * Still a demo (declared limitation): a 0600 file is not a vault, and the real
 * issuer is a signing corporate directory rather than this CLI.
 */
export const bootstrapIssuerSecret = (orgId: Hex32): Hex32 => ensureIssuerSecret(orgId);

/**
 * Registers a fresh organization and returns the orgId it was given.
 *
 * H-2 FIX: the caller no longer picks an orgId. The secret comes first and the
 * id is `orgIdOf(secret)` — an id nobody can derive is an id nobody can squat.
 */
export const bootstrapOrg = async (backend: CliBackend): Promise<Hex32> => {
  const issuerSecret = toHex(randomBytes32());
  const orgId = toHex(organizationId(issuerSecret));
  saveIssuerSecret(orgId, issuerSecret);
  await backend.api.registerOrganization({ issuerSecret });
  console.log(`(setup)  : organization ${orgId.slice(0, 16)}… registered`);
  return orgId;
};

/**
 * Issues the whistleblower's own credential, plus enough others to clear the
 * anonymity floor.
 *
 * H-1: `report` refuses to run while the tree holds fewer than
 * `minAnonymitySet()` credentials, because a membership proof against a tree
 * of three names one of three people. A demo that issued a single credential
 * and reported would now fail that assert — correctly. The filler credentials
 * ARE the crowd, and issuing them in one batch is also the operational
 * mitigation the floor cannot provide by itself.
 *
 * The floor is read from the contract rather than hardcoded here, so the two
 * cannot drift apart.
 */
export const bootstrapCredential = async (
  backend: CliBackend,
  orgId: Hex32,
): Promise<void> => {
  const issuerSecret = requireIssuerSecret(orgId);

  const credential = await backend.api.prepareLocalCredential(orgId);
  await backend.api.issueCredential({
    orgId,
    credCommitment: credential.credCommitment,
    issuerSecret,
  });
  console.log(`(setup)  : credential issued (commitment ${credential.credCommitment.slice(0, 16)}…)`);

  const floor = Number(minAnonymitySet());
  const crowd = Math.max(0, floor - 1);
  for (let i = 0; i < crowd; i += 1) {
    await backend.api.issueCredential({
      orgId,
      credCommitment: toHex(randomBytes32()),
      issuerSecret,
    });
  }
  if (crowd > 0) {
    console.log(`(setup)  : ${crowd} more credentials issued to reach the anonymity floor of ${floor}`);
  }
};

/** Releases wallet/LevelDB handles in network mode; no-op on the simulator. */
export const closeBackend = async (backend: CliBackend): Promise<void> => {
  await backend.api.close();
};
