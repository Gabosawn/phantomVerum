/**
 * Preview network configuration for the browser.
 *
 * Mirrors `app/src/config/networks.ts` but imports nothing Node-specific.
 * The proof server is a Docker container on localhost:6300 — the browser
 * talks to it via HTTP, just like the Node CLI does.
 */

// The deployed address, straight from the file the deploy script writes. Data,
// not code: no Node API rides along with it. See PREVIEW_CONTRACT_ADDRESS.
import deployment from "../../../app/src/config/deployment.json";

/** Midnight Preview endpoints (verified against testkit-js 4.1.1). */
export const PREVIEW_ENDPOINTS = {
  /** GraphQL indexer — HTTP queries (no wallet needed). */
  indexer: "https://indexer.preview.midnight.network/api/v4/graphql",
  /** GraphQL indexer — WebSocket subscriptions. */
  indexerWS: "wss://indexer.preview.midnight.network/api/v4/graphql/ws",
  /** Node RPC. */
  node: "https://rpc.preview.midnight.network",
  /** Node WebSocket RPC. */
  nodeWS: "wss://rpc.preview.midnight.network",
  /** Proof server (local Docker container, never sees seed or keys). */
  proofServer: "http://localhost:6300",
  /** tDUST faucet. */
  faucet: "https://faucet.preview.midnight.network/api/drips",
} as const;

/** Network id expected by the wallet SDK. */
export const PREVIEW_NETWORK_ID = "preview";

/**
 * Contract address deployed on Preview.
 *
 * Read from `app/src/config/deployment.json`, which the deploy script writes
 * and which is the SINGLE source of the address. It used to be a hand-kept
 * `null` here, so the deploy landed and the browser never saw it — the file
 * said one thing and this constant another. Importing the JSON is what keeps
 * a redeploy from needing two edits.
 *
 * Still `null` before the first deploy: `deployment.json` ships with every
 * field null, which is a valid "we have not deployed yet" state. In that case
 * the Explorer falls back to `ClienteMock` with fixture data.
 *
 * Note this is only the READ path. The Cliente keeps `ClienteMock` as its
 * proving backend regardless: writing to the contract from the browser needs
 * Lace plus the local proof server, which is a separate integration.
 */
export const PREVIEW_CONTRACT_ADDRESS: string | null =
  deployment.network === PREVIEW_NETWORK_ID ? deployment.contractAddress : null;
