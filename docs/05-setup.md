# 05 — Setup pre-evento (checklist por persona)

> **Todo esto va hecho antes del viernes 7/8 a las 10:00, cada uno en su
> casa.** Nada de acá es código de proyecto, así que no viola la regla
> *net-new code* (instalar tooling, leer docs y practicar con contratos
> descartables está permitido — sin guardar código).

## Checklist común (los cuatro)

- [ ] Node.js 22+ (ideal 24+) — `node --version`
- [ ] Docker — `docker --version`
- [ ] **Compilador Compact** — `compact --version` tiene que responder
- [ ] Extensión Compact para VS Code
- [ ] Cuenta de GitHub con acceso al repo del equipo (Gabriel la crea el viernes 10:00)
- [ ] Discord del evento: #hack-buenos-aires y announcements
- [ ] Grupo de WhatsApp/Telegram del equipo creado
- [ ] Leído: `00-idea.md` + lo indicado para tu rol en `03-equipo.md §1`

## Checklist adicional por rol

**GABRIEL y JUAN (crítico — el gate depende de esto):**
- [ ] **Tutorial Hello World de Midnight end-to-end**: compilar → deployar →
      interactuar. *Llegar sin esto quema medio hackathon en setup.*
- [ ] Proof server local levantado una vez (imagen Docker oficial)
- [ ] Wallet Lace + tDUST de la faucet de testnet
- [ ] Juan: leído el ejemplo oficial de commitment/nullifier en Compact y el
      tutorial del lenguaje (dual-ledger, `disclose()`, witnesses)

**GERMAN:**
- [ ] Stack de UI elegido y con boilerplate practicado (el que ya domine —
      nada de frameworks nuevos un viernes de hackathon)
- [ ] Mirado cómo midnight-js conecta frontend ↔ contrato (docs oficiales)

**SANTIAGO:**
- [ ] Leído el PDF de reglas oficiales completo (es el árbitro de reglas del equipo)
- [ ] Herramienta de deck elegida + template en blanco
- [ ] OBS o similar probado para grabar el video

## Estado de la máquina de Gabriel (referencia, al 6/8)

| Ítem | Estado |
|---|---|
| Node.js v24 · Docker · Claude Code | ✅ |
| MCP Kapa (docs de Midnight) | ✅ instalado |
| **Compilador Compact** | ❌ **falta — bloqueante** |
| Proof server local · Lace + tDUST · Hello World E2E | ⏸️ pendientes |

## Asistentes de IA (opcionales, recomendados)

```bash
# Kapa — MCP oficial de docs (ya instalado en la máquina de Gabriel)
claude mcp add --transport http midnight https://midnight.mcp.kapa.ai

# Midnight Expert — 16 plugins que ejecutan y verifican código
curl -fsSL https://midnightntwrk.expert/install.sh | bash

# Midskills (comunidad)
npx skills add Kali-Decoder/Midnight-skills -a claude-code -y
```

Comandos clave: `/midnight-verify:verify` · `/midnight-fact-check:check`

## Links

| Qué | Link |
|---|---|
| Docs oficiales (tiene "Ask AI") | https://docs.midnight.network |
| Guía oficial del hackathon | https://midnightfoundation.notion.site/Hack-Buenos-Aires-Hacker-Guide-3a04057b9f2380e8a43afe3836f440e7 |
| Sitio del evento | https://hackbuenosaires.com |
| Reglas oficiales (PDF) | https://mpc.midnight.network/hubfs/Midnight_Hack_Buenos_Aires_Official_Rules.pdf |
| dApps existentes (no repetir) | https://github.com/midnightntwrk/midnight-awesome-dapps |
| Request for Startups | https://midnight.network/request-for-start-ups |

## Conceptos clave (repaso de 2 minutos)

- **Dual-ledger:** `ledger` = estado público on-chain; `witness` = estado
  privado que nunca sale de tu máquina. Diseñar = decidir qué va de cada lado.
- **Compact:** parecido a TypeScript, compila a circuitos ZK. v0.28 trae
  tokens unshielded y OpenZeppelin Compact.
- **`disclose()`:** todo privado por defecto; solo lo marcado se publica.
- **midnight-js:** SDK TypeScript que conecta frontend con contrato.
- **Proof server:** proceso local que genera las pruebas; los witnesses viajan
  solo hasta él.
