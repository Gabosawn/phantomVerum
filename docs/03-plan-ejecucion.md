# 03 — Plan de ejecución mejorado

> Extiende el plan de 4 bloques del README con lo que le faltaba: el rubric
> oficial del evento, las decisiones técnicas ya validadas contra el compilador
> real, los contratos de datos entre bloques, el bloque de entrega (deck/video)
> y un timeline horario. Todo lo afirmado acá fue verificado el vie 7/8:
> contra el compilador 0.31.1 compilando contratos de prueba, contra la
> compatibility matrix oficial, contra GitHub/npm, y contra las reglas
> publicadas del evento.

---

## 0. Lo que manda: el rubric oficial de BA 2026

Fuente: [reglas oficiales](https://hackbuenosaires.com/rules) ·
[PDF vinculante](https://mpc.midnight.network/hubfs/Midnight_Hack_Buenos_Aires_Official_Rules.pdf)

| Criterio | Peso |
|---|---|
| **Engineering & Implementation** | **40 %** |
| QA & Reliability | 15 % |
| Product & Vision | 15 % |
| UX & Design | 15 % |
| Communication | 10 % |
| BizDev & Viability | **5 %** |

**Lectura:** 55 % del puntaje es Engineering + QA. Cada hora en deploy real,
tests y demo funcional rinde ~8× más que una hora en slides de negocio.
BizDev = **una sola slide**.

**Gate de descalificación explícito:** *"if the submitted Compact contract
does not compile, the project is automatically disqualified."* Además: repo
público + deck + demo/video antes del sáb 13:00 ART (entrega incompleta = DQ),
topic `midnightntwrk` obligatorio, Apache 2.0, README claro.

**Evidencia de qué gana:** Dawn ganó el premio grande ($3.500) con deploy real
en testnet + Lace integrada; depapp ganó solo Best Tutorial ($500) con
transaction hashes *mockeados*. La diferencia fue el deploy real. Es el 40 %.

---

## 1. Anti-DQ checklist — hacer primero (≈1 h)

| # | Ítem | Estado verificado | Acción |
|---|---|---|---|
| 1 | Topic `midnightntwrk` | ❌ `repositoryTopics: null` | `gh repo edit Gabosawn/phantomVerum --add-topic midnightntwrk --add-topic compact` |
| 2 | Node ≥ 22 | ❌ instalado v20.19.4 | `nvm install 22 && nvm use 22` **antes** del primer `npm install` |
| 3 | Deps `@midnight-ntwrk/*` | ❌ ningún package.json las declara | Pinnear exacto (verificado contra matrix Preview): midnight-js **4.1.1**, compact-runtime **0.16.0**, dapp-connector-api **4.0.1**, testkit-js **4.1.1**. `npm install` + commitear lockfile |
| 4 | Scripts npm rotos | ❌ (ver §1.1) | Arreglar antes de que exploten en integración |
| 5 | tDUST del faucet Preview | pendiente | Pedir HOY (los faucets se caen/rate-limitean) |
| 6 | `.env.example` | ❌ no existe (el .gitignore lo permite) | Crear con `DEPLOY_SEED=`, `NETWORK=preview` |
| 7 | Proof server pinneado | ⚠️ corre `:latest` | Usar `:8.1.0` (el de la matrix Preview) |
| 8 | Licencia Apache 2.0 | ✅ | — |
| 9 | Repo público | ✅ | — |
| 10 | Commits post-kickoff | ✅ todos de hoy, 11:14+ | Agregar 1 línea al README declarando `.agents/` como tooling de IA de terceros, no código del producto |

### 1.1 Scripts npm rotos (verificados)

- `package.json` raíz: `"build": "npm run build --workspaces"` falla porque
  `contracts/` no tiene script `build` → usar `--workspaces --if-present`.
- `app/` y `tests/` no tienen `"type": "module"` pero el tsconfig emite ES2022
  → `node dist/...` tira `Cannot use import statement outside a module`.
  Además cambiar a `module`/`moduleResolution: NodeNext` en los workspaces
  Node (con `bundler` los imports relativos sin `.js` rompen en runtime).
- `tests/`: `"simulate": "node dist/simulation/e2e.js"` pero nada genera ese
  `dist/` → agregar script `build`.
- `"lint"` invoca eslint que no está instalado y con sintaxis de eslint 8 →
  borrarlo (con 24 h no se instala un linter).

---

## 2. Decisiones técnicas — ya validadas compilando contra 0.31.1

Un agente escribió y compiló contratos de prueba para cada punto del spec
(§3–§5 de `01-arquitectura.md`). Resultados:

### 2.1 La Opción A (Merkle) VA — y ya existe compilando

- `HistoricMerkleTree<8, Bytes<32>>` + `merkleTreePathRoot` + `checkRoot`
  existen en 0.31.1. **El contrato completo de la Opción A compila y genera
  claves PLONK (46 s).** También la B (26 s). No hay bloqueo técnico.
- **Variante elegida: árbol global con `orgId` dentro de la hoja**
  (`hoja = H(dom ‖ orgId ‖ credSecret)`, construida **en circuito** — el
  witness solo aporta los hermanos, no puede mentir sobre qué hoja prueba).
  Probar membership en el árbol global prueba pertenencia *a esa org*: la
  semántica multi-org se conserva.
- Por qué no "raíz por-org en el Map" (más literal al §3): compila igual,
  pero el ledger TS generado no expone helpers de path para esa forma —
  habría que reimplementar el árbol off-chain a mano (3–4 h de riesgo).
  Con el árbol global, el TS generado **regala** `findPathForLeaf()`:
  el witness del path son ~5 líneas.
- `HistoricMerkleTree` (no `MerkleTree`) es obligatorio: con el histórico,
  los paths emitidos siguen válidos después de nuevas inserciones.
- **B queda congelada como red de seguridad**: ambos contratos existen;
  el fallback es cambiar un path de artefacto, no reescribir.

### 2.2 Domain separation — obligatoria, no opcional

`nullifier` y `autoria` comparten shape y el mismo `secret` en posición 0.
Un atacante que registra una org con `orgId = denunciaId` fuerza una colisión
cruzada. Solución validada: tag de dominio en posición 0
(`pad(32, "testigo:nullifier:v1")`, etc.) en los 4 hashes. Un juez técnico
que pregunta por esto recibe respuesta con el tag en el código.

### 2.3 Reglas de `disclose()` (difieren del pseudocódigo del spec)

- **Toda** operación de ledger exige `disclose()` en sus argumentos —
  incluso params públicos de `export circuit` (el compilador los trata como
  potencialmente-witness). Esto aplica a `insert`, `lookup`, `member`,
  `checkRoot`.
- Los `assert` sobre comparaciones derivadas de witness **no** llevan
  `disclose()` (la C1 de `revelarAutoria` va limpia).

### 2.4 Ventaja para la demo: pure circuits exportados

`denunciaIdDe`, `nullifierDe`, `autoriaDe`, `hojaDe` como
`export pure circuit` → aparecen en el TS generado como funciones puras.
La app calcula `denunciaId` y la verificación del fiscal **localmente, sin
proof server**. `verificarAutoria` off-chain sale gratis.

### 2.5 Trampas de sintaxis 0.23 (para no perder tiempo)

`goes_left` es snake_case (única inconsistencia del stdlib) ·
`MerkleTree.root()` es runtime-only, en circuito se usa `checkRoot(digest)` ·
`firstFree()` no existe in-circuit · `Opaque<"string">` **no es hasheable**
(`periodo` queda `Bytes<32>`; `Uint<32>` con cast también funciona) ·
`pad(32, ...)` exige literales → los tags de dominio van como circuits helper.

### 2.6 Endurecimientos incluidos + debilidad a declarar

- Guards de idempotencia: `Set.insert` es idempotente, sin
  `assert(!member(...))` un re-envío pasaría en silencio. Incluidos en
  denuncias, nullifiers y autorías.
- `assert(organizaciones.member(orgId))` antes del `lookup` (error legible).
- **Declarar de frente** (deck + README): `registrarOrganizacion` /
  `emitirCredencial` no tienen control de acceso — coherente con "emisor
  mock", igual que declaramos el anti-spam débil de B.

Los contratos de referencia (A, B y probes por punto) están compilados en el
scratchpad de la sesión; portarlos a `contracts/src/` es el primer ítem del
Bloque A.

---

## 3. Contratos de datos entre bloques — congelar ANTES de arrancar

El plan original dice "mocks + integración al final" pero no define contra qué
mockear. Esto es lo que faltaba. **Congelado acá; si hay que cambiarlo, se
avisa a todos los bloques.**

### 3.1 API de `app/` (lo que C y D mockean)

```ts
type Hex32 = string;            // 64 chars hex, sin 0x
type TxResult = { txId: string; blockHeight?: number };

registrarOrganizacion(p: { orgId: Hex32; ancla: Hex32 }): Promise<TxResult>;

// ⚠️ CAMBIADO tras el review de seguridad (§3.4): el cliente genera el secret,
// el emisor solo recibe la hoja. Antes devolvía credencialSecret → permitía al
// emisor recomputar el nullifier de cualquier empleado y desanonimizarlo.
emitirCredencial(p: { orgId: Hex32; credCommitment: Hex32 }): Promise<{ hojaIndex: number; tx: TxResult }>;
  // el CLIENTE hace: credSecret = randomBytes(32); credCommitment = pureCircuits.credCommitmentDe(credSecret)
  // y manda SOLO el commitment. El emisor nunca ve credSecret.
  // El contrato construye la hoja EN CIRCUITO: hojaDe(orgId, credCommitment) — así el
  // orgId validado y el insertado son el mismo (fix de M-1: antes se forjaba
  // credencial para una org nunca registrada).

// ⚠️ `periodo` es Uint<64> = bigint (índice de época de 86400 s), NO el string
// "2026-08". Atado al reloj de la cadena con blockTimeGte/blockTimeLt tras el
// fix de H-1. La app calcula: BigInt(Math.floor(Date.now()/1000/86400)).
// SEGUNDOS, no milisegundos (verificado contra BlockContext.secondsSinceEpoch).
denunciar(p: { orgId: Hex32; periodo: bigint; evidencia: Uint8Array }):
  Promise<{ denunciaId: Hex32; nullifier: Hex32; secretDenuncia: Hex32; tx: TxResult }>;
  // hashea la evidencia LOCAL; lanza CredencialInvalidaError | NullifierRepetidoError (fallan en proof time, sin tx)
  // ⚠️ genera un secretDenuncia FRESCO por denuncia (nunca reusa uno global)

revelarAutoria(p: { denunciaId: Hex32; fiscalPk: Hex32 }):
  Promise<{ autoriaHash: Hex32; tx: TxResult }>;
  // lanza NoSosElAutorError (proof time, sin tx)
  // la app selecciona el secretDenuncia correcto en el private state ANTES de llamar
  // (los witnesses no toman argumentos)

verificarAutoria(p: ExportLlaveAutoria): Promise<{ ok: boolean; enLedger: boolean }>;
  // 100 % off-chain: recomputa con los pure circuits + lee el ledger vía indexer

leerEstadoLedger(): Promise<{ organizaciones: number; denuncias: Hex32[]; nullifiers: number; autorias: Hex32[] }>;
  // para el panel de la UI; vía indexer GraphQL + deserializador generado
```

### 3.2 Formatos que cruzan fronteras

- **Secrets del denunciante** → `secrets/denunciante.json` (ya ignorado por
  git). ⚠️ **CAMBIADO tras el review (§3.4)** — secret POR DENUNCIA, no global:
  ```jsonc
  { "version": 2,
    "credencialSecret": "…", "orgId": "…", "hojaIndex": 3,
    "denuncias": { "<denunciaId>": { "secretDenuncia": "…", "evidenciaHash": "…" } } }
  ```
  Ambos secrets con `crypto.randomBytes(32)` — **nunca** derivados de password
  o seed: la entropía de `secretDenuncia` es lo único que impide invertir
  `denunciaId`, porque `evidenciaHash` es enumerable por el empleador (los
  documentos son suyos).
- **Export de llave de autoría** (lo que la UI exporta y el fiscal carga) →
  `ExportLlaveAutoria = { version: 2, denunciaId, evidenciaHash,
  secretDenuncia, fiscalPk, autoriaHash }`. ⚠️ **Limitación real, decláresela
  en el deck:** quien tiene el export puede verificar la autoría *y actuar
  como el autor*. El secret por denuncia acota el daño a esa sola denuncia
  (antes comprometía todas). Roadmap: prueba ZK al fiscal en vez del paquete.
- **Dirección del contrato** → `app/src/config/deployment.json` commiteado:
  `{ network: "preview", contractAddress, deployTxId, deployedAt,
  compilerVersion: "0.31.1" }`. `ui/` y `tests/` importan de acá. Nunca de
  una env var suelta.
- **Seed de deploy** → `.env` (`DEPLOY_SEED=`), nunca commiteada;
  `.env.example` sí.

### 3.3 Mecanismo de tests del Bloque D (decidido)

Vitest contra el **contrato compilado real** vía
`@midnight-ntwrk/compact-runtime` (simulador local, sin red y sin proof
server) — no mocks puros. Los tests de circuito prueban el `.compact` de
verdad y sobreviven a la integración.

### 3.4 Review de seguridad — hallazgos reproducidos (vie 7/8 14:30)

Un review adversarial corrió repros en el simulador contra el contrato
compilado. **Los 5 hallazgos se reprodujeron corriendo el script**, no son
teóricos. Lo que cambia:

| # | Hallazgo | Estado |
|---|---|---|
| H-1 | `periodo` es parámetro libre → 4 denuncias aceptadas con una credencial variando el período. El anti-spam es evadible | ✅ **ARREGLADO** — `periodo: Uint<64>` índice de época atado a `blockTimeGte`/`blockTimeLt`, época de 86400 s. Solo la época actual es válida. Regresión: 0/3 denuncias extra aceptadas |
| H-2 | El export contiene el witness set completo → **quien lo recibe puede actuar como el autor**: republicó autoría a la pk del empleador y quemó el slot de otro fiscal, bloqueando al autor real para siempre | Mitigado con secret por denuncia + reframe honesto |
| H-3 | `secretPersonal` global reusado en todas las denuncias → un solo reveal desanonimiza retroactivamente todas | **Arreglado en §3.2** (secret por denuncia) |
| H-4 | El emisor generaba `credencialSecret` → podía recomputar el nullifier de cualquier empleado y desanonimizarlo | **Arreglado en §3.1** (el cliente genera, manda solo la hoja) |
| H-5 | La raíz de Merkle revelada es un contador de sincronización → acota el conjunto de anonimato | Regla de witness, abajo |
| M-1 | `emitirCredencial` no liga `orgId` a la hoja: se forjó una credencial para una org no registrada | ✅ **ARREGLADO** — la hoja se construye en circuito con el `orgId` recién validado; nuevo `credCommitmentDe` con tag de dominio |

**Suite de regresión adversarial: `npm test --workspace=contracts` → 47/47**, contra
el contrato compilado real en el simulador (sin red, sin proof server, sin mocks
— el mecanismo de §3.3). Los tests assertean el comportamiento *correcto*, así
que si alguien reintroduce un hallazgo, fallan. Verde también desde clone limpio.

**Reglas que B2 (witnesses) DEBE cumplir por H-5:**
1. **Nunca cachear un Merkle path.** `findPathForLeaf` se llama contra el
   estado fresco del ledger, dentro del witness, en proof time. Es una
   propiedad de seguridad, no una comodidad — comentarlo así en el código.
2. Nunca derivar el path del estado al momento de la emisión (esa raíz es el
   índice propio del denunciante y puede identificarlo unívocamente).
3. **Congelar `emitirCredencial` durante la demo**: si el árbol no se mueve,
   todos revelan la misma raíz y la fuga es cero.
4. Fallar cerrado ante `undefined`, sin distinguir "no sos empleado" de otros
   errores en mensaje ni en timing.

**Sobre el impacto en el video:** el clímax FISCAL ✅ / EMPLEADOR ❌ sigue
siendo cierto *sobre el registro on-chain* (la autoría está ligada a `fiscalPk`
y mostrada a otro no prueba nada). Lo que NO se puede afirmar es que el
paquete off-chain sea no-transferible. Framing honesto para el guión: *"el
registro on-chain está ligado a la clave de ESTE fiscal; el paquete de
evidencia es una suposición de confianza declarada, y la prueba ZK al fiscal
es roadmap"*. Un juez técnico que pincha esto encuentra la respuesta ya en la
slide de limitaciones.

**No verificado — no usar:** el review sugirió reclamar que `orgId`/`periodo`
nunca aparecen en el transcript público. Su test buscaba los valores como
string hex, pero el transcript los codifica como arrays de bytes — el mismo
test dice que `denunciaId` tampoco aparece, y `denunciaId` sí se inserta en el
ledger. La sugerencia puede ser cierta, pero **hay que verificarla decodificando
el transcript antes de afirmarla en el deck.**

---

## 4. Bloques revisados

Cada bloque es ejecutable por una persona o por un agente supervisado; no se
bloquean entre sí porque §3 ya congela las interfaces.

### Bloque A — Contratos (`contracts/`) — ✅ hecho

- [x] Portar el contrato Opción A validado a `contracts/src/testigo.compact`,
      `compact compile` verde **en el repo**
- [x] Script `compile` en contracts/package.json
- [x] Congelar B en `contracts/src/fallback/` (sin usar por default)
- **Entregable:** compile verde commiteado + claves generadas. Es el gate del
  40 % — cumplido.

### Bloque B — Wiring TS (`app/`) — 🟡 API lista; falta CLI + Preview

- [x] Deps pinneadas (§1) + config Preview (`rpc.preview.midnight.network`,
      indexer v4, proof server local :6300)
- [x] Witnesses: `credencialPath()` = `ledger.credenciales.findPathForLeaf(hoja).path`
      (~5 líneas; manejar el `undefined` = "no sos empleado")
- [x] Los 5 métodos de §3.1 + persistencia §3.2
- [x] `verificarAutoria` con pure circuits (sin proof server — gratis)
- [ ] Deploy a Preview + `deployment.json` commiteado (§6) + scripts CLI B4
- **Entregable:** E2E de los 4 tiempos por CLI contra Preview; el caso
  "secret ajeno" falla en proof time sin emitir tx.

### Bloque C — UI (`ui/`) — 🟡 scaffold

- [x] Scaffold de las 3 vistas del README
- [ ] Cablear a `app/` real (hoy stubs)
- [ ] **Panel split "qué ve la cadena / qué nunca sale de tu máquina"** en la
      vista Denunciante — es el artefacto que un juez de privacidad busca
      (15 % UX se gana acá, no en pulido cosmético)
- [ ] **Pantalla de verificación dual** en la vista Fiscal: misma prueba,
      clave del fiscal → ✅ / clave del empleador → ❌. Es EL momento del video
- **Entregable:** 3 vistas contra `app/` real. Legible y proyectable.

### Bloque D — Tests (`tests/`) — ✅ hecho

- [x] Suite por circuito contra el contrato compilado (§3.3) + hardening
      (guards, domain separation, época)
- [x] `npm run simulate`: los 4 tiempos imprimiendo el ledger en cada paso
- **Entregable:** `npm test` verde visible en README/video (QA = 15 % y casi
  nadie lo muestra).

### Bloque E — Entrega (NUEVO — antes no tenía owner ni horario)

- [ ] **Deck** (~9 slides, estructura ya escrita en `contexto-hackathon.md`)
      con dos correcciones obligatorias:
      1. Prior art exacto: **depapp ganó Best Tutorial ($500); el premio
         grande "Protect That Data" fue de Dawn**. La tabla tiene que decirlo
         bien — la precisión fáctica es credibilidad.
      2. Framing del claim, inatacable: *"el primitivo designated-verifier
         existe como librería circom; nadie lo integró en un sistema de
         denuncias funcionando — la autoría diferida como producto solo
         existe en papers. Nosotros somos los primeros en shippearla, y en
         Midnight."* Bonus: Dawn declara literal *"your identity is never
         revealed"* — citarlo como estado del arte a superar.
      3. Slide de limitaciones honestas (emisor mock, sin access control en
         registro, veracidad, metadata off-chain) — la honestidad preventiva
         desarma al juez técnico. BizDev: UNA slide (5 %).
- [ ] **Video ≤ 3 min** — guión con timestamps:
      0:00–0:20 hook (SEC: probar que fuiste el primero sin quemarte) ·
      0:20–0:40 tabla prior art, columna "¿autoría diferida?" toda en ❌ ·
      0:40–2:20 los 4 tiempos EN VIVO: T2 con split-screen
      cadena/máquina + timer de proving; T3 alteración rechazada;
      **T4 clímax: dos ventanas FISCAL ✅ / EMPLEADOR ❌** ·
      2:20–2:45 ingeniería (compile verde, address en explorer, tests) ·
      2:45–3:00 cierre: "el buzón es plomería; la autoría diferida es el
      producto".
- [ ] Grabar contra la demo **congelada** (sáb 10:30), nunca a las 12:30.
- [ ] README final: quitar checkboxes vacías y `deck/` fantasma; agregar
      screenshots + address del contrato + cómo correr todo.

---

## 5. Timeline (vie tarde → sáb 13:00 ART)

| Hora límite | Hito (verde = commiteado y pusheado) |
|---|---|
| **vie 15:30** | §1 completo: topic, Node 22, deps + lockfile, scripts arreglados, `.env.example`, tDUST pedido. §3 congelado (este doc). |
| **vie 17:00** | **Bloque A entregado: `compact compile` verde en el repo** (gate asegurado, decisión A confirmada). Arrancan B/C/D/E en paralelo. |
| **vie 21:00** | B: 4 tiempos E2E contra **undeployed/local**. D: suite de circuitos verde. |
| **vie 24:00** | **Deploy a Preview + `deployment.json` commiteado + E2E contra Preview.** Si falla acá, queda toda la mañana para el plan B — por eso va hoy. |
| **sáb 09:00** | UI integrada a `app/` real. `npm run simulate` verde contra Preview. |
| **sáb 10:30** | **Feature freeze.** Se graba el video sobre este estado. Deck cerrado. |
| **sáb 12:00** | Video subido, README final, tag de release. 1 h de buffer. |
| **sáb 13:00** | Submit. **Ninguna operación contra Preview después de sáb 11:00.** |

**Prioridad si hay que sacrificar:** compile gate > E2E CLI contra Preview >
video/deck > UI pulida > tests exhaustivos.

---

## 6. Integración y plan B

**Orden de integración:** A→B (contrato real reemplaza mock) → B+D (simulate
contra red) → B+C (UI contra app real). Smoke test tras cada paso = el script
E2E de los 4 tiempos.

**Plan B si Preview falla** (RPC caído, faucet seco, tx que no confirma):
la demo cae a local/undeployed (node `ws://localhost:9944` + indexer `:8088`,
ya documentados en AGENTS.md) y el video se graba con lo que esté verde.
Tener proofs pre-generadas + video pre-grabado como fallback de la demo en
vivo; mostrar al menos UNA generación de prueba en vivo con timer si tarda
< 30 s.
