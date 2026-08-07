/**
 * B1.3 — Los 6 providers de midnight-js.
 *
 * `MidnightProviders` (verificado en `midnight-js-types/dist/providers.d.ts`,
 * 4.1.1) exige exactamente:
 *
 *   privateStateProvider · publicDataProvider · zkConfigProvider ·
 *   proofProvider · walletProvider · midnightProvider   (+ loggerProvider opcional)
 *
 * El ensamblado de acá abajo es el mismo que hace `initializeMidnightProviders`
 * de testkit-js (ver `testkit-js/dist/index.mjs`); lo escribimos explícito
 * porque necesitamos controlar el path de los artefactos ZK y la password del
 * private state, y porque es código que un juez va a leer.
 *
 * Sobre el wallet: NO usamos `@midnight-ntwrk/wallet` ni `-wallet-api`. Están
 * en 5.0.0, montan zswap/ledger viejos incompatibles con el stack 4.1.1 y no
 * figuran en la compatibility matrix. El camino soportado para "wallet desde
 * seed" es `MidnightWalletProvider` de testkit-js, que implementa a la vez
 * `WalletProvider` y `MidnightProvider` (los dos providers que faltan).
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import type {
  MidnightProviders,
  PrivateStateId,
  PrivateStateProvider,
  ProofProvider,
  PublicDataProvider,
} from '@midnight-ntwrk/midnight-js-types';
import { MidnightWalletProvider, logger as defaultLogger } from '@midnight-ntwrk/testkit-js';
import type { NetworkId } from '@midnight-ntwrk/wallet-sdk';

import { currentNetwork } from './init.js';
import type { NetworkConfig } from './networks.js';
import { REPO_ROOT, privateStateDirectory, zkConfigDirectory } from './paths.js';

// ---------------------------------------------------------------------------
// Guarda de compatibilidad que el SDK NO nos da
// ---------------------------------------------------------------------------

/**
 * ⚠️ `MidnightWalletProvider.build(logger, env, seed)` declara `env` con un tipo
 * que TypeScript no puede resolver: el `.d.ts` de testkit-js 4.1.1 importa
 * `EnvironmentConfiguration` desde el alias `@/index`, que no existe fuera del
 * build del propio paquete. Con `skipLibCheck` eso colapsa a `any`.
 *
 * Verificado, no supuesto: `MidnightWalletProvider.build(logger, { soloEsto: 1 },
 * 'x')` type-checkea sin una queja. O sea que NADA valida que `NetworkConfig`
 * tenga lo que el wallet necesita — un campo mal escrito se manifestaría recién
 * en runtime, a mitad de un deploy.
 *
 * Este tipo replica los campos que el SDK lee DE VERDAD, leídos del código:
 * `mapEnvironmentToConfiguration` (indexer, indexerWS, proofServer,
 * walletNetworkId, nodeWS) y `waitForFunds` (faucet). La línea de abajo hace
 * que `tsc` falle si `NetworkConfig` deja de cumplir el contrato.
 */
interface WalletEnvironmentShape {
  readonly walletNetworkId: NetworkId.NetworkId;
  readonly indexer: string;
  readonly indexerWS: string;
  readonly nodeWS: string;
  readonly proofServer: string;
  readonly faucet: string | undefined;
}

type AssertAssignable<T extends U, U> = T;

/** Falla la compilación si `NetworkConfig` deja de servir como env del wallet. */
export type NetworkConfigIsWalletEnvironment = AssertAssignable<
  NetworkConfig,
  WalletEnvironmentShape
>;

/**
 * Los circuitos con claves de Testigo. Tienen que coincidir 1:1 con
 * `contracts/output/keys/*.prover` — `NodeZkConfigProvider` los busca por
 * nombre de archivo. Si el contrato agrega un circuito, se agrega acá.
 */
export type TestigoCircuitId =
  | 'registrarOrganizacion'
  | 'emitirCredencial'
  | 'denunciar'
  | 'revelarAutoria';

/** Los mismos, como array — para chequear que los artefactos existan. */
export const TESTIGO_CIRCUIT_IDS: readonly TestigoCircuitId[] = [
  'registrarOrganizacion',
  'emitirCredencial',
  'denunciar',
  'revelarAutoria',
];

/**
 * El tipo de logger que espera `MidnightWalletProvider.build` (un `Logger` de
 * pino). Lo derivamos de la firma real en vez de importar `pino`, que no es
 * dependencia declarada de `app/`.
 */
export type WalletLogger = Parameters<typeof MidnightWalletProvider.build>[0];

/**
 * Logger para los scripts CLI.
 *
 * El logger que exporta testkit-js viene en nivel `info` y escupe a stdout la
 * config completa del wallet — incluida **la seed en claro**
 * (`Your wallet seed is: ...`, en `MidnightWalletProvider.build`). Eso es
 * veneno para material de demo que se proyecta en un video, y peor todavía si
 * alguien pega el log en un issue.
 *
 * Bajamos el nivel a `warn` por defecto. También bajamos el del singleton de
 * testkit, porque partes del SDK (`FluentWalletBuilder.forEnvironment`,
 * `WalletFactory`) loguean contra ESE objeto y no contra el que les pasamos:
 * sin esto siguen saliendo por stdout aunque nuestro child esté callado.
 *
 * `LOG_LEVEL=info` (o `debug`) lo vuelve a subir para debuggear.
 */
export const scriptLogger = (env: NodeJS.ProcessEnv = process.env): WalletLogger => {
  const requested = env.LOG_LEVEL?.trim();
  const level = requested !== undefined && requested !== '' ? requested : 'warn';
  defaultLogger.level = level;
  const child = defaultLogger.child({ app: 'testigo' });
  child.level = level;
  return child;
};

/** Nombre base del store de private state en LevelDB. */
export const PRIVATE_STATE_STORE_NAME = 'testigo-private-state';

/** Id del private state del contrato (clave dentro del store). */
export const TESTIGO_PRIVATE_STATE_ID = 'testigo';

// ---------------------------------------------------------------------------
// .env
// ---------------------------------------------------------------------------

let envLoaded = false;

/**
 * Carga `.env` de la raíz del repo si existe.
 *
 * Node 22 trae `process.loadEnvFile()` — no hace falta `dotenv`. Las variables
 * ya presentes en el ambiente NO se pisan, así que
 * `NETWORK=local npm run ...` sigue mandando sobre el `.env`.
 */
export const loadEnvFile = (): void => {
  if (envLoaded) {
    return;
  }
  envLoaded = true;
  const envPath = path.resolve(REPO_ROOT, '.env');
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
};

/** Error accionable cuando falta o está mal la `DEPLOY_SEED`. */
export class MissingSeedError extends Error {
  constructor(detail: string) {
    super(
      `${detail}\n` +
        'Generá una con: openssl rand -hex 32\n' +
        'y ponela en .env como DEPLOY_SEED=<64 chars hex> (nunca la commitees).',
    );
    this.name = 'MissingSeedError';
  }
}

const HEX64 = /^[0-9a-f]{64}$/i;

/**
 * Lee y valida `DEPLOY_SEED`.
 *
 * Formato: 64 chars hex (32 bytes). El SDK hace `Buffer.from(seed, 'hex')` y se
 * la pasa a `HDWallet.fromSeed` (verificado en `deriveKeyForRole`, testkit-js);
 * un string que no sea hex se convierte en un buffer truncado en silencio y la
 * derivación falla con un error críptico. Por eso validamos acá.
 */
export const readDeploySeed = (env: NodeJS.ProcessEnv = process.env): string => {
  loadEnvFile();
  const seed = env.DEPLOY_SEED?.trim();
  if (seed === undefined || seed === '') {
    throw new MissingSeedError('Falta DEPLOY_SEED.');
  }
  if (!HEX64.test(seed)) {
    throw new MissingSeedError(
      `DEPLOY_SEED tiene ${seed.length} chars y se esperaban 64 hex (32 bytes).`,
    );
  }
  return seed.toLowerCase();
};

// ---------------------------------------------------------------------------
// Private state
// ---------------------------------------------------------------------------

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';

/**
 * Password de cifrado del LevelDB de private state.
 *
 * `levelPrivateStateProvider` valida la password en CADA lectura/escritura
 * contra una política dura (`validatePassword` en midnight-js-utils 4.1.1):
 * ≥16 chars · ≥3 de 4 clases de caracteres · ≤3 idénticos seguidos · sin
 * secuencias de 4+ (`1234`, `abcd`).
 *
 * Si no viene `PRIVATE_STATE_PASSWORD`, la derivamos de la `DEPLOY_SEED` con un
 * tag de dominio. La seed ya es el secreto que protege todo lo demás, así que
 * no agrega superficie nueva — y es estrictamente mejor que la constante
 * hardcodeada que usa el testkit.
 *
 * El alfabeto alterna MAYÚSCULA/minúscula posición a posición: dos caracteres
 * contiguos nunca quedan a distancia ±1 de code point, así que el resultado no
 * puede disparar el chequeo de "secuencias".
 */
export const derivePrivateStatePassword = (seed: string): string => {
  const digest = createHash('sha256').update(`testigo:private-state:v1:${seed}`).digest();
  let out = 'Tg7#';
  for (let i = 0; i < 20; i += 1) {
    const byte = digest[i] as number;
    out += i % 2 === 0 ? UPPER[byte % UPPER.length] : LOWER[byte % LOWER.length];
  }
  return out;
};

/** Password efectiva: la explícita del ambiente, o la derivada de la seed. */
export const privateStatePassword = (env: NodeJS.ProcessEnv = process.env): string => {
  loadEnvFile();
  const explicit = env.PRIVATE_STATE_PASSWORD?.trim();
  if (explicit !== undefined && explicit !== '') {
    return explicit;
  }
  return derivePrivateStatePassword(readDeploySeed(env));
};

// ---------------------------------------------------------------------------
// Providers individuales
// ---------------------------------------------------------------------------

/**
 * Provider de datos públicos (indexer).
 *
 * `indexerPublicDataProvider(queryURL, subscriptionURL, webSocketImpl?)` — dos
 * URLs, no una: HTTP para queries, WebSocket para subscriptions.
 *
 * No necesita wallet ni seed: es el que usan `verificarAutoria` (B3.6, 100 %
 * off-chain) y `leerEstadoLedger` (B3.7).
 */
export const buildPublicDataProvider = (network: NetworkConfig): PublicDataProvider =>
  indexerPublicDataProvider(network.indexer, network.indexerWS);

/**
 * Provider de artefactos ZK, leyendo `contracts/output/`.
 *
 * `NodeZkConfigProvider` espera adentro `keys/<circuitId>.prover|.verifier` y
 * `zkir/<circuitId>.bzkir`. Es exactamente el layout que emite `compact
 * compile`, así que apuntamos al directorio de salida tal cual.
 */
export const buildZkConfigProvider = <K extends string = TestigoCircuitId>(
  zkConfigPath: string = zkConfigDirectory(),
): NodeZkConfigProvider<K> => new NodeZkConfigProvider<K>(zkConfigPath);

/**
 * Verifica que los artefactos ZK existan ANTES de intentar probar nada.
 *
 * Sin esto, un `contracts/output/` vacío se manifiesta como un ENOENT a mitad
 * del proving, después de haber armado wallet y transacción. Devuelve la lista
 * de archivos faltantes (vacía = todo bien).
 */
export const missingZkArtifacts = (
  zkConfigPath: string = zkConfigDirectory(),
  circuitIds: readonly string[] = TESTIGO_CIRCUIT_IDS,
): string[] => {
  const missing: string[] = [];
  for (const id of circuitIds) {
    for (const rel of [
      path.join('keys', `${id}.prover`),
      path.join('keys', `${id}.verifier`),
      path.join('zkir', `${id}.bzkir`),
    ]) {
      const full = path.resolve(zkConfigPath, rel);
      if (!existsSync(full)) {
        missing.push(full);
      }
    }
  }
  return missing;
};

/** Igual que `missingZkArtifacts`, pero explota con instrucciones. */
export const assertZkArtifacts = (zkConfigPath: string = zkConfigDirectory()): void => {
  const missing = missingZkArtifacts(zkConfigPath);
  if (missing.length > 0) {
    throw new Error(
      `Faltan artefactos ZK en ${zkConfigPath}:\n` +
        missing.map((m) => `  - ${m}`).join('\n') +
        '\nCorré: npm run compile --workspace=contracts',
    );
  }
};

/**
 * Proof provider HTTP contra el proof server local.
 *
 * `httpClientProofProvider(url, zkConfigProvider, config?)` — necesita el
 * zkConfigProvider porque prueba circuito por circuito contra `/check` y
 * `/prove` (el endpoint `/prove-tx` NO se usa; ver el doc del paquete).
 *
 * El proof server nunca recibe la seed ni las signing keys.
 */
export const buildProofProvider = <K extends string = TestigoCircuitId>(
  network: NetworkConfig,
  zkConfigProvider: NodeZkConfigProvider<K>,
): ProofProvider => httpClientProofProvider<K>(network.proofServer, zkConfigProvider);

/**
 * Private state provider sobre LevelDB.
 *
 * En 4.1.1 `levelPrivateStateProvider` pide dos campos obligatorios que las
 * versiones viejas no tenían: `privateStoragePasswordProvider` y `accountId`
 * (aislamiento entre cuentas que comparten la misma base).
 */
export const buildPrivateStateProvider = <
  PSI extends PrivateStateId = PrivateStateId,
  PS = unknown,
>(options: {
  readonly accountId: string;
  readonly password: string;
  readonly storeName?: string;
  readonly directory?: string;
}): PrivateStateProvider<PSI, PS> => {
  const storeName = options.storeName ?? PRIVATE_STATE_STORE_NAME;
  return levelPrivateStateProvider<PSI, PS>({
    midnightDbName: path.resolve(options.directory ?? privateStateDirectory(), storeName),
    privateStateStoreName: storeName,
    signingKeyStoreName: `${storeName}-signing-keys`,
    privateStoragePasswordProvider: () => options.password,
    accountId: options.accountId,
  });
};

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

/**
 * Construye el wallet desde `DEPLOY_SEED`.
 *
 * `MidnightWalletProvider` implementa `WalletProvider` Y `MidnightProvider`:
 * cubre `balanceTx` / `getCoinPublicKey` / `getEncryptionPublicKey` y `submitTx`.
 *
 * OJO: `build()` NO arranca el wallet. Hay que llamar a `start()` aparte, y
 * `start(true)` (el default) pide tDUST al faucet y BLOQUEA hasta tener fondos.
 * Para cualquier cosa que no sea el primer deploy querés `start(false)`.
 */
export const buildWalletProvider = async (
  network: NetworkConfig = currentNetwork(),
  options: {
    readonly seed?: string;
    readonly logger?: WalletLogger;
  } = {},
): Promise<MidnightWalletProvider> => {
  const seed = options.seed ?? readDeploySeed();
  return MidnightWalletProvider.build(options.logger ?? scriptLogger(), network, seed);
};

// ---------------------------------------------------------------------------
// Ensamblado
// ---------------------------------------------------------------------------

/** Providers + las piezas sueltas que los scripts necesitan por separado. */
export interface TestigoProviders<PCK extends string = TestigoCircuitId, PS = unknown> {
  readonly providers: MidnightProviders<PCK, PrivateStateId, PS>;
  readonly walletProvider: MidnightWalletProvider;
  readonly network: NetworkConfig;
  readonly zkConfigPath: string;
}

/**
 * Ensambla los 6 providers a partir de un wallet ya construido.
 *
 * `accountId` sale de la coin public key del wallet — mismo criterio que
 * `initializeMidnightProviders` del testkit — así que dos seeds distintas no se
 * pisan el private state.
 */
export const assembleProviders = <PCK extends string = TestigoCircuitId, PS = unknown>(options: {
  readonly walletProvider: MidnightWalletProvider;
  readonly network: NetworkConfig;
  readonly zkConfigPath?: string;
  readonly privateStatePassword: string;
  readonly privateStateStoreName?: string;
}): MidnightProviders<PCK, PrivateStateId, PS> => {
  const zkConfigPath = options.zkConfigPath ?? zkConfigDirectory();
  const zkConfigProvider = buildZkConfigProvider<PCK>(zkConfigPath);
  // `getCoinPublicKey()` devuelve un STRING hex, así que este `Buffer.from` lo
  // codifica como UTF-8 y termina hexeando el hex (el accountId sale del doble
  // de largo). Es feo, pero es exactamente lo que hace
  // `initializeMidnightProviders` del testkit: lo mantenemos igual a propósito
  // para que un store escrito por nuestro código y uno escrito por el helper
  // del SDK sean el mismo. Como accountId solo hace falta que sea determinístico
  // y único por wallet, y lo es (el SDK igual lo hashea con SHA-256).
  const accountId = Buffer.from(options.walletProvider.getCoinPublicKey()).toString('hex');

  return {
    privateStateProvider: buildPrivateStateProvider<PrivateStateId, PS>({
      accountId,
      password: options.privateStatePassword,
      storeName: options.privateStateStoreName,
    }),
    publicDataProvider: buildPublicDataProvider(options.network),
    zkConfigProvider,
    proofProvider: buildProofProvider<PCK>(options.network, zkConfigProvider),
    walletProvider: options.walletProvider,
    midnightProvider: options.walletProvider,
  };
};

/**
 * Camino completo: red activa → wallet desde `DEPLOY_SEED` → 6 providers.
 *
 * Es lo que llaman los scripts de B4. NO arranca el wallet (ver
 * `buildWalletProvider`): el script decide si necesita esperar fondos.
 */
export const createProviders = async <PCK extends string = TestigoCircuitId, PS = unknown>(
  options: {
    readonly network?: NetworkConfig;
    readonly seed?: string;
    readonly logger?: WalletLogger;
    readonly zkConfigPath?: string;
    readonly checkArtifacts?: boolean;
  } = {},
): Promise<TestigoProviders<PCK, PS>> => {
  const network = options.network ?? currentNetwork();
  const zkConfigPath = options.zkConfigPath ?? zkConfigDirectory();
  if (options.checkArtifacts !== false) {
    assertZkArtifacts(zkConfigPath);
  }
  const seed = options.seed ?? readDeploySeed();
  const walletProvider = await buildWalletProvider(network, { seed, logger: options.logger });
  const providers = assembleProviders<PCK, PS>({
    walletProvider,
    network,
    zkConfigPath,
    privateStatePassword: privateStatePassword(),
  });
  return { providers, walletProvider, network, zkConfigPath };
};

/**
 * Solo lectura: indexer, sin wallet, sin seed, sin proof server.
 *
 * Es el modo que necesitan `verificarAutoria` (B3.6) y `leerEstadoLedger`
 * (B3.7). Que el fiscal pueda verificar una autoría sin tener una wallet es
 * parte de la demo, no un detalle de implementación.
 */
export const createReadOnlyProviders = (
  network: NetworkConfig = currentNetwork(),
): { readonly publicDataProvider: PublicDataProvider; readonly network: NetworkConfig } => ({
  publicDataProvider: buildPublicDataProvider(network),
  network,
});
