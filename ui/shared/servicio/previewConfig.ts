/**
 * Preview network configuration for the browser.
 *
 * Mirrors `app/src/config/networks.ts` but imports nothing Node-specific.
 * The proof server is a Docker container on localhost:6300 — the browser
 * talks to it via HTTP, just like the Node CLI does.
 */

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
 * Populated by B5 (deploy). Until then the Explorer falls back to
 * `ClienteMock` with fixture data; the Cliente keeps using `ClienteMock`
 * as its proving backend (the real contract calls go through Lace + the
 * local proof server, and that path needs `deployment.json` to be
 * complete).
 */
export const PREVIEW_CONTRACT_ADDRESS: string | null = null;
