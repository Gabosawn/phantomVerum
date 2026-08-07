# 02 — Development environment

## Toolchain

- `compact` lives at `~/.local/bin/compact` (NOT `~/.compact/bin`)
- After installing: **`compact update` is MANDATORY** — downloads compactc and sets it as default.
  `compact --version` works even if it's missing — ALWAYS verify `compact compile --version`
- Compile: `compact compile contract.compact output/` → generates JS/TS + zkir/
- Proof server: `docker run -p 6300:6300 midnightntwrk/proof-server:latest midnight-proof-server -v`
  (docker = podman alias, works the same)
- Target network: **Preview** (no devnet/testnet)

## Quick verification

```bash
which compact && compact --version && compact compile --version
ss -tlnp | grep 6300          # proof server listening
curl -s http://localhost:6300/health
```

## Services

| Service | Local | Preview |
|---|---|---|
| Node | `ws://localhost:9944` | `wss://rpc.preview.midnight.network` |
| Indexer | `http://localhost:8088/api/v4/graphql` | `https://indexer.preview.midnight.network/api/v4/graphql` |
| Proof server | `localhost:6300` | — |

**NO READS WITHOUT INDEXER** — all queryContractState/balances goes through the indexer's GraphQL.

## Machine checklist

- [ ] Node.js 22+ — `node --version`
- [ ] Docker — `docker --version`
- [ ] Compact compiler installed + `compact update` executed
- [ ] `compact compile --version` responds (not just `compact --version`)
- [ ] Proof server up on `localhost:6300`
- [ ] `queryContractState` against the preview indexer works (not just local)
- [ ] Wallet Lace + tDUST from preview faucet
- [ ] Hello World E2E: compile → deploy → full interaction

## Links

| Resource | Link |
|---|---|
| Official docs | https://docs.midnight.network |
| Compatibility matrix (versions) | https://docs.midnight.network/relnotes/support-matrix |
| Existing dApps | https://github.com/midnightntwrk/midnight-awesome-dapps |
| Official examples | https://github.com/midnightntwrk (create-mn-app, example-zkloan, example-private-party) |

## Key concepts

- **Dual-ledger:** `ledger` = public on-chain state; `witness` = private
  state that never leaves your machine. Designing = deciding which goes on
  each side.
- **Compact:** TypeScript-like, compiles to ZK circuits. Version 0.5.1.
- **`disclose()`:** everything private by default; only marked items are published.
- **`assert`:** fails locally at proof time — nothing invalid reaches the chain.
- **midnight-js:** TypeScript SDK connecting frontend with contract.
- **Proof server:** local process that generates proofs; witnesses travel
  only to it. **Never receives seed or signing keys.**
- **Indexer (GraphQL):** sole path to read on-chain state (`queryContractState`,
  balances). No direct reads without indexer.
