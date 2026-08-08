# AGENTS.md — PhantomTrace

## Stack
- Compact (contracts) + TypeScript/React (dApp) + midnight-js (SDK)
- Node 22+ · Compact Compiler 0.31.1 (language 0.23.0, runtime 0.16.0) · Proof server local (Docker)
- Target network: **Preview**. A local devnet is the rehearsal step before it —
  see `docs/05-deploy-local.md`

## Monorepo structure (npm workspaces)
```
contracts/   → @phantomtrace/contracts  (Compact, compile with compact compile)
app/         → @phantomtrace/app        (TS wiring: witnesses, scripts, config)
ui/          → @phantomtrace/ui         (React + Vite: cliente + explorer + sistema)
tests/       → @phantomtrace/tests      (Vitest + E2E simulation)
```
- `npm install` at root installs all workspaces
- `npm run compile` — compiles contracts
- `npm test` — runs tests
- `npm run simulate` — E2E simulation

## Verified toolchain
- `compact` lives at `~/.local/bin/compact` (NOT `~/.compact/bin`)
- After installing: `compact update` is MANDATORY (downloads compactc and sets it as default).
  `compact --version` works even if it's missing — ALWAYS verify `compact compile --version`
- Compile: `compact compile contract.compact output/` → generates JS/TS + zkir/
- Proof server: `docker run -d -p 127.0.0.1:6300:6300 --name phantomtrace-proof-server midnightntwrk/proof-server:8.1.0 midnight-proof-server`
  ⚠️ **No `-v`, and bind to loopback.** Midnight's own install snippet passes
  `-v`, which turns on `debug!("Received request: {hex}")` for every `/prove`
  — a hex dump of every witness and every coin secret key into `docker logs`.
  And a bare `-p 6300:6300` publishes the server on every interface, with
  permissive CORS and no TLS. Neither is theoretical; both were found running.
  (pin the tag to 8.1.0 — `:latest` drifts away from ledger-v8 8.1.0.
  This machine runs real Docker 29.6.2, not a podman alias)
- Quick verification:
  - `which compact && compact --version && compact compile --version`
  - `ss -tlnp | grep 6300` (proof server listening)
  - `curl -s http://localhost:6300/` → `{"status":"ok","timestamp":...}`
    (`/health` answers the same on 8.1.0; an unknown path 404s)

## Services
- Node: ws://localhost:9944 (local) · wss://rpc.preview.midnight.network (preview)
- Indexer: http://localhost:8088/api/v4/graphql (local) · https://indexer.preview.midnight.network/api/v4/graphql
  **NO READS WITHOUT INDEXER** — all queryContractState/balances goes through the indexer's GraphQL
- Proof server: localhost:6300 — required for every transaction; never receives seed or signing keys
- Faucet: Preview faucet (tDUST from preview) · Wallet: Lace

## Architecture (PhantomTrace)
- Ledger (public): organization issuer hash, report hashes + timestamp, anti-spam nullifiers
- Witness (private): whistleblower credential, evidence, secret
- Circuits: `registerOrganization` · `report` (commitment + nullifier) · `revealAuthorship`
- Golden rule: `disclose()` only the minimum (✅/hash/nullifier). Never evidence or identity
- `assert` fails locally at proof time — nothing invalid reaches the chain

## Conventions
- Commits with **Conventional Commits** (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`)
- `main` always compiles — only commit green states
- Adapt SYNTAX of the spec to the installed version of Compact, never the SEMANTICS (see `docs/01-arquitectura.md` §8)
- Per-circuit tests — see suite in README.md

## Docs (source of truth)
- `docs/00-idea.md` — the idea and the differentiator
- `docs/01-arquitectura.md` — spec of the 3 circuits and the ledger (READ BEFORE coding)
- `docs/02-entorno.md` — toolchain and services setup
- https://docs.midnight.network — anti-bot: use `<path>.md` or `llms.txt` (Mintlify)
- Examples: github.com/midnightntwrk (create-mn-app, example-zkloan, example-private-party)

## OpenCode Skills (installed in the repo)
- `compact` — contract language · `midnight-js` — frontend SDK
- `testing` — tests · `indexer` — GraphQL queries
- `midnight-security` — ZK security · `midnight-environment-setup` — environment
- `midnight-transactions` — tx · `midnight-onchain-logic` — circuit design
- `midnight-storage` — storage · `midnight-rpc` — node connection
- `react-wallet-connector` — Lace integration in React
