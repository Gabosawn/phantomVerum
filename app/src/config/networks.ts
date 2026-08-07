/**
 * B1.1 — Entornos de red de Testigo.
 *
 * Dos entornos: `preview` (la red pública del hackathon) y `local` (devnet en
 * Docker). La selección se hace por `process.env.NETWORK`, con `preview` por
 * defecto.
 *
 * REGLA DE ORO (docs/01-arquitectura.md §8): nada acá sale de memoria. La forma
 * del objeto de configuración y las URLs de Preview están copiadas de la fuente
 * autoritativa: `PreviewTestEnvironment.getEnvironmentConfiguration()` y
 * `LocalTestConfiguration` en
 * `node_modules/@midnight-ntwrk/testkit-js/dist/index.mjs` (4.1.1).
 *
 * Dos detalles que el plan (docs/04 §B1.1) no mencionaba y que el SDK SÍ exige:
 *
 *  1. `indexerPublicDataProvider(queryURL, subscriptionURL)` necesita DOS URLs.
 *     La de suscripción es el endpoint WebSocket del indexer
 *     (`.../api/v4/graphql/ws`), no la HTTP.
 *  2. El `networkId` de la red local NO es `'local'`: el nodo standalone se
 *     identifica como `'undeployed'`. `'local'` es solo el nombre con el que
 *     elegimos el entorno desde la CLI/env.
 */
import { NetworkId } from '@midnight-ntwrk/wallet-sdk';

/** Nombre con el que se elige el entorno (`NETWORK=...`). */
export type NetworkName = 'preview' | 'local';

/**
 * Configuración de un entorno.
 *
 * Es estructuralmente compatible con `EnvironmentConfiguration` de
 * `@midnight-ntwrk/testkit-js` — `config/providers.ts` la pasa directo a
 * `MidnightWalletProvider.build()`, y `tsc` verifica la compatibilidad ahí.
 * Definirla acá (en vez de importar el tipo de un devDependency) mantiene este
 * módulo sin dependencias del testkit.
 */
export interface NetworkConfig {
  /** Nombre del entorno tal como se pide por `NETWORK=`. */
  readonly name: NetworkName;
  /** Network id que consume el wallet SDK (address bech32m, etc.). */
  readonly walletNetworkId: NetworkId.NetworkId;
  /** Network id global de midnight-js — lo consume `setNetworkId` (ver init.ts). */
  readonly networkId: string;
  /** Endpoint GraphQL HTTP del indexer (queries). */
  readonly indexer: string;
  /** Endpoint GraphQL WebSocket del indexer (subscriptions). */
  readonly indexerWS: string;
  /** RPC HTTP del nodo. */
  readonly node: string;
  /** RPC WebSocket del nodo. */
  readonly nodeWS: string;
  /** Proof server. Siempre local: nunca ve la seed ni las signing keys. */
  readonly proofServer: string;
  /** Faucet de tDUST, si el entorno tiene uno. */
  readonly faucet: string | undefined;
}

/** Proof server por defecto (imagen `midnightntwrk/proof-server:8.1.0`). */
export const DEFAULT_PROOF_SERVER = 'http://localhost:6300';

/** Entorno usado si `NETWORK` no está seteada. */
export const DEFAULT_NETWORK: NetworkName = 'preview';

/**
 * Preview — red pública del hackathon.
 * URLs verificadas contra `PreviewTestEnvironment` de testkit-js 4.1.1.
 */
export const PREVIEW: NetworkConfig = {
  name: 'preview',
  walletNetworkId: NetworkId.NetworkId.Preview,
  networkId: 'preview',
  indexer: 'https://indexer.preview.midnight.network/api/v4/graphql',
  indexerWS: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
  node: 'https://rpc.preview.midnight.network',
  nodeWS: 'wss://rpc.preview.midnight.network',
  proofServer: DEFAULT_PROOF_SERVER,
  faucet: 'https://faucet.preview.midnight.network/api/drips',
};

/**
 * Local — devnet en Docker (plan B de docs/03 §6).
 * Puertos según docs/02-entorno.md y AGENTS.md: nodo 9944, indexer 8088.
 */
export const LOCAL: NetworkConfig = {
  name: 'local',
  walletNetworkId: NetworkId.NetworkId.Undeployed,
  networkId: 'undeployed',
  indexer: 'http://localhost:8088/api/v4/graphql',
  indexerWS: 'ws://localhost:8088/api/v4/graphql/ws',
  node: 'http://localhost:9944',
  nodeWS: 'ws://localhost:9944',
  proofServer: DEFAULT_PROOF_SERVER,
  faucet: undefined,
};

/** Todos los entornos conocidos, indexados por nombre. */
export const NETWORKS: Readonly<Record<NetworkName, NetworkConfig>> = {
  preview: PREVIEW,
  local: LOCAL,
};

/** Nombres válidos, para mensajes de error. */
export const NETWORK_NAMES: readonly NetworkName[] = ['preview', 'local'];

/** Type guard: ¿este string es un entorno conocido? */
export const isNetworkName = (value: string): value is NetworkName =>
  Object.prototype.hasOwnProperty.call(NETWORKS, value);

/**
 * Normaliza el valor crudo de `NETWORK`. Falla cerrado: un nombre desconocido
 * es un error explícito, no un fallback silencioso a Preview (deployar contra
 * la red equivocada por un typo es exactamente el bug que no queremos).
 */
export const resolveNetworkName = (raw: string | undefined): NetworkName => {
  const trimmed = raw?.trim();
  if (trimmed === undefined || trimmed === '') {
    return DEFAULT_NETWORK;
  }
  if (!isNetworkName(trimmed)) {
    throw new Error(
      `NETWORK="${trimmed}" no es un entorno válido. Opciones: ${NETWORK_NAMES.join(' | ')}.`,
    );
  }
  return trimmed;
};

/** Devuelve la configuración de un entorno por nombre. */
export const getNetworkConfig = (name: NetworkName): NetworkConfig => NETWORKS[name];

/**
 * Configuración del entorno activo, leyendo el ambiente del proceso.
 *
 * - `NETWORK` elige el entorno (default `preview`).
 * - `PROOF_SERVER` puede pisar la URL del proof server (útil si el container
 *   quedó en otro puerto).
 */
export const activeNetwork = (env: NodeJS.ProcessEnv = process.env): NetworkConfig => {
  const base = getNetworkConfig(resolveNetworkName(env.NETWORK));
  const proofServerOverride = env.PROOF_SERVER?.trim();
  if (proofServerOverride === undefined || proofServerOverride === '') {
    return base;
  }
  return { ...base, proofServer: proofServerOverride };
};

/** Resumen de una línea por endpoint — para el log de arranque de los scripts. */
export const describeNetwork = (config: NetworkConfig): string =>
  [
    `red            : ${config.name} (networkId=${config.networkId})`,
    `indexer        : ${config.indexer}`,
    `indexer (ws)   : ${config.indexerWS}`,
    `nodo           : ${config.nodeWS}`,
    `proof server   : ${config.proofServer}`,
    `faucet         : ${config.faucet ?? '(sin faucet)'}`,
  ].join('\n');
