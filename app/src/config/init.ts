/**
 * B1.4 — Global network id initialization.
 *
 * `@midnight-ntwrk/midnight-js-network-id` keeps the network id in a module
 * variable. `getNetworkId()` THROWS if `setNetworkId()` was never called
 * (verified in `midnight-js-network-id/dist/index.mjs`, 4.1.1):
 *
 *     'Network ID has not been configured. Call setNetworkId() before any
 *      wallet or contract operation.'
 *
 * That is why this module is imported FIRST in every script: it does the
 * `setNetworkId` once, as an import effect, before any other module touches
 * the wallet or the contract.
 *
 *     import './config/init.js';   // <- first line of every script
 *
 * If `NETWORK` has an invalid value this blows up at import time, not
 * mid-deploy. On purpose.
 *
 * Note: in 4.1.1 `NetworkId` is a `string`, not an enum. There is no
 * `NetworkId.TestNet` to import — the value comes from `networks.ts`
 * (`'preview'` / `'undeployed'`).
 */
import { getNetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

import { activeNetwork, type NetworkConfig } from './networks.js';

let configured: NetworkConfig | undefined;

/**
 * Sets the global network id from the active environment. Idempotent: the
 * second call returns what is already configured without writing again.
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
 * The active environment, already initialized. For code assuming some script
 * already called `initNetwork()` (which importing this module does).
 */
export const currentNetwork = (): NetworkConfig => initNetwork();

/**
 * The global network id as midnight-js sees it. Lets a test verify that
 * `init` ran and that it matches the network we believe we are on.
 */
export const currentNetworkId = (): string => {
  initNetwork();
  return getNetworkId();
};

// Import effect: configure the network as soon as the module loads.
initNetwork();
