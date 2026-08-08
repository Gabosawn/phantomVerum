// Derives the deploy wallet's addresses and balances from DEPLOY_SEED in .env.
// The seed itself is never printed. Addresses are deterministic: same seed,
// same addresses, every time — so this is reproducible and checkable.
//
//   NETWORK=preview node wallet-info.mjs
import './app/dist/config/init.js';
import { currentNetwork } from './app/dist/config/init.js';
import { buildWalletProvider } from './app/dist/config/providers.js';
import { DAppConnectorWalletAdapter, syncWallet } from '@midnight-ntwrk/testkit-js';

const network = currentNetwork();
console.log('network :', network.name, '|', network.indexer);

const wp = await buildWalletProvider(network);
console.log('coinPublicKey :', wp.getCoinPublicKey());

// `start(false)` RETURNS BEFORE THE WALLET HAS SYNCED, so reading balances
// straight after it reports zeros for a wallet that is demonstrably funded —
// which reads as "the transfer never arrived". `syncWallet` is the one that
// waits, and its state is what the balances must be read from.
await wp.start(false);
const synced = await syncWallet(wp.wallet);

const adapter = new DAppConnectorWalletAdapter(wp, network);
console.log('unshielded :', (await adapter.getUnshieldedAddress()).unshieldedAddress);
console.log('shielded   :', (await adapter.getShieldedAddresses()).shieldedAddress);
console.log('dust       :', (await adapter.getDustAddress()).dustAddress);

const big = (_k, v) => (typeof v === 'bigint' ? v.toString() : v);
console.log('---');
console.log('DUST (synced)      :', synced.dust.balance(new Date()).toString());
console.log('NIGHT (synced)     :', JSON.stringify(synced.unshielded.balances, big));
console.log('shielded (synced)  :', JSON.stringify(synced.shielded.balances, big));

await wp.stop();
process.exit(0);
