# 07 — Handoff para la auditoría completa

> **Cómo usar este documento.** Abrí una sesión nueva de Claude Code en la raíz
> del repo y decile: *"Leé `docs/07-auditoria-handoff.md` y seguilo"*. Todo lo
> que necesita está acá.
>
> Escrito el 8/8 06:5x UTC, después de la auditoría de seguridad de esa noche.

---

## Estado del que partís — no lo re-hagas

El repo pasó por una auditoría el 8/8 que ya está aplicada y en `dev`. Cambió
el contrato a **v2** y el formato de export a **v3**:

- `receiptOf(reportId, prosecutorNonce)` reemplazó a `authorshipOf` — el secret
  salió del preimagen, así que el fiscal verifica **recomputando** en vez de
  que le entreguen algo secreto. El nonce es un **witness**, no un argumento
  público (si fuera público caería en el transcript y cualquiera que lo scrapee
  podría hacerse pasar por el destinatario).
- `nullifierOf(sec, period)` — se sacó `orgId`, que era un operando público sin
  restringir. Con él adentro, registrar una org fantasma (que es gratis) le
  compraba a la misma credencial otra denuncia por época.
- `credentials: HistoricMerkleTree<16>` (era 8). Depth 8 era un kill switch
  permanente: 256 inserciones basura bloqueaban la emisión para siempre en un
  contrato inmutable.
- `issueCredential` autenticado contra el anchor de la org vía witness
  `issuerSecret()`. El anchor era estado muerto hasta entonces.
- Export v3 = `{version, reportId, receipt}`. Dos campos, ningún secreto.

**Ya verificado, no hace falta re-verificarlo:** 375 checks verdes
(contracts 87 · app 172 · ui 68 · tests 48), contrato deployado en Preview
`aeb44bb55ab8c2eff09889ee179d18b6877b74fdc3bb316aebe45eed46c12815`
(bloque 325503), los 4 actos corriendo end-to-end contra él (bloques
325613 / 325618 / 325623 / 325627), CI verde desde clone limpio, y ambos
contratos compilando con 0.31.1.

---

## Los dos objetivos de esta auditoría

Tienen el mismo peso. **No termines uno y des la auditoría por hecha.**

### OBJETIVO 1 — que la documentación y el código digan lo mismo. Cero mentiras.

Toda afirmación del repo tiene que ser cierta contra el código que shippea. Si
una afirmación no se sostiene hay dos salidas legítimas —**corregirla** o
**declararla como limitación conocida**— y una ilegítima: dejarla.

Esto incluye afirmaciones que *fueron* ciertas y dejaron de serlo, que es el
caso peligroso: nadie las revisa porque alguna vez se verificaron. Ya pasó tres
veces en una sola noche:

1. `docs/05` §1 afirmaba que `orgId` no es público. Falso: los argumentos de
   circuito son public inputs (`num_inputs: 3` en `report.zkir`).
2. Contrato, UI y docs decían "designated verifier". No lo es —
   `proveAuthorship.zkir` no contiene ningún opcode `member`.
3. El Q&A del hackathon respondía con fórmulas del contrato v1.

**Buscá el cuarto, el quinto y el sexto.** Barré todo, no solo el README:

- `README.md` — sobre todo "Known limitations" y "Deployed on Preview"
- `docs/**` y `contracts/README.md`
- comentarios de los `.compact`
- docstrings de `app/` y `shared/`
- **el copy de las vistas de `ui/`** — eso es lo que sale en pantalla en el
  video, así que una fórmula vieja ahí queda grabada

**Método:** `/midnight-fact-check:check` sobre los docs. Y para cualquier
afirmación sobre qué es público o qué prueba el circuito, **andá al ZKIR**
(`/midnight-verify:verify` + `verify-by-zkir-inspection`) — así se cazó el
error 1. No aceptes "lo dice la doc" como evidencia: la doc es justamente lo
que estás auditando.

### OBJETIVO 2 — que el código esté bien

Independiente del primero: aunque todo estuviera bien documentado, el código
puede estar mal. Auditá en este orden:

- **Seguridad del contrato** — `/compact-core:audit-compact`. Frontera de
  confianza del witness, control de acceso, separación de dominios, reuso de
  randomness, qué se filtra por los mensajes de assert.
- **Corrección** — que los circuitos hagan lo que dicen.
  `/midnight-verify:verify` y `verify-correctness`. Compilar no alcanza:
  **compilar Y ejecutar**.
- **Witness ↔ contrato** — `verify-by-witness`: que las implementaciones TS
  correspondan a las declaraciones Compact.
- **Calidad de los tests** — `midnight-cq:quality-check` y `compact-testing`.
  Los 375 pasan; la pregunta es si prueban lo que dicen probar. Ya hubo un test
  verde que afirmaba una propiedad falsa: el bloque `[HIGH-1]` de
  `sec-audit.mjs` variaba solo `period` y nunca `orgId`, así que daba verde
  mientras el agujero estaba abierto. **Buscá más de esos** — un test verde por
  el motivo equivocado es peor que uno rojo.
- **Coherencia de capas** — idea ↔ arquitectura ↔ contrato ↔ app ↔ UI. Que
  `shared/src/crypto.ts` sea espejo exacto del `.compact`, y que
  `tests/src/harness/contract-surface.ts` esté al día.
- **Privacidad operativa** — que no haya secrets ni evidencia en logs,
  transcript ni UI.

---

## Regla de oro

Tu conocimiento de entrenamiento sobre Midnight y Compact **no es confiable**.
Compilar no alcanza: hay que **compilar Y ejecutar**. Verificá antes de
afirmar. Para eso están las skills de abajo — usalas, no respondas de memoria.

---

## Skills de Midnight disponibles — cuál usar en cada caso

### Verificación (lo primero que tenés que agarrar)

- `/midnight-verify:verify` — verificar cualquier claim sobre Midnight, Compact
  o el SDK. **El caballito de batalla de esta auditoría.**
- `/midnight-verify:fast-verify` — igual pero source-first, más rápido y
  barato. Para barridos amplios.
- `midnight-verify:verify-compact` — claims de sintaxis/semántica Compact
- `midnight-verify:verify-correctness` — corrección de un contrato
- `midnight-verify:verify-witness` / `verify-by-witness` — que el witness TS
  corresponda al contrato
- `midnight-verify:verify-zkir` / `verify-by-zkir-inspection` /
  `verify-by-zkir-checker` — **acá se resuelve qué es público**: inspeccionar
  `report.zkir` es como se detectó el error de `docs/05` §1
- `midnight-verify:zkir-regression` — que un cambio no infle el circuito
- `midnight-verify:verify-by-execution` / `verify-by-cli-execution` — ejecutar,
  no solo compilar
- `midnight-verify:verify-by-source` / `verify-by-ledger-source` /
  `verify-by-wallet-source` — ir al código del compilador / ledger / wallet
- `midnight-verify:verify-by-type-check` — claims de tipos del SDK
- `midnight-verify:verify-sdk` / `verify-ledger` / `verify-wallet-sdk` /
  `verify-tooling` — por dominio
- `midnight-verify:verify-by-devnet` — E2E contra devnet local

### Fact-check de documentación (hecho a medida para el patrón de fallo)

- `/midnight-fact-check:check` — extrae claims de un doc, los clasifica y
  verifica uno por uno. **Correlo sobre `README.md` y `docs/`.**
- `/midnight-fact-check:fast-check` — versión rápida, solo source
- `midnight-fact-check:fact-check-extraction` / `-classification` /
  `-reporting` — las etapas por separado

### Contrato y seguridad

- `/compact-core:audit-compact` — auditoría adversarial de seguridad
- `/compact-core:review-compact` — review en 10 categorías
- `/compact-core:debug-contract` — si algo no compila o falla
- `compact-core:compact-security` — modelo de amenaza, frontera de confianza
  del witness, el anti-patrón `ownPublicKey()`
- `compact-core:compact-privacy-disclosure` — `disclose()`, qué es público,
  nullifiers, commitments, membership por Merkle
- `compact-core:compact-review` — los checklists por categoría
- `compact-core:compact-language-ref` — sintaxis, tipos, operadores
- `compact-core:compact-standard-library` — **qué existe de verdad en la
  stdlib** (evita inventar funciones)
- `compact-core:compact-ledger` — ADTs, `Map`/`Set`/`MerkleTree`, reglas de
  disclosure en escrituras
- `compact-core:compact-structure` — anatomía del contrato
- `compact-core:compact-witness-ts` — el puente witness ↔ TypeScript
- `compact-core:compact-circuit-costs` — costo de gates, `transientHash` vs
  `persistentHash`, desenrollado de loops
- `compact-core:compact-transaction-model` — fase garantizada vs falible,
  `kernel.checkpoint()`, fees DUST
- `compact-core:compact-patterns` — patrones reutilizables
- `compact-core:compact-tokens` — tokens shielded/unshielded. No aplica acá: el
  contrato no mueve tokens, y **confirmarlo es parte de la auditoría** (es lo
  que evita publicar la address del denunciante)
- `compact-core:compact-debugging` — errores del compilador
- `compact-examples:code-examples` — ejemplos que compilan de verdad

### Calidad y tests

- `midnight-cq:quality-check` — correr y leer lint / tsc / vitest / compile
- `midnight-cq:compact-testing` — testear circuitos con el simulador
- `midnight-cq:dapp-testing` / `dapp-connector-testing` — UI y wallet
- `midnight-cq:ledger-testing` — construcción de transacciones
- `midnight-cq:wallet-testing` — variantes de wallet
- `midnight-cq:quality-init` — si falta tooling (no debería)

### App, SDK y UI

- `midnight-dapp-dev:midnight-sdk` — providers, `deployContract`,
  `findDeployedContract`, ciclo de vida de la tx
- `midnight-dapp-dev:core` — patrones de frontend
- `midnight-dapp-dev:dapp-connector` — Lace, `window.midnight`
- `midnight-wallet:wallet-sdk` / `managing-test-wallets` /
  `sdk-regression-check`

### Infraestructura

- `/midnight-tooling:doctor` — diagnóstico de toolchain, PATH, proof server
- `midnight-tooling:compact-cli` — flags y comportamiento del CLI
- `midnight-tooling:proof-server` — **relevante**: el contenedor corre con
  `-p 6300:6300` (todas las interfaces); los docs ya se corrigieron a loopback
  pero el contenedor vivo no
- `midnight-tooling:devnet` / `devnet-health` — devnet local
- `midnight-tooling:troubleshooting` / `release-notes`
- `midnight-indexer:indexer-graphql-api` — **la API v4 que usa el README**;
  `Transaction` es una interfaz, `transactionResult` vive en
  `RegularTransaction`
- `midnight-indexer:indexer-data-model` / `-architecture` / `-operations`
- `midnight-node:node-rpc-api` / `-operations` / `-architecture` /
  `-configuration` / `-governance` / `-validator`
- `proof-server:proof-server-api` / `-configuration` / `-operations` /
  `-integration` / `-architecture`
- `/midnight-status-codes:lookup` — descifrar códigos de error

### Conceptos (si hay que justificar una decisión en el deck)

- `core-concepts:privacy-patterns` — commitments, nullifiers, membership,
  separación de dominios
- `core-concepts:zero-knowledge` — witness, prover/verifier, constraints
- `core-concepts:architecture` — estructura de tx, fases, binding
- `core-concepts:protocols` — Kachina, Zswap
- `core-concepts:data-models` — UTXO vs cuentas, nullifiers
- `core-concepts:tokenomics` — NIGHT / DUST

### Ecosistema

- `midnight-expert:add-to-ecosystem` — elegibilidad Electric Capital.
  **Ya hecho**: topics `midnightntwrk` y `compact` puestos y confirmados por API.

### Agentes especializados (si el usuario habilita subagentes)

`compact-core:security-reviewer` · `compact-core:compact-dev` ·
`compact-core:reviewer` · `midnight-verify:zkir-checker` ·
`midnight-verify:contract-writer` · `midnight-verify:source-investigator` ·
`midnight-verify:witness-verifier` · `midnight-verify:type-checker` ·
`midnight-verify:sdk-tester` · `midnight-verify:cli-tester` ·
`midnight-cq:cq-reviewer` · `midnight-cq:cq-runner` ·
`midnight-fact-check:claim-extractor` ·
`midnight-fact-check:domain-classifier` · `core-concepts:concept-explainer` ·
`midnight-dapp-dev:dev`

### ⚠️ Skills locales del repo — tratar como sospechosas, NO editar

`.agents/skills/` tiene 11 skills vendored de `Kali-Decoder/Midnight-skills`,
fijadas por hash en `skills-lock.json`:

`compact` · `indexer` · `midnight-environment-setup` · `midnight-js` ·
`midnight-onchain-logic` · `midnight-rpc` · `midnight-security` ·
`midnight-storage` · `midnight-transactions` · `react-wallet-connector` ·
`testing`

Son de terceros y **editarlas invalida el lock** (y se pisan en la próxima
sincronización). Ya hubo un intento de "corregir" `midnight-security` porque
afirma que los argumentos de circuito son públicos — resultó que **la skill
tenía razón** y el doc que la acusaba estaba mal. Si encontrás algo que parece
un error ahí, **verificalo contra el ZKIR antes de tocar nada**.

---

## Restricciones

- **No toques `main`** sin permiso explícito. Está muy atrás de `dev` y el
  merge es decisión del usuario.
- **No actualices el toolchain.** Está pinneado en 0.31.1 a propósito: 0.33 es
  ledger 9 y Preview no lo corre.
- **No redeployes** sin pedirlo. Invalidaría la evidencia E2E y el run de CI.
- Faltan **deck y video** — 2 de los 3 entregables (repo + deck + video).
  Ninguna auditoría de código cambia eso. Si el tiempo aprieta, **decilo** en
  vez de seguir auditando.
