# 04 — Bloque B: wiring TypeScript, paso a paso

> Plan de ejecución micro-granular del Bloque B (`app/`) sobre la rama
> `feat/bloque-b-wiring`. Cada paso tiene criterio de aceptación (✓) — un paso
> no está hecho hasta que su ✓ se verificó corriendo el comando. Convención:
> commits chicos con Conventional Commits (`feat(b3.2): ...`).
>
> **Regla de oro (de `01-arquitectura.md` §8):** no inventar API. Todo import,
> firma o tipo de `@midnight-ntwrk/*` se verifica contra los tipos instalados
> (`tsc --noEmit`) o contra los ejemplos oficiales — nunca de memoria.
> Interfaces con otros bloques: congeladas en `03-plan-ejecucion.md` §3.

Dependencias entre fases:

```
F0 (toolchain/scaffolding) ──┐
                             ├──> B1 (config+providers) ──> B3 (API) ──> B4 (CLI) ──> B5 (deploy Preview)
FA (contrato portado) ───────┘         B2 (witnesses) ──────┘
F5.0 (seed+faucet) — arranca apenas termina F0, corre en paralelo a todo
```

---

## Estado — actualizado vie 7/8 ~14:15

| Fase | Estado |
|---|---|
| **A' — contrato** | ✅ A.1–A.5 verificados · ⚠️ **A.6 NO está hecho** (ver abajo) |
| **F0 — toolchain** | 🟡 en curso (0.1–0.2 listos, agente retomó desde 0.3) |
| **B1–B5** | ⬜ sin arrancar (`app/src/` solo tiene `.gitkeep`) |

> ⚠️ **Corrección (verificada 14:20):** una versión previa de este bloque decía
> "A' cerrada completa, incluido el smoke del TS generado y round-trip de los 4
> tiempos en simulador". **Eso no es así.** `git ls-files '*.ts' '*.js'` devuelve
> exactamente 2 archivos en todo el repo — `tests/vitest.config.ts` y
> `ui/vite.config.ts`, los dos de configuración. No hay script de smoke, no hay
> código que llame a los pure circuits, y `app/src/` sigue con solo `.gitkeep`.
>
> Importa porque **A.6 es justo el paso que prueba que el TS generado funciona
> antes de que B2/B3 dependan de él**. Si se lo da por hecho, B1–B3 se
> construyen sobre una suposición sin verificar. Si el smoke se corrió a mano,
> no quedó commiteado: no es reproducible ni mostrable a un juez.

**El gate anti-DQ está pasado desde clone limpio:** `compact compile` sin
`output/` previo, ~30 s, 8 claves (4 circuitos × 2). Verificado corriendo el
comando, no asumido.

> ✅ **Resuelto:** la rama `feat/bloque-b-wiring` está pusheada a `origin` —
> el contrato ya vive en el remoto (`2e6fbf7`+). `origin/main` tiene los docs
> del plan (`4a3673d`). Cuando F0 cierre y el E2E local pase, se mergea la
> rama a `main` para que el clone de los jueces compile siempre.
>
> ⚠️ Pendiente que solo puede hacer Gabriel (requiere admin): el topic del
> repo — `gh repo edit Gabosawn/phantomVerum --add-topic midnightntwrk`
> (el intento con permisos de colaborador dio 404).

---

## Fase 0 — Toolchain y scaffolding (owner: agente W-scaffold)

Toca: `package.json` raíz, `app/package.json`, `tests/package.json`,
`app/tsconfig.json`, `tests/tsconfig.json`, `.env.example`, docker.
**No toca `contracts/`.**

- [x] **0.1** Rama `feat/bloque-b-wiring` creada. ✓ `git branch --show-current`
- [x] **0.2** Node ≥ 22 disponible. Preferencia: `nvm install 22`; si no hay
      nvm, binario oficial a `~/.local/node-v22` + PATH documentado en
      `docs/02-entorno.md`. ✓ **v22.23.2** verificado.
- [ ] **0.3** Verificar versiones publicadas HOY con `npm view <pkg> version`
      para cada paquete (no confiar en la lista de memoria):
      `@midnight-ntwrk/midnight-js-contracts`, `-network-id`,
      `-indexer-public-data-provider`, `-http-client-proof-provider`,
      `-node-zk-config-provider`, `-types`, `@midnight-ntwrk/compact-runtime`,
      `@midnight-ntwrk/wallet`, `@midnight-ntwrk/wallet-api`,
      `@midnight-ntwrk/zswap`, `@midnight-ntwrk/ledger`.
      Contrastar con la compatibility matrix de Preview
      (docs.midnight.network/relnotes/support-matrix). Esperado: midnight-js
      4.1.1 / compact-runtime 0.16.0 — si difiere, manda la matrix.
      ✓ tabla pegada en el commit message.
- [ ] **0.4** `app/package.json`: deps pinneadas EXACTAS (sin `^`),
      `"type": "module"`, scripts `build` (`tsc -p .`), y los 5 scripts CLI
      (`registrar-org`, `emitir-credencial`, `denunciar`, `revelar-autoria`,
      `verificar-autoria`) + `e2e` apuntando a `dist/scripts/*.js`.
      ✓ `npm pkg get type dependencies` muestra lo esperado.
- [ ] **0.5** `app/tsconfig.json` y `tests/tsconfig.json`:
      `module: NodeNext`, `moduleResolution: NodeNext`, `outDir: dist`,
      `rootDir: src`. `tests/package.json`: `"type": "module"` + script
      `build`. ✓ `npx tsc -p app --noEmit` pasa (con src vacío es trivial).
- [ ] **0.6** `package.json` raíz: `build`/`test`/`compile` con
      `--workspaces --if-present`; borrar script `lint`.
      ✓ `npm run build` no aborta.
- [ ] **0.7** `.env.example` en raíz: `DEPLOY_SEED=` (vacío, con comentario de
      cómo generarla), `NETWORK=preview`, `PROOF_SERVER=http://localhost:6300`.
      ✓ el archivo existe y `.env` sigue en `.gitignore`.
- [ ] **0.8** Proof server pinneado: bajar `midnightntwrk/proof-server:8.1.0`,
      recrear el container con ese tag (mismo puerto 6300).
      ✓ `curl -s localhost:6300/health` → `ok` y `docker ps` muestra `:8.1.0`.
      **Estado:** corriendo pero en `:latest` — falta el pin.
- [ ] **0.9** `npm install` en raíz (con Node 22 activo) y commitear
      `package-lock.json`. ✓ `npm ls --depth=0 --workspace=app` sin errores.

## Fase A' — Contrato portado (owner: agente W-contract)

Toca: solo `contracts/`. Prerequisito de B2/B3 (los tipos TS generados salen
de acá).

- [x] **A.1** Portar el contrato Opción A validado (scratchpad
      `spec-validation/src/testigo_a2.compact`) a
      `contracts/src/testigo.compact`. Revisar contra el spec §3–§4:
      mismos nombres de circuitos y ledger, domain separation, guards.
      ✓ commit `7c51fb0`, 188 líneas.
- [x] **A.2** Portar la Opción B a `contracts/src/fallback/testigo-b.compact`
      (congelada, no se compila por default). ✓ commit `91e10aa`, 138 líneas.
- [x] **A.3** `contracts/package.json`: script
      `compile` = `compact compile src/testigo.compact output/` (CON claves —
      el deploy real las necesita) y `compile:fast` = con `--skip-zk` para
      iteración. ✓ commit `4f4d99e`; además `check:fallback`, `format`, `clean`.
- [x] **A.4** Compilar y verificar artefactos: `output/contract/index.cjs` +
      tipos, `output/keys/*.prover|.verifier`, `output/zkir/`.
      ✓ **8/8 claves** (`registrarOrganizacion`, `emitirCredencial`,
      `denunciar`, `revelarAutoria` × prover/verifier) + `output/contract/index.d.ts`.
      Nota: `output/` está gitignoreado — solo se commitea el `.compact`.
- [x] **A.5** Gate anti-DQ: `contracts/` compila desde clone limpio.
      ✓ verificado en dir temporal **sin `output/` previo: 34 s, 8 claves**.
      ⚠️ Vale para la rama, que ya está en `origin/feat/bloque-b-wiring`.
      **`origin/main` (`4a3673d`) sigue SIN el contrato** — un juez que clone
      el repo hoy no tiene nada que compilar. El merge a `main` es lo que
      cierra el gate de verdad.
- [ ] **A.6** Smoke del TS generado: script mínimo que importa el módulo
      generado y llama los pure circuits (`denunciaIdDe`, `nullifierDe`,
      `autoriaDe`, `hojaDe`) con valores dummy. ✓ imprime 4 hashes de 32 bytes.
      **Único pendiente de A', y bloquea de hecho a B2/B3:** son los tipos y
      funciones que esas fases importan. Commitear el script (no correrlo a
      mano) — vale como evidencia de QA para el 15 % del rubric.

## Fase B1 — Config y providers (`app/src/config/`)

Empieza cuando F0 y A' están verdes. Owner: agente W-app (oleada 2).

- [ ] **B1.1** `config/networks.ts`: los dos entornos —
      `preview` (`wss://rpc.preview.midnight.network`,
      `https://indexer.preview.midnight.network/api/v4/graphql`, proof server
      `http://localhost:6300`) y `local` (`ws://localhost:9944`,
      `http://localhost:8088/api/v4/graphql`, `:6300`). Selección por
      `process.env.NETWORK` (default `preview`). ✓ unit trivial: imprime la
      config activa.
- [ ] **B1.2** `config/deployment.ts` + `config/deployment.json` (placeholder
      `{ "network": null, "contractAddress": null }`): tipo, lector y writer.
      Formato congelado en `03-plan-ejecucion.md` §3.2. ✓ `tsc --noEmit`.
- [ ] **B1.3** `config/providers.ts`: construir el objeto de providers de
      midnight-js — indexer public data provider, http-client proof provider,
      zk-config provider apuntando a `contracts/output/` (verificar cuál
      aplica en Node según los tipos instalados), private state provider,
      wallet/midnight provider desde `DEPLOY_SEED`. **Verificar cada import
      contra los paquetes instalados** — los nombres exactos salen de
      `node_modules/@midnight-ntwrk/*/dist/*.d.ts`, no de memoria.
      ✓ `tsc --noEmit` + un script que instancia providers contra Preview y
      hace un query trivial al indexer.
- [ ] **B1.4** `setNetworkId` según red activa, una sola vez, en un módulo
      `config/init.ts` importado por todos los scripts. ✓ incluido en B1.3.

## Fase B2 — Identidad, secrets y witnesses (`app/src/witnesses/`)

Puede arrancar en paralelo a B1 (solo depende de A').

- [ ] **B2.1** `witnesses/secrets.ts`: leer/escribir `secrets/denunciante.json`
      (formato §3.2: `{version, secretPersonal, credencialSecret, orgId,
      hojaIndex}`), creación con `crypto.randomBytes(32)` si no existe,
      permisos 0600. ✓ test manual: crea, relee, campos hex de 64 chars.
- [ ] **B2.2** `witnesses/evidencia.ts`: hash local del archivo de evidencia
      (`node:crypto` sha-256 → 32 bytes). El archivo NUNCA se sube a ningún
      lado — comentario explícito. ✓ hashea un archivo de prueba,
      determinístico.
- [ ] **B2.3** `witnesses/index.ts`: implementar el objeto witnesses que exige
      el tipo generado del contrato (los 4: `credencialSecret`,
      `secretPersonal`, `evidenciaHash`, `credencialPath`). El shape exacto
      (tuplas `[privateState, valor]`, `WitnessContext`) se saca de los tipos
      generados en `contracts/output/` — verificar con `tsc`, no asumir.
      `credencialPath` usa `findPathForLeaf` del ledger state (ver A.6/skill
      midnight-js); manejar `undefined` → error legible "credencial no
      emitida para esta org". ✓ `tsc --noEmit` contra los tipos generados.

## Fase B3 — API core (`app/src/api.ts` — las firmas de §3.1, congeladas)

Depende de B1 + B2.

- [ ] **B3.1** `api/contrato.ts`: `deployContrato()` y
      `conectarContrato(address)` con midnight-js contracts (deploy /
      findDeployedContract según API instalada). ✓ `tsc --noEmit`.
- [ ] **B3.2** `registrarOrganizacion({orgId, ancla})` → tx real.
      ✓ contra undeployed/local o Preview: tx confirma y
      `leerEstadoLedger()` la refleja.
- [ ] **B3.3** `emitirCredencial({orgId})`: genera `credencialSecret`, calcula
      `hojaDe(orgId, credSecret)` con el pure circuit, inserta la hoja
      (circuito `emitirCredencial`), guarda en secrets, devuelve `hojaIndex`.
      ✓ dos emisiones → dos hojas, paths recuperables.
- [ ] **B3.4** `denunciar({orgId, periodo, evidencia})`: valida credencial vía
      witnesses, computa localmente `denunciaId`/`nullifier` esperados (pure
      circuits) y los devuelve junto con la tx. Errores tipados:
      `CredencialInvalidaError`, `NullifierRepetidoError` — ambos deben
      dispararse EN PROOF TIME (sin tx emitida): capturar el fallo del proof
      server y mapearlo. ✓ caso feliz + los 2 negativos.
- [ ] **B3.5** `revelarAutoria({denunciaId, fiscalPk})` + error
      `NoSosElAutorError` (proof time). ✓ autor real pasa; secret ajeno falla
      sin tx.
- [ ] **B3.6** `verificarAutoria(ExportLlaveAutoria)`: 100 % off-chain —
      recomputa `denunciaIdDe`/`autoriaDe` con pure circuits y chequea
      `autoriaHash ∈ autorias` vía indexer. Sin proof server. ✓ los 4 casos de
      la tabla del README (autor real ✅, secret ajeno ❌, denuncia inexistente
      ❌, otro fiscal → hash distinto).
- [ ] **B3.7** `leerEstadoLedger()`: query GraphQL al indexer +
      deserialización con el módulo generado. Devuelve
      `{organizaciones, denuncias[], nullifiers, autorias[]}` (§3.1).
      ✓ refleja el estado tras cada tx de los pasos anteriores.
- [ ] **B3.8** Export de llave de autoría: `exportarLlave(denunciaId,
      fiscalPk)` → `ExportLlaveAutoria` JSON (§3.2). ✓ `verificarAutoria`
      sobre el export devuelve `{ok: true, enLedger: true}`.

## Fase B4 — Scripts CLI (`app/src/scripts/`)

Depende de B3. Cada script: argumentos posicionales simples, salida legible
(es material del video), exit code ≠ 0 en error.

- [ ] **B4.1** `registrar-org.ts` — `npm run registrar-org --workspace=app -- <orgId>`
      (genera ancla/árbol según Opción A). ✓ imprime orgId + tx.
- [ ] **B4.2** `emitir-credencial.ts` — emite para el denunciante local.
      ✓ imprime hojaIndex.
- [ ] **B4.3** `denunciar.ts` — `-- <orgId> <periodo> <archivo>`.
      ✓ imprime denunciaId + nullifier + tx; con credencial inválida sale ≠ 0
      SIN tx.
- [ ] **B4.4** `revelar-autoria.ts` — `-- <denunciaId> <fiscalPk>` + escribe el
      export de llave a `secrets/export-<denunciaId>.json`. ✓ imprime
      autoriaHash + path del export.
- [ ] **B4.5** `verificar-autoria.ts` — `-- <path-export>` → `✅ AUTORÍA
      VERIFICADA` / `❌ NO VERIFICA` (esto es lo que se proyecta en T4).
      ✓ los dos resultados según input.
- [ ] **B4.6** `e2e.ts` — los 4 tiempos corridos, imprimiendo el estado del
      ledger después de cada paso + el intento de alteración (T3) fallando +
      la verificación dual (fiscal ✅ / empleador ❌). ✓ `npm run e2e
      --workspace=app` verde de punta a punta.

## Fase B5 — Deploy a Preview (hito vie 24:00)

- [ ] **B5.0** *(arranca apenas F0.9 termina — HUMANO en el medio)*
      `scripts/generar-seed.ts`: genera seed, la escribe a `.env`, imprime la
      address. **→ Juan pide tDUST en el faucet de Preview con esa address**
      (suele tener captcha — no automatizable). ✓ balance > 0 vía indexer.
- [ ] **B5.1** Deploy real: `scripts/deploy.ts` → escribe
      `config/deployment.json` con address + txId + `compilerVersion`.
      ✓ address válida y el indexer de Preview devuelve el estado del
      contrato.
- [ ] **B5.2** Commitear `deployment.json`. ✓ `git show` lo incluye.
- [ ] **B5.3** E2E completo (`B4.6`) contra Preview con el contrato
      deployado. ✓ verde; los txId aparecen en el indexer.
- [ ] **B5.4** Smoke de re-conexión: borrar estado local (no secrets),
      `conectarContrato(address)` desde cero y `leerEstadoLedger()` refleja
      todo. ✓ es lo que usarán `ui/` y `tests/`.

---

## Asignación a agentes

| Oleada | Agente | Fases | Archivos que toca |
|---|---|---|---|
| 1 | **W-scaffold** | F0 completa | package.json (raíz/app/tests), tsconfigs, `.env.example`, docker |
| 1 | **W-contract** | A' completa | `contracts/` únicamente |
| 2 | **W-app** | B1 + B2 + B3 + B4 | `app/src/` únicamente |
| 2→ | **HUMANO (Juan)** | B5.0 faucet | — |
| 3 | **W-deploy** | B5.1–B5.4 | `app/src/scripts/deploy.ts`, `deployment.json` |

Reglas para todos los agentes: verificar API contra tipos instalados/ejemplos
oficiales (nunca memoria) · commits chicos por paso con el ID (`feat(b3.4):`)
· si un paso no cierra en 2× su estimación, parar y reportar el bloqueo en vez
de inventar · nada de tocar archivos fuera de la columna asignada.
