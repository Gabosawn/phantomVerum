/**
 * Repo paths the config modules need to resolve at runtime.
 *
 * Resolution trick (valid for this whole directory): both
 * `app/src/config/*.ts` and the compiled `app/dist/config/*.js` sit TWO
 * levels under `app/`. So `new URL('../../', import.meta.url)` points at
 * `app/` whether you run the source or the build. A single computation, no
 * `process.cwd()` (which depends on where the script is invoked from).
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** Directory of the `app/` workspace. */
export const APP_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Repo root (contains `app/`, `contracts/`, `ui/`, `tests/`). */
export const REPO_ROOT = path.resolve(APP_ROOT, '..');

/**
 * Directory with the Compact compiler artifacts.
 *
 * It is the one `NodeZkConfigProvider` consumes, which expects inside:
 *   - `keys/<circuitId>.prover` and `keys/<circuitId>.verifier`
 *   - `zkir/<circuitId>.bzkir`
 * (verified in `midnight-js-node-zk-config-provider/dist/index.mjs`, 4.1.1).
 *
 * `contracts/output/` matches that layout exactly. `ZK_CONFIG_PATH` overrides it.
 */
export const zkConfigDirectory = (env: NodeJS.ProcessEnv = process.env): string => {
  const override = env.ZK_CONFIG_PATH?.trim();
  if (override !== undefined && override !== '') {
    return path.resolve(override);
  }
  return path.resolve(REPO_ROOT, 'contracts', 'output');
};

/** `app/src/config/deployment.json` — the committed source of the address. */
export const deploymentJsonPath = (env: NodeJS.ProcessEnv = process.env): string => {
  const override = env.DEPLOYMENT_FILE?.trim();
  if (override !== undefined && override !== '') {
    return path.resolve(override);
  }
  return path.resolve(APP_ROOT, 'src', 'config', 'deployment.json');
};

/** Directory where the private state LevelDB lives. */
export const privateStateDirectory = (env: NodeJS.ProcessEnv = process.env): string => {
  const override = env.PRIVATE_STATE_DIR?.trim();
  if (override !== undefined && override !== '') {
    return path.resolve(override);
  }
  return path.resolve(APP_ROOT, '.private-state');
};
