# 02 — Development environment

## Toolchain

- `compact` lives at `~/.local/bin/compact` (NOT `~/.compact/bin`)
- After installing: **`compact update` is MANDATORY** — downloads compactc and sets it as default.
  `compact --version` works even if it's missing — ALWAYS verify `compact compile --version`
- Compile: `compact compile contract.compact output/` → generates JS/TS + zkir/
- Proof server: `docker run -d -p 127.0.0.1:6300:6300 --name phantomtrace-proof-server midnightntwrk/proof-server:8.1.0 midnight-proof-server`
  (pin the tag to 8.1.0. This machine runs real Docker 29.6.2, not a podman alias)

  ⚠️ **Two deliberate departures from Midnight's own install snippet.** Their
  command ends in `-v`, which enables `debug!("Received request: {hex}")` on
  every `/prove` call — that is a hex dump of every witness and every coin
  secret key straight into `docker logs`. And a bare `-p 6300:6300` publishes
  the server on every interface (permissive CORS, no TLS), so anything on the
  LAN can use it. Loopback and no `-v`.
- Target network: **Preview**. A local devnet is the rehearsal step before it —
  see `docs/05-deploy-local.md`.

## Quick verification

```bash
which compact && compact --version && compact compile --version
ss -tlnp | grep 6300          # proof server listening
curl -s http://localhost:6300/     # → {"status":"ok","timestamp":...}
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
- **Compact:** TypeScript-like, compiles to ZK circuits. Compiler 0.31.1
  (language 0.23.0, runtime 0.16.0).
- **`disclose()`:** everything private by default; only marked items are published.
- **`assert`:** fails locally at proof time — nothing invalid reaches the chain.
- **midnight-js:** TypeScript SDK connecting frontend with contract.
- **Proof server:** local process that generates proofs; witnesses travel
  only to it. **Never receives seed or signing keys.**
- **Indexer (GraphQL):** sole path to read on-chain state (`queryContractState`,
  balances). No direct reads without indexer. **Preview/Preprod hosted indexers
  have an `offset: null` bug** — always query with an explicit offset or a raw
  GraphQL query that omits the offset field. `app/src/config/providers.ts` wraps
  the SDK provider to avoid this.

## Dependency versions (verified against the support matrix)

| Package | Version | Source |
|---|---|---|
| `@midnight-ntwrk/wallet-sdk` | `1.1.0` | `app/package.json` — pinned; verify against https://docs.midnight.network/relnotes/support-matrix for the Preview row. `npm view @midnight-ntwrk/wallet-sdk latest` returns `1.1.0` even though `1.2.0` is published — use `npm view … versions --json` and the matrix, not `latest`. |
| `@midnight-ntwrk/compact-runtime` | `0.16.0` | Matches ledger-v8 8.1.0 |
| `@midnight-ntwrk/ledger-v8` | `8.1.0` | Preview network target |
| All `midnight-js-*` packages | `4.1.1` | SDK stack, consistent across `app/`, `tests/`, `ui/` |
