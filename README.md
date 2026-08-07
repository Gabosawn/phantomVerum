# Testigo — PhantomTrace

> **Denuncias de corrupción con anonimato reversible.** El denunciante prueba
> que es de adentro sin revelar quién es, la evidencia queda sellada — y, a
> diferencia de todos los sistemas existentes, puede probar su autoría después:
> solo él, solo ante la autoridad que elija, solo cuando le convenga.

Construido sobre [Midnight](https://midnight.network) (Compact + ZK).

---

## Cómo funciona (los 4 tiempos)

1. **La organización se registra** — publica el ancla de sus credenciales en
   el ledger y emite credenciales a empleados (mock, off-chain).
2. **Un empleado denuncia** — la app verifica su credencial *en privado* y
   publica solo `denunciaId = H(evidencia ‖ secret)` y un nullifier anti-spam.
   La organización ve que *hay* una denuncia; no puede saber de quién.
3. **La evidencia es inalterable** — el hash quedó sellado on-chain. Cualquier
   alteración no matchea.
4. **Meses después, revela su autoría** — `revelarAutoria` prueba que conoce el
   preimagen del hash, ligado a la clave de *ese* fiscal (designated verifier).
   Interceptada por cualquier otro, la prueba no sirve.

Detalle completo: [`docs/00-idea.md`](docs/00-idea.md) y
[`docs/01-arquitectura.md`](docs/01-arquitectura.md).

## Quick start

```bash
npm install                        # instala todas las workspaces
npm run compile                    # compila contratos Compact
npm test                           # corre la suite de tests
npm run simulate                   # simulación E2E de los 4 tiempos
npm run dev --workspace=ui         # levanta el frontend en :3000
```

Scripts CLI (workspace `app`):

```bash
npm run registrar-org --workspace=app      # registrar organización
npm run denunciar --workspace=app          # denuncia sellada + nullifier
npm run revelar-autoria --workspace=app    # prueba de autoría al fiscal
npm run verificar-autoria --workspace=app  # verificación off-chain (✅/❌)
```

## Estructura del repo

```
phantomtrace/
├── contracts/               # @phantomtrace/contracts — circuitos Compact
│   ├── src/                 #   testigo.compact (los 3 circuitos)
│   └── output/              #   artefactos del compilador (generado)
├── app/                     # @phantomtrace/app — wiring TypeScript
│   └── src/
│       ├── witnesses/       #   witness providers de los 3 circuitos
│       ├── scripts/         #   CLI: registrar-org, denunciar, revelar, verificar
│       └── config/          #   red Preview, proof server, indexer
├── ui/                      # @phantomtrace/ui — React + Vite
│   └── src/
│       ├── views/           #   Organizacion / Denunciante / Fiscal
│       ├── components/      #   componentes reutilizables
│       ├── hooks/           #   wallet, contrato
│       └── lib/             #   helpers y constantes
├── tests/                   # @phantomtrace/tests — Vitest + simulación E2E
│   └── src/
│       ├── circuits/        #   tests por circuito
│       └── simulation/      #   simulación E2E de los 4 tiempos
├── deck/                    # material de presentación
└── docs/                    # idea, arquitectura, entorno
```

### Las 3 vistas de la UI

| Vista | Qué hace |
|---|---|
| **Organización** | Registrar org (ancla) + emitir credencial (mock) + panel del ledger: hay N denuncias, ninguna atribuible |
| **Denunciante** | Cargar evidencia (se hashea local — dicho en pantalla), elegir org/período, denunciar, exportar llave de autoría |
| **Fiscal** | Cargar denunciaId + clave + material entregado → verificar contra el ledger → ✅ / ❌ |

Reglas de UI: legible y proyectable (fuente grande, alto contraste). La vista
denunciante dice explícitamente qué NO sale de la máquina.

## Tests

> Everything under `tests/` is written in English. Contract-facing identifiers
> (circuit names, ledger fields, witnesses, `assert` messages, domain tags) stay
> in Spanish because they must match the compiled `.compact` byte for byte.

```bash
npm test           # 22 cases across the three circuits + the hardening suite
npm run simulate   # the four acts end to end, printing the ledger at each step
```

```
 testigo · backends: model — contract backend OFF (no contracts/output/contract/index.cjs)

 ✓ src/circuits/registrar-organizacion.test.ts (3 tests) 6ms
 ✓ src/circuits/hardening.test.ts            (8 tests) 58ms
 ✓ src/circuits/denunciar.test.ts            (6 tests) 113ms
 ✓ src/circuits/revelar-autoria.test.ts      (5 tests) 79ms

 Test Files  4 passed (4)
      Tests  22 passed (22)
   Duration  598ms
```

### What is covered

| Circuit | Cases |
|---|---|
| `registrarOrganizacion` | registers ok · re-registration fails and cannot overwrite the anchor · two orgs stay independent |
| `denunciar` | happy path (and nothing identifying reaches the ledger) · invalid credential fails · second report in the same period fails · a different period passes with unlinkable nullifiers · two orgs do not interfere · two employees of one org do not interfere |
| `revelarAutoria` | real author passes · foreign secret fails · nonexistent report fails · same author + different prosecutor ⇒ different hash · double reveal to the same prosecutor fails |
| hardening (§2.2, §2.6) | identical resubmission fails (idempotency guard) · exact replay fails · nullifier/autoria cross-collision impossible · same-arity domains separated · each hash bound to its own tag · frozen golden vectors · period reaches the nullifier digest |

### Two backends, one suite

The suite runs through a seam (`tests/src/harness/types.ts`) with two interchangeable
backends. Tests never import a backend — they `describe.each` over whatever is available.

| Backend | What it is | Available |
|---|---|---|
| `model` | The spec (§3–§4) implemented in TypeScript, over compact-runtime's **real** `persistentHash` and **real** `StateBoundedMerkleTree` — so digests and Merkle roots are byte-identical to the circuit's, not simulated | always |
| `contract` | The compiled `.compact` driven through `@midnight-ntwrk/compact-runtime`'s local simulator — no network, no proof server | once `contracts/output/` exists |

With both present, every case runs twice and **any divergence between them is a real bug in
one of the two**. The model is written from the spec, deliberately not from the contract, which
is what gives the comparison its value.

What the `model` backend does *not* do is run the constraints inside a ZK circuit: it checks
credential membership with `findPathForLeaf` rather than `checkRoot(merkleTreePathRoot(path))`.
Same bytes, same outcome — but only the `contract` backend proves the `.compact` enforces it.

### The suite has teeth

Green tests against a hand-written model prove nothing on their own, so the suite was
mutation-tested: 13 deliberate defects injected one at a time into the model and the hash
construction (dropped idempotency guards, dropped membership check, dropped author check,
swapped domain tags, swapped hash operands, `periodo` dropped from the nullifier).

The first pass killed 12 of 13. The survivor was a nullifier reusing `testigo:denuncia:v1` —
the domain-separation test had been comparing a `Vector<3>` digest against a `Vector<4>` one,
so the arity difference masked the tag collision. Two tests were added (tag binding + golden
vectors) and all 13 mutants now fail the suite.

## Plan de desarrollo — 4 bloques independientes

> **Versión completa y actualizada:** [`docs/03-plan-ejecucion.md`](docs/03-plan-ejecucion.md) —
> rubric oficial del evento, decisiones técnicas validadas contra el compilador
> (Opción A Merkle ya compila), contratos de datos entre bloques (API de `app/`,
> formatos), **Bloque E — Entrega** (deck/video/demo) y timeline horario.

Los bloques **no se bloquean entre sí**: cada uno trabaja contra el spec de
[`docs/01-arquitectura.md`](docs/01-arquitectura.md) (que define nombres de
circuitos, estado del ledger y tipos) y contra mocks de las capas vecinas.
La integración se hace al final de cada bloque.

### Bloque A — Contratos Compact (`contracts/`)

- [ ] Template oficial compilando sin tocarlo (validar toolchain y sintaxis vigente)
- [ ] `registrarOrganizacion` — insertar org, fallar si ya existe
- [ ] `denunciar` — verificación de credencial (Opción A Merkle, fallback B), `denunciaId` + nullifier
- [ ] `revelarAutoria` — preimagen + designated verifier (`fiscalPk`)

**Entregable:** `compact compile` verde. Los valores derivados y el ledger
coinciden *exactamente* con el spec (§3–§4).

### Bloque B — Wiring TypeScript (`app/`)

- [ ] Config de red (Preview), proof server local, indexer
- [ ] Witness providers de los 3 circuitos + persistencia local de secrets/credenciales (archivo)
- [ ] Hash local de evidencia (el archivo nunca sale de la máquina)
- [ ] Scripts CLI: `registrar-org`, `denunciar`, `revelar-autoria`, `verificar-autoria`
- [ ] Deploy del contrato

**Se puede arrancar sin el Bloque A** mockeando el módulo del contrato
compilado con las firmas del spec. **Entregable:** un comando corre los 4
tiempos E2E; el caso "secret ajeno" falla en proof time sin emitir tx.

### Bloque C — UI (`ui/`)

- [ ] Vista Organización: registro + emisión mock de credenciales + panel del ledger
- [ ] Vista Denunciante: carga de evidencia (hash local), denuncia, exportar llave
- [ ] Vista Fiscal: verificación ✅/❌ contra el ledger

**Se puede arrancar sin los Bloques A y B** detrás de una capa de servicio
mock con la API de los scripts CLI. **Entregable:** las 3 vistas conectadas a
la capa real de `app/`.

### Bloque D — Tests (`tests/`) ✅

- [x] Suite por circuito — 22 casos (ver [Tests](#tests))
- [x] Simulación E2E de los 4 tiempos que imprime el estado del ledger en cada paso
- [x] Seam de dos backends: modelo del spec (siempre) + contrato compilado (cuando exista)
- [x] Mutation testing: 13 mutantes inyectados, 13 muertos
- [ ] Correr la suite contra el contrato real — pendiente del Bloque A

**Entregable:** `npm test` verde + `npm run simulate` con un comando. El seam
(`tests/src/harness/`) hace que enchufar el contrato compilado sea un `npm run compile`,
sin tocar una sola aserción.

### Contratos entre bloques (lo único congelado upfront)

1. **Circuitos y ledger** — tal cual `docs/01-arquitectura.md` §3–§4. Si la
   sintaxis instalada obliga a desviar, se adapta la sintaxis, nunca la
   semántica.
2. **API de `app/`** — las 4 funciones de los scripts CLI, con firmas TS
   acordadas antes de empezar C.
3. **Credencial** — se intenta Opción A (Merkle); si no sale, fallback a
   Opción B. La decisión no bloquea a B/C/D: la interfaz del circuito
   `denunciar` es la misma en ambas.

## Documentación

| Doc | Para qué |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Toolchain, servicios y convenciones — contexto para agentes de IA |
| [`docs/00-idea.md`](docs/00-idea.md) | La idea, el problema y el diferencial |
| [`docs/01-arquitectura.md`](docs/01-arquitectura.md) | Actores, flujo, spec de los 3 circuitos, estado del ledger |
| [`docs/02-entorno.md`](docs/02-entorno.md) | Setup del entorno: toolchain, servicios, checklist |
| [`docs/03-plan-ejecucion.md`](docs/03-plan-ejecucion.md) | Plan de ejecución mejorado: rubric oficial, decisiones validadas contra el compilador, contratos de datos entre bloques, bloque de entrega y timeline horario |
