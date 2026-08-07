/**
 * B1.2 — Dirección del contrato deployado.
 *
 * Formato congelado en docs/03-plan-ejecucion.md §3.2:
 *
 *   { network, contractAddress, deployTxId, deployedAt, compilerVersion }
 *
 * `app/src/config/deployment.json` es la ÚNICA fuente de la dirección del
 * contrato: `ui/` y `tests/` leen de acá, nunca de una env var suelta. El
 * archivo se commitea (a diferencia de `.env`, que nunca).
 *
 * Antes del deploy el archivo existe con todos los campos en `null`. Eso es un
 * estado válido y distinguible ("todavía no deployamos"), no un archivo roto.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { isNetworkName, type NetworkName } from './networks.js';
import { deploymentJsonPath, zkConfigDirectory } from './paths.js';

/** Un deploy concreto: todos los campos presentes. */
export interface DeploymentRecord {
  /** Red contra la que se deployó. */
  readonly network: NetworkName;
  /** Dirección del contrato (hex, sin `0x`). */
  readonly contractAddress: string;
  /** Identificador de la transacción de deploy. */
  readonly deployTxId: string;
  /** Timestamp ISO-8601 del deploy. */
  readonly deployedAt: string;
  /** Versión del compilador Compact que generó los artefactos. */
  readonly compilerVersion: string;
}

/** El archivo en disco: mismo shape, con `null` mientras no haya deploy. */
export type DeploymentFile = {
  readonly [K in keyof DeploymentRecord]: DeploymentRecord[K] | null;
};

/** Placeholder que se escribe cuando todavía no hay deploy. */
export const EMPTY_DEPLOYMENT: DeploymentFile = {
  network: null,
  contractAddress: null,
  deployTxId: null,
  deployedAt: null,
  compilerVersion: null,
};

/**
 * Ruta del `deployment.json`.
 *
 * Apunta SIEMPRE al archivo fuente `app/src/config/deployment.json` — el que se
 * commitea — nunca a una copia en `dist/`. `DEPLOYMENT_FILE` lo pisa.
 */
export const deploymentFilePath = deploymentJsonPath;

/** Error de formato del `deployment.json` — legible, con el path adentro. */
export class DeploymentFormatError extends Error {
  constructor(path: string, detail: string) {
    super(`deployment.json inválido (${path}): ${detail}`);
    this.name = 'DeploymentFormatError';
  }
}

/** ¿El archivo describe un deploy real (todos los campos presentes)? */
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
    throw new DeploymentFormatError(path, `el campo "${field}" debe ser string o null`);
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/** Valida y normaliza el JSON crudo a `DeploymentFile`. */
export const parseDeploymentFile = (raw: unknown, path: string): DeploymentFile => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new DeploymentFormatError(path, 'se esperaba un objeto JSON');
  }
  const obj = raw as Record<string, unknown>;
  const network = asNullableString(obj.network, 'network', path);
  if (network !== null && !isNetworkName(network)) {
    throw new DeploymentFormatError(path, `"network" desconocida: ${network}`);
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
 * Lee el `deployment.json`. Si el archivo no existe devuelve el placeholder
 * vacío: "todavía no deployamos" no es un error de I/O.
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
    throw new DeploymentFormatError(path, `no es JSON parseable (${String(error)})`);
  }
  return parseDeploymentFile(raw, path);
};

/** Devuelve el deploy si existe, `null` si el archivo sigue en placeholder. */
export const readDeployment = async (
  env: NodeJS.ProcessEnv = process.env,
): Promise<DeploymentRecord | null> => {
  const file = await readDeploymentFile(env);
  return isDeployed(file) ? file : null;
};

/**
 * Igual que `readDeployment`, pero explota con un mensaje accionable si todavía
 * no hay contrato. Es el que usan los scripts que necesitan sí o sí la address.
 */
export const requireDeployment = async (
  env: NodeJS.ProcessEnv = process.env,
): Promise<DeploymentRecord> => {
  const deployment = await readDeployment(env);
  if (deployment === null) {
    throw new Error(
      `No hay contrato deployado: ${deploymentFilePath(env)} sigue en placeholder. ` +
        'Corré el script de deploy (B5.1) antes de este paso.',
    );
  }
  return deployment;
};

/** Escribe el `deployment.json` (2 espacios + newline final, para diffs limpios). */
export const writeDeploymentFile = async (
  file: DeploymentFile,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> => {
  const path = deploymentFilePath(env);
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
  return path;
};

/**
 * Registra un deploy. `deployedAt` se completa solo si no viene.
 * Devuelve el path escrito, para que el script lo pueda imprimir.
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

/** Vuelve el archivo al placeholder (útil para el smoke de re-deploy, B5.4). */
export const clearDeployment = async (
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> => writeDeploymentFile(EMPTY_DEPLOYMENT, env);

/**
 * Lee la versión del compilador desde los artefactos reales
 * (`contracts/output/compiler/contract-info.json`), en vez de hardcodearla.
 *
 * El deploy (B5.1) tiene que registrar la versión que EFECTIVAMENTE generó las
 * claves: si el contrato se recompila con otro compilador, `deployment.json`
 * tiene que reflejarlo solo.
 */
export const readCompilerVersion = async (
  zkConfigPath = zkConfigDirectory(),
): Promise<string> => {
  const infoPath = path.resolve(zkConfigPath, 'compiler', 'contract-info.json');
  const raw: unknown = JSON.parse(await readFile(infoPath, 'utf8'));
  const version = (raw as Record<string, unknown>)['compiler-version'];
  if (typeof version !== 'string' || version.trim() === '') {
    throw new Error(`No pude leer "compiler-version" de ${infoPath}`);
  }
  return version.trim();
};
