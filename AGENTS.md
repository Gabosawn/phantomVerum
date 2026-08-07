# AGENTS.md — PhantomTrace (Testigo)

## Stack
- Compact (contratos) + TypeScript/React (dApp) + midnight-js (SDK)
- Node 22+ · Compilador Compact 0.5.1 · Proof server local (Docker)
- Red objetivo: **Preview** (no devnet/testnet)

## Estructura del monorepo (npm workspaces)
```
contracts/   → @phantomtrace/contracts  (Compact, compilar con compact compile)
app/         → @phantomtrace/app        (wiring TS: witnesses, scripts, config)
ui/          → @phantomtrace/ui         (React + Vite, 3 vistas)
tests/       → @phantomtrace/tests      (Vitest + simulación E2E)
```
- `npm install` en raíz instala todas las workspaces
- `npm run compile` — compila contratos
- `npm test` — corre tests
- `npm run simulate` — simulación E2E

## Toolchain verificada
- `compact` vive en `~/.local/bin/compact` (NO `~/.compact/bin`)
- Despues de instalar: `compact update` es OBLIGATORIO (baja compactc y lo setea default).
  `compact --version` funciona igual aunque falte — verificar SIEMPRE `compact compile --version`
- Compilar: `compact compile contrato.compact output/` → genera JS/TS + zkir/
- Proof server: `docker run -p 6300:6300 midnightntwrk/proof-server:latest midnight-proof-server -v`
  (docker = alias de podman en esta maquina, funciona igual)
- Verificacion rapida:
  - `which compact && compact --version && compact compile --version`
  - `ss -tlnp | grep 6300` (proof server escuchando)
  - `curl -s http://localhost:6300/health` (o probar un deploy local)

## Servicios
- Node: ws://localhost:9944 (local) · wss://rpc.preview.midnight.network (preview)
- Indexer: http://localhost:8088/api/v4/graphql (local) · https://indexer.preview.midnight.network/api/v4/graphql
  **NO HAY READS SIN INDEXER** — todo queryContractState/balances va por GraphQL del indexer
- Proof server: localhost:6300 — requerido para cada transaccion; nunca recibe seed ni signing keys
- Faucet: Preview faucet (tDUST de preview) · Wallet: Lace

## Arquitectura (Testigo)
- Ledger (publico): hash emisor de organizaciones, hashes de denuncia + timestamp, nullifiers anti-spam
- Witness (privado): credencial del denunciante, evidencia, secret
- Circuits: `registrarOrganizacion` · `denunciar` (commitment + nullifier) · `revelarAutoria`
- Regla de oro: `disclose()` solo lo minimo (✅/hash/nullifier). Nunca evidencia ni identidad
- `assert` falla local en proof time — nada invalido llega a la chain

## Convenciones
- Commits con **Conventional Commits** (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`)
- `main` siempre compila — commitear solo estados verdes
- Adaptar SINTAXIS del spec a la version instalada de Compact, nunca la SEMANTICA (ver `docs/01-arquitectura.md` §8)
- Tests por circuit — ver suite en README.md

## Docs (fuente de verdad)
- `docs/00-idea.md` — la idea y el diferencial
- `docs/01-arquitectura.md` — spec de los 3 circuitos y el ledger (LEER ANTES de codear)
- `docs/02-entorno.md` — setup de toolchain y servicios
- https://docs.midnight.network — anti-bot: usa `<ruta>.md` o `llms.txt` (Mintlify)
- Ejemplos: github.com/midnightntwrk (create-mn-app, example-zkloan, example-private-party)

## OpenCode Skills (instalados en el repo)
- `compact` — lenguaje de contratos · `midnight-js` — SDK frontend
- `testing` — tests · `indexer` — GraphQL queries
- `midnight-security` — seguridad ZK · `midnight-environment-setup` — entorno
- `midnight-transactions` — tx · `midnight-onchain-logic` — diseno de circuitos
- `midnight-storage` — storage · `midnight-rpc` — conexion nodos
- `react-wallet-connector` — integracion Lace en React
