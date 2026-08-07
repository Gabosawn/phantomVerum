/**
 * B1.4 — Inicialización del network id global.
 *
 * `@midnight-ntwrk/midnight-js-network-id` guarda el network id en una variable
 * de módulo. `getNetworkId()` TIRA si nunca se llamó a `setNetworkId()`
 * (verificado en `midnight-js-network-id/dist/index.mjs`, 4.1.1):
 *
 *     'Network ID has not been configured. Call setNetworkId() before any
 *      wallet or contract operation.'
 *
 * Por eso este módulo se importa PRIMERO en todos los scripts: hace el
 * `setNetworkId` una sola vez, como efecto de import, antes de que cualquier
 * otro módulo toque el wallet o el contrato.
 *
 *     import './config/init.js';   // <- primera línea de cada script
 *
 * Si `NETWORK` tiene un valor inválido esto explota en el import, no a mitad
 * de un deploy. Es a propósito.
 *
 * Ojo: en 4.1.1 `NetworkId` es `string`, no un enum. No hay un
 * `NetworkId.TestNet` que importar — el valor sale de `networks.ts`
 * (`'preview'` / `'undeployed'`).
 */
import { getNetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

import { activeNetwork, type NetworkConfig } from './networks.js';

let configured: NetworkConfig | undefined;

/**
 * Setea el network id global a partir del entorno activo. Idempotente: la
 * segunda llamada devuelve lo ya configurado sin volver a escribir.
 */
export const initNetwork = (env: NodeJS.ProcessEnv = process.env): NetworkConfig => {
  if (configured !== undefined) {
    return configured;
  }
  const config = activeNetwork(env);
  setNetworkId(config.networkId);
  configured = config;
  return config;
};

/**
 * El entorno activo, ya inicializado. Para código que asume que algún script
 * ya llamó a `initNetwork()` (que es lo que hace el import de este módulo).
 */
export const currentNetwork = (): NetworkConfig => initNetwork();

/**
 * El network id global tal como lo ve midnight-js. Sirve para verificar en un
 * test que `init` corrió y que coincide con la red que creemos estar usando.
 */
export const currentNetworkId = (): string => {
  initNetwork();
  return getNetworkId();
};

// Efecto de import: configurar la red apenas se carga el módulo.
initNetwork();
