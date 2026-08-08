// Derives the deploy wallet's addresses and balances from DEPLOY_SEED in .env.
// The seed itself is never printed. Addresses are deterministic: same seed,
// same addresses, every time — so this is reproducible and checkable.
//
//   NETWORK=preview node wallet-info.mjs
import './app/dist/config/init.js';
import { currentNetwork } from './app/dist/config/init.js';
import { buildWalletProvider } from './app/dist/config/providers.js';
import { DAppConnectorWalletAdapter } from '@midnight-ntwrk/testkit-js';

const network = currentNetwork();
console.log('network :', network.name, '|', network.indexer);

const wp = await buildWalletProvider(network);
console.log('coinPublicKey :', wp.getCoinPublicKey());

await wp.start(false); // sync without blocking on the faucet

const adapter = new DAppConnectorWalletAdapter(wp, network);
console.log('unshielded :', (await adapter.getUnshieldedAddress()).unshieldedAddress);
console.log('shielded   :', (await adapter.getShieldedAddresses()).shieldedAddress);
console.log('dust       :', (await adapter.getDustAddress()).dustAddress);

const dust = await adapter.getDustBalance();
const big = (_k, v) => (typeof v === 'bigint' ? v.toString() : v);
console.log('---');
console.log('DUST       :', dust.balance.toString(), '| cap:', dust.cap.toString());
console.log('unshielded balances:', JSON.stringify(await adapter.getUnshieldedBalances(), big));
console.log('shielded balances  :', JSON.stringify(await adapter.getShieldedBalances(), big));

await wp.stop();
process.exit(0);
