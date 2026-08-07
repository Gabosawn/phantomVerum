# AGENTS.md — Midnight Hack BA 2026

## Stack
- Compact (contratos) + TypeScript/React (dApp) + midnight-js (SDK)
- Node 22+ · Compilador Compact 0.5.1 · Proof server local (Docker)
- Red objetivo: **Preview** (no devnet/testnet)

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

## Servicios (slide 15 oficial)
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

## Reglas del evento (no negociables)
- **Codigo 100% net-new desde 7/8 10:00** — NO copiar de repos existentes (ni del prior art)
- Contrato DEBE compilar al entregar → commitear SOLO estados verdes; tag "ultima-verde" siempre
- Commits usan **Conventional Commits** (`feat:`, `fix:`, `docs:`, `test:`, `chore:`) con ID de task (`feat(T2): nullifier por periodo`)
- **El committer SIEMPRE es la persona, nunca el agente** — `git commit --author="Nombre <email>"` o configurar `user.name`/`user.email` antes de commitear
- Congelar contrato temprano; frontend despues; nunca al reves
- Tests por circuit (5-6) — QA vale 15%, casi nadie los hace
- Repo publico, licencia Apache 2.0, label/topic `midnightntwrk`

## Docs (fuente de verdad)
- https://docs.midnight.network — anti-bot: usa `<ruta>.md` o `llms.txt` (Mintlify)
- Ejemplos: github.com/midnightntwrk (create-mn-app, example-zkloan, example-private-party)
- Guia evento: https://midnightfoundation.notion.site/Hack-Buenos-Aires-Hacker-Guide-3a04057b9f2380e8a43afe3836f440e7
