# 02 — Entorno de desarrollo

## Toolchain

- `compact` vive en `~/.local/bin/compact` (NO `~/.compact/bin`)
- Después de instalar: **`compact update` es OBLIGATORIO** — baja compactc y lo setea default.
  `compact --version` funciona igual aunque falte; verificar SIEMPRE `compact compile --version`
- Compilar: `compact compile contrato.compact output/` → genera JS/TS + zkir/
- Proof server: `docker run -p 6300:6300 midnightntwrk/proof-server:latest midnight-proof-server -v`
  (docker = alias de podman, funciona igual)
- Red objetivo: **Preview** (no devnet/testnet)

## Verificación rápida

```bash
which compact && compact --version && compact compile --version
ss -tlnp | grep 6300          # proof server escuchando
curl -s http://localhost:6300/health
```

## Servicios

| Servicio | Local | Preview |
|---|---|---|
| Node | `ws://localhost:9944` | `wss://rpc.preview.midnight.network` |
| Indexer | `http://localhost:8088/api/v4/graphql` | `https://indexer.preview.midnight.network/api/v4/graphql` |
| Proof server | `localhost:6300` | — |

**NO HAY READS SIN INDEXER** — todo queryContractState/balances va por GraphQL del indexer.

## Checklist de máquina

- [ ] Node.js 22+ — `node --version`
- [ ] Docker — `docker --version`
- [ ] Compilador Compact instalado + `compact update` ejecutado
- [ ] `compact compile --version` responde (no solo `compact --version`)
- [ ] Proof server arriba en `localhost:6300`
- [ ] `queryContractState` contra el indexer de preview funciona (no solo el local)
- [ ] Wallet Lace + tDUST de preview faucet
- [ ] Hello World E2E: compilar → deployar → interactuar completo

## Links

| Recurso | Link |
|---|---|
| Docs oficiales | https://docs.midnight.network |
| Compatibility matrix (versiones) | https://docs.midnight.network/relnotes/support-matrix |
| dApps existentes | https://github.com/midnightntwrk/midnight-awesome-dapps |
| Ejemplos oficiales | https://github.com/midnightntwrk (create-mn-app, example-zkloan, example-private-party) |

## Conceptos clave

- **Dual-ledger:** `ledger` = estado público on-chain; `witness` = estado
  privado que nunca sale de tu máquina. Diseñar = decidir qué va de cada lado.
- **Compact:** parecido a TypeScript, compila a circuitos ZK. Versión 0.5.1.
- **`disclose()`:** todo privado por defecto; solo lo marcado se publica.
- **`assert`:** falla local en proof time — nada inválido llega a la chain.
- **midnight-js:** SDK TypeScript que conecta frontend con contrato.
- **Proof server:** proceso local que genera las pruebas; los witnesses viajan
  solo hasta él. **Nunca recibe seed ni signing keys.**
- **Indexer (GraphQL):** única vía para leer estado on-chain (`queryContractState`,
  balances). No hay lecturas directas sin indexer.
