/**
 * B1.2 — Address of the deployed contract.
 *
 * Format frozen in docs/03-plan-ejecucion.md §3.2:
 *
 *   { network, contractAddress, deployTxId, deployedAt, compilerVersion }
 *
 * `app/src/config/deployment.json` is the SINGLE source of the contract's
 * address: `ui/` and `tests/` read from here, never from a loose env var.
 * The file is committed (unlike `.env`, which never is).
 *
 * Before the deploy the file exists with every field set to `null`. That is
 * a valid, distinguishable state ("we have not deployed yet"), not a broken
 * file.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { isNetworkName, type NetworkName } from './networks.js';
import { deploymentJsonPath, zkConfigDirectory } from './paths.js';

/** A concrete deploy: every field present. */
export interface DeploymentRecord {
  /** Network deployed against. */
  readonly network: NetworkName;
  /** Contract address (hex, no `0x`). */
  readonly contractAddress: string;
  /** Identifier of the deploy transaction. */
  readonly deployTxId: string;
  /** ISO-8601 timestamp of the deploy. */
  readonly deployedAt: string;
  /** Version of the Compact compiler that generated the artifacts. */
  readonly compilerVersion: string;
}

/** The file on disk: same shape, with `null` while there is no deploy. */
export type DeploymentFile = {
  readonly [K in keyof DeploymentRecord]: DeploymentRecord[K] | null;
};

/** Placeholder written while there is no deploy yet. */
export const EMPTY_DEPLOYMENT: DeploymentFile = {
  network: null,
  contractAddress: null,
  deployTxId: null,
  deployedAt: null,
  compilerVersion: null,
};

/**
 * Path of `deployment.json`.
 *
 * ALWAYS points at the source file `app/src/config/deployment.json` — the
 * committed one — never at a copy in `dist/`. `DEPLOYMENT_FILE` overrides it.
 */
export const deploymentFilePath = deploymentJsonPath;

/** Format error of `deployment.json` — readable, with the path inside. */
export class DeploymentFormatError extends Error {
  constructor(path: string, detail: string) {
    super(`invalid deployment.json (${path}): ${detail}`);
    this.name = 'DeploymentFormatError';
  }
}

/** Does the file describe a real deploy (every field present)? */
export const isDeployed = (file: DeploymentFile): file is DeploymentRecord =>
  file.network !== null &&
  file.contractAddress !== null &&
  file.deployTxId !== null &&
  file.deployedAt !== null &&
  file.compilerVersion !== null;

const asNullableString = (value: unknown, field: string, path: string): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new DeploymentFormatError(path, `field "${field}" must be a string or null`);
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/** Validates and normalizes the raw JSON into a `DeploymentFile`. */
export const parseDeploymentFile = (raw: unknown, path: string): DeploymentFile => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new DeploymentFormatError(path, 'expected a JSON object');
  }
  const obj = raw as Record<string, unknown>;
  const network = asNullableString(obj.network, 'network', path);
  if (network !== null && !isNetworkName(network)) {
    throw new DeploymentFormatError(path, `unknown "network": ${network}`);
  }
  return {
    network,
    contractAddress: asNullableString(obj.contractAddress, 'contractAddress', path),
    deployTxId: asNullableString(obj.deployTxId, 'deployTxId', path),
    deployedAt: asNullableString(obj.deployedAt, 'deployedAt', path),
    compilerVersion: asNullableString(obj.compilerVersion, 'compilerVersion', path),
  };
};

/**
 * Reads `deployment.json`. If the file does not exist it returns the empty
 * placeholder: "we have not deployed yet" is not an I/O error.
 */
export const readDeploymentFile = async (
  env: NodeJS.ProcessEnv = process.env,
): Promise<DeploymentFile> => {
  const path = deploymentFilePath(env);
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return EMPTY_DEPLOYMENT;
    }
    throw error;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new DeploymentFormatError(path, `not parseable JSON (${String(error)})`);
  }
  return parseDeploymentFile(raw, path);
};

/** Returns the deploy if it exists, `null` if the file is still a placeholder. */
export const readDeployment = async (
  env: NodeJS.ProcessEnv = process.env,
): Promise<DeploymentRecord | null> => {
  const file = await readDeploymentFile(env);
  return isDeployed(file) ? file : null;
};

/**
 * Same as `readDeployment`, but blows up with an actionable message if there
 * is no contract yet. Used by the scripts that absolutely need the address.
 */
export const requireDeployment = async (
  env: NodeJS.ProcessEnv = process.env,
): Promise<DeploymentRecord> => {
  const deployment = await readDeployment(env);
  if (deployment === null) {
    throw new Error(
      `No deployed contract: ${deploymentFilePath(env)} is still a placeholder. ` +
        'Run the deploy script (B5.1) before this step.',
    );
  }
  return deployment;
};

/** Writes `deployment.json` (2 spaces + trailing newline, for clean diffs). */
export const writeDeploymentFile = async (
  file: DeploymentFile,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> => {
  const path = deploymentFilePath(env);
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
  return path;
};

/**
 * Records a deploy. `deployedAt` is filled in if not provided.
 * Returns the written path, so the script can print it.
 */
export const writeDeployment = async (
  record: Omit<DeploymentRecord, 'deployedAt'> & { readonly deployedAt?: string },
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ readonly path: string; readonly record: DeploymentRecord }> => {
  const complete: DeploymentRecord = {
    network: record.network,
    contractAddress: record.contractAddress,
    deployTxId: record.deployTxId,
    deployedAt: record.deployedAt ?? new Date().toISOString(),
    compilerVersion: record.compilerVersion,
  };
  const path = await writeDeploymentFile(complete, env);
  return { path, record: complete };
};

/** Resets the file to the placeholder (useful for the B5.4 re-deploy smoke). */
export const clearDeployment = async (
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> => writeDeploymentFile(EMPTY_DEPLOYMENT, env);

/**
 * Reads the compiler version from the real artifacts
 * (`contracts/output/compiler/contract-info.json`) instead of hardcoding it.
 *
 * The deploy (B5.1) must record the version that ACTUALLY generated the
 * keys: if the contract is recompiled with another compiler,
 * `deployment.json` must reflect it on its own.
 */
export const readCompilerVersion = async (
  zkConfigPath = zkConfigDirectory(),
): Promise<string> => {
  const infoPath = path.resolve(zkConfigPath, 'compiler', 'contract-info.json');
  const raw: unknown = JSON.parse(await readFile(infoPath, 'utf8'));
  const version = (raw as Record<string, unknown>)['compiler-version'];
  if (typeof version !== 'string' || version.trim() === '') {
    throw new Error(`Could not read "compiler-version" from ${infoPath}`);
  }
  return version.trim();
};
