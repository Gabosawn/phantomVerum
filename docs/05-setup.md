# 05 — Setup pre-evento

> **Todo esto va hecho antes del viernes 7/8 a las 10:00.** Nada de aca es
> codigo de proyecto — instalar tooling, leer docs y practicar con contratos
> descartables esta permitido (sin guardar codigo).

## Toolchain

- `compact` vive en `~/.local/bin/compact` (NO `~/.compact/bin`)
- Despues de instalar: **`compact update` es OBLIGATORIO** — baja compactc y lo setea default.
  `compact --version` funciona igual aunque falte; verificar SIEMPRE `compact compile --version`
- Compilar: `compact compile contrato.compact output/` → genera JS/TS + zkir/
- Proof server: `docker run -p 6300:6300 midnightntwrk/proof-server:latest midnight-proof-server -v`
  (docker = alias de podman, funciona igual)
- Red objetivo: **Preview** (no devnet/testnet)

## Verificacion rapida

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

## Checklist comun

- [ ] Node.js 22+ — `node --version`
- [ ] Docker — `docker --version`
- [ ] Compilador Compact instalado + `compact update` ejecutado
- [ ] `compact compile --version` responde (no solo `compact --version`)
- [ ] Extension Compact para VS Code
- [ ] Proof server arriba en `localhost:6300`
- [ ] `queryContractState` contra el indexer de preview funciona (no solo el local)
- [ ] Wallet Lace + tDUST de preview faucet
- [ ] Hello World E2E: compilar → deployar → interactuar completo
- [ ] Leido: `00-idea.md` + `01-arquitectura.md`

## Herramientas de IA

### Kapa — MCP de docs oficiales (configurado)
```bash
# OpenCode: ya configurado via opencode.json
# Claude Code:
claude mcp add --transport http midnight https://midnight.mcp.kapa.ai
```
Kapa es el unico MCP necesario — responde consultas tecnicas sobre la documentacion
oficial de Midnight. Con OpenCode, el `AGENTS.md` del repo mas Kapa cubren todo.

Opcional, solo Claude Code: Midnight Expert (`curl -fsSL https://midnightntwrk.expert/install.sh | bash`) y Midskills (`npx skills add Kali-Decoder/Midnight-skills -a claude-code -y`).

## Links

| Recurso | Link |
|---|---|
| Docs oficiales | https://docs.midnight.network |
| Compatibility matrix (versiones) | https://docs.midnight.network/relnotes/support-matrix |
| Guia del hackathon | https://midnightfoundation.notion.site/Hack-Buenos-Aires-Hacker-Guide-3a04057b9f2380e8a43afe3836f440e7 |
| Reglas oficiales (PDF) | https://mpc.midnight.network/hubfs/Midnight_Hack_Buenos_Aires_Official_Rules.pdf |
| dApps existentes | https://github.com/midnightntwrk/midnight-awesome-dapps |
| Workshop video | https://drive.google.com/file/d/10mkXGGjZwSfFTcjrFh1719IvJXwSsPwG/view |

## Conceptos clave

- **Dual-ledger:** `ledger` = estado público on-chain; `witness` = estado
  privado que nunca sale de tu máquina. Diseñar = decidir qué va de cada lado.
- **Compact:** parecido a TypeScript, compila a circuitos ZK. Version 0.5.1.
- **`disclose()`:** todo privado por defecto; solo lo marcado se publica.
- **`assert`:** falla local en proof time — nada invalido llega a la chain.
- **midnight-js:** SDK TypeScript que conecta frontend con contrato.
- **Proof server:** proceso local que genera las pruebas; los witnesses viajan
  solo hasta el. **Nunca recibe seed ni signing keys.**
- **Indexer (GraphQL):** unica via para leer estado on-chain (`queryContractState`,
  balances). No hay lecturas directas sin indexer.
