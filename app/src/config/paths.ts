/**
 * Rutas del repo que los módulos de config necesitan resolver en runtime.
 *
 * Truco de resolución (vale para todo este directorio): tanto
 * `app/src/config/*.ts` como el compilado `app/dist/config/*.js` están DOS
 * niveles debajo de `app/`. Así que `new URL('../../', import.meta.url)` apunta
 * a `app/` corras el fuente o el build. Un solo cálculo, sin `process.cwd()`
 * (que depende de desde dónde se invoque el script).
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** Directorio del workspace `app/`. */
export const APP_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Raíz del repo (contiene `app/`, `contracts/`, `ui/`, `tests/`). */
export const REPO_ROOT = path.resolve(APP_ROOT, '..');

/**
 * Directorio con los artefactos del compilador Compact.
 *
 * Es el que consume `NodeZkConfigProvider`, que espera adentro:
 *   - `keys/<circuitId>.prover` y `keys/<circuitId>.verifier`
 *   - `zkir/<circuitId>.bzkir`
 * (verificado en `midnight-js-node-zk-config-provider/dist/index.mjs`, 4.1.1).
 *
 * `contracts/output/` cumple exactamente ese layout. `ZK_CONFIG_PATH` lo pisa.
 */
export const zkConfigDirectory = (env: NodeJS.ProcessEnv = process.env): string => {
  const override = env.ZK_CONFIG_PATH?.trim();
  if (override !== undefined && override !== '') {
    return path.resolve(override);
  }
  return path.resolve(REPO_ROOT, 'contracts', 'output');
};

/** `app/src/config/deployment.json` — la fuente commiteada de la address. */
export const deploymentJsonPath = (env: NodeJS.ProcessEnv = process.env): string => {
  const override = env.DEPLOYMENT_FILE?.trim();
  if (override !== undefined && override !== '') {
    return path.resolve(override);
  }
  return path.resolve(APP_ROOT, 'src', 'config', 'deployment.json');
};

/** Directorio donde vive el LevelDB del private state. */
export const privateStateDirectory = (env: NodeJS.ProcessEnv = process.env): string => {
  const override = env.PRIVATE_STATE_DIR?.trim();
  if (override !== undefined && override !== '') {
    return path.resolve(override);
  }
  return path.resolve(APP_ROOT, '.private-state');
};
