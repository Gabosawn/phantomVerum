# germantu — punch-list ejecutable (post-auditoría e2e + artifact)

Consolidado de: (1) reporte de verificación e2e, (2) artifact de resumen
(`d0688a2e…`, que agrega 2 bugs de red más), (3) verificación directa contra el código
de `dev` @ `9e4e36a` hecha el 8/8.

Decisiones tomadas: alcance de contrato = **arreglar todo** (1.2 + 1.3 + 1.4).
verify.ts (1.1) = **fail-closed honesto v2** (mantener v2 sin secreto, veredicto de 3
estados; NO revertir a `db5c7e9`, que reintroduce el secreto en el paquete).

**Estado del merge (importante):** `worktree-e2e-fix-querycontractstate` YA está mergeado
en `dev` y pusheado (`9e4e36a`). Ese merge trajo los fixes de red **pero también
reintrodujo el `verify.ts` vulnerable** (commit `bebf8e0 "IMPROVEMENT applied"`). O sea:
lo que hay hoy en `origin/dev` tiene el camino on-chain funcionando y, a la vez, el
hallazgo crítico #1 vivo. `dev` local está sincronizado con `origin/dev`.

## 0. Gates de descalificación

- [ ] **Topic `midnightntwrk`** — ausente (`repositoryTopics: null`). Settings → Topics →
  agregar `midnightntwrk` (y opcional `compact`). **ACCIÓN TUYA** (la `gh` de la máquina
  es read-only). Verificar: `gh repo view Gabosawn/phantomVerum --json repositoryTopics`.
- [ ] **`main` 28 commits atrás** de `dev` (rama default → un jurado que clona ve un repo
  viejo). Mergear **AL FINAL**, recién cuando `dev` esté sano (si no, subís el verify.ts
  vulnerable a la rama default): `git checkout main && git pull && git merge dev && git push origin main`.

## 1. Seguridad

### 1.1 CRÍTICO — el veredicto de autoría se forja con datos públicos
`app/src/api/verify.ts` (`verifyAuthorship`, líneas ~167-223), `app/src/api/types.ts`
(`VerificationResult`, ~117-130).

Estado real: la versión v2 actual NO lleva el `reportSecret` en el paquete (mejora de
privacidad, arregla el viejo H-3). Como consecuencia, la verificación ya no recomputa
desde el secreto: compara campos declarados (`proof === authorshipHash`, ambos del mismo
archivo) contra la clave de quien pregunta, y lee membership del ledger con los valores
DECLARADOS. El `evidenceHash` no se chequea contra nada. Ataque reproducido: el empleador
scrapea `reportId` y `authorshipHash` del ledger público, pone su propia clave como
`prosecutorPk`/`verifierPk`, y el veredicto sale ✅.

**Decisión: fail-closed honesto, manteniendo v2 (NO revertir a `db5c7e9` — reintroduce el
secreto en el paquete).**

- [ ] Cambiar el veredicto booleano por **3 estados**: `verificado` / `refutado` /
  `no-verificable-en-este-build`. En el build demo, `proof` es literalmente el hash (no
  hay ZK real), así que la app NO puede afirmar autoría de forma sólida: el máximo honesto
  es "el `authorshipHash` está publicado on-chain y el paquete está dirigido a tu clave;
  la prueba criptográfica de autoría es roadmap".
- [ ] Que la UI/CLI dejen de mostrar un ✅ que implica solidez. Consumidores del shape a
  ajustar: `app/src/scripts/verify-authorship.ts:41,45,46`,
  `app/src/api/selftest-simulator.ts:350,372`, `ui/explorer/src/estado.tsx:231`
  (`r.ok && r.enLedger`), `ui/explorer/src/vistas/Autoria.tsx` (copy del veredicto).
- [ ] Reframe de la demo: mostrar que el paquete es consistente y está on-ledger, pero
  etiquetado "no verificado criptográficamente (build demo)". El contraste
  fiscal ✅ / empleador ❌ **no es robusto en v2** — no venderlo como criptográfico.

### 1.2 ALTO — el nullifier se evade por el orgId
`contracts/src/testigo.compact:138-142` (`nullifierOf`), `:202` (call site).

`nullifierOf(sec, orgId, period)` mezcla `orgId`, parámetro público elegido por el
llamador. Como `registerOrganization`/`issueCredential` no tienen control de acceso
(limitación declarada del MVP), fabricar orgs fantasma es gratis y multiplica los reportes
por época.

- [ ] `nullifierOf(sec, period)` — sacar `orgId` del hash (`Vector<4>` → `Vector<3>`),
  mantener `domNullifier()`. Actualizar comentario ~53.
- [ ] Call site `:202`: `nullifierOf(cred, orgId, period)` → `nullifierOf(cred, period)`.
- [ ] `contracts/test/sec-audit.mjs` bloque `[HIGH-1]` (~44-53): hoy solo varía `period`.
  Agregar el eje que falta: **variar `orgId` con `period` y credencial fijos, y confirmar
  que el 2º reporte es rechazado** ("already reported this period"). El test actual da
  verde tildando una propiedad que no se cumplía.

### 1.3 CRÍTICO — 256 emisiones dejan el contrato inservible para siempre
`contracts/src/testigo.compact:49` (`credentials: HistoricMerkleTree<8, Bytes<32>>`),
`:194` (`MerkleTreePath<8>` + `merkleTreePathRoot<8>` en `report`).

Árbol de 256 hojas global, `issueCredential` sin cuota, contrato inmutable → a las 256
inserciones toda emisión legítima queda bloqueada para siempre.

- [ ] Subir profundidad a 16 en las 3 posiciones (`<8>` → `<16>`): decl del ledger +
  `MerkleTreePath<16>` + `merkleTreePathRoot<16>`.
- [ ] Regenera keys sí o sí (recompile completo).
- [ ] `credentialPath` (`app/src/witnesses/index.ts`) usa `findPathForLeaf`, que devuelve
  el largo correcto según la profundidad → sin cambio manual. Grep de sanidad: `256`,
  `MerkleTreePath<8`, `HistoricMerkleTree<8` en `contracts/ app/ tests/`.

### 1.4 MEDIO — mismo reportId/nullifier en despliegues distintos
`contracts/src/testigo.compact:119-147` (derivaciones), `app/src/witnesses/index.ts`.

Las derivaciones usan tags fijos (`phantomtrace:*`), nunca la dirección del contrato →
el mismo autor+evidencia produce los mismos hashes en dos despliegues (correlacionable), y
una prueba armada contra un devnet descartable verifica contra la key de producción.

- [ ] **De-riskear primero:** un `export pure circuit` NO tiene `kernel.self()`. Escribir
  un smoke mínimo y `compact compile` para confirmar la API antes de refactorizar (usar la
  skill `compact` / `midnight-verify:verify-compact`).
- [ ] Pasar la dirección como **argumento explícito** a `reportIdOf`/`nullifierOf`/
  `authorshipOf`/`leafOf` (sube la aridad del `Vector`); `report`/`revealAuthorship`
  obtienen `kernel.self().bytes` y la pasan.
- [ ] Off-chain: las 4 witness functions leen `contractAddress` de `WitnessContext`;
  `verify.ts` recomputa con la dirección del `deployment.json`.
- [ ] Actualizar fórmulas de hash en `docs/01-arquitectura.md` §3-§4.
- [ ] **Fallback:** es el de menor severidad. Si el smoke de `kernel.self()` no cierra
  rápido, declararlo como limitación en el README y no bloquear el resto. 1.2 y 1.3 sí o sí.

### 1.5 ALTO — no es designated-verifier: la prueba es transferible
`contracts/src/testigo.compact:230-231`, `ui/shared/guia.ts:88`,
`ui/cliente/src/vistas/Revelar.tsx:33`, `app/src/api/types.ts` (doc `AuthorshipKeyExport`).

El ZKIR lo confirma (`proveAuthorship.zkir` sin opcode `member`). Barato, sin recompile.

- [ ] Reemplazar "no le prueba nada / no le sirve para nada" por el texto honesto ya usado
  en docs/README: "el binding es uno por fiscal; la prueba es públicamente verificable y
  por lo tanto transferible una vez entregada. La no-transferibilidad criptográfica
  (designated-verifier real) es roadmap."

### Recompile + re-test del contrato (después de 1.2/1.3/1.4)
```bash
npm run compile --workspace=contracts   # regenera 5 prover+verifier keys
npm test                                 # 48 casos, ambos backends
npm run simulate                         # 4 actos
```
- [ ] A/B/C cambian los digests públicos → recalcular los golden vectors de
  `contract-agreement.test.ts` / `hardening.test.ts` desde el contrato recompilado (no a
  mano).

## 2. UI — el cable no está enchufado
`ui/cliente/src/estado.tsx:169` (descarta `cp`), `:190` (`new ClienteMock` incondicional).
El Explorer ya lo hace bien: `ui/explorer/src/estado.tsx:123-163`.

- [ ] Guardar el cliente resuelto: `const [previewCliente, setPreviewCliente] = useState<ClientePreview | null>(null)`.
- [ ] En el `useEffect` (~169): `setPreviewCliente(cp); setModo("preview")` en vez de descartar `cp`.
- [ ] Reemplazar el `useMemo` incondicional (~190) por:
  `const cliente = modo === "preview" && previewCliente ? previewCliente : clienteMock`.
- [ ] Ambos implementan `TestigoClient` (`ui/shared/tipos.ts:171-202`) → los call sites no
  cambian. Nota: los métodos de circuito de `ClientePreview` hoy hacen `throw` remitiendo a
  la CLI (`ClientePreview.ts:154-215`); solo `verificarAutoria`/`leerEstadoLedger` hacen
  trabajo real → documentar o completar según el alcance de la demo.

## 3. Bugs de red — 5 (el artifact agrega 2 a los 3 del reporte)

Los 3 primeros ya vinieron con el merge (`e8914e1`). Los 2 últimos los reporta el artifact
como "fixed" pero **hay que verificarlos al deployar** (no confirmados en el árbol actual):

- [x] Deserialización del state del indexer (`providers.ts` — hex crudo → `ContractState.deserialize`).
- [x] `connect()` sin `initialPrivateState` (`executor-network.ts` → `emptyPrivateState()`).
- [x] WASM `onchain-runtime-v3` duplicado (`package.json` override a `3.0.0`).
- [ ] **Fees en cero → `DustActions` vacío → "1010: Invalid Transaction…NotNormalized".**
  Verificar el manejo de fee/balance en el deploy (reportado fixed en la rama mergeada).
- [ ] **Sync de DUST salteado en el init del wallet → "InsufficientFunds" con saldo.**
  Verificar al fondear/deployar (reportado fixed).

## 4. Deploy a Preview + `deployment.json`
`app/src/config/deployment.json` sigue con los 5 campos en `null`.

- [ ] **ACCIÓN TUYA:** fondear la wallet de `DEPLOY_SEED` (hoy `cap: 0` DUST, 0 NIGHT).
  Faucet web (el automático pide captcha, `Missing X-Captcha-Token`) o transferir tNIGHT a
  `mn_addr_preview13w6m2fcwzv0vuw7tm7th8mphxjhayryzfvkk38h4dkzl2t5nlwjq6jyzea`.
- [ ] Deployar **DESPUÉS** de los fixes de contrato (A/B/C cambian bytecode y keys):
  `NETWORK=preview npm run deploy --workspace=app`.
- [ ] Persistir los 5 campos en `deployment.json` (el deploy local de hoy corrió pero no
  quedó grabado).

## 5. Entorno / MCP (menor)
- [ ] **ACCIÓN TUYA:** autorizar el MCP `midnight` (docs Kapa) con `/mcp` en sesión
  interactiva (requiere tu login).
- Los MCP `midnight-devnet` y plugin `devs` **no existen** — referencias rotas del propio
  ecosistema de plugins, no son pendientes accionables.

## Orden de ejecución
1. 1.1 fail-closed honesto en `verify.ts` (la vuln está viva en dev).
2. 1.5 wording designated-verifier (barato, sin recompile).
3. 1.2 + 1.4 + 1.3 migración de contrato en un pase → recompile → re-test → golden vectors.
4. §2 UI cliente conectada.
5. §4 fondear (vos) + deploy Preview + `deployment.json` (verificar bugs 4 y 5 de §3 acá).
6. §0 topic (vos, independiente).
7. §0 mergear `dev` sano → `main` (al final).
8. §5 MCP (vos, opcional).

## Quién hace qué
- **Código + git:** 1.1, 1.2, 1.3, 1.4, 1.5, §2, parte de código de §4 (deploy + escribir
  `deployment.json`), §0 merge a `main`.
- **Vos (login/permisos):** topic GitHub (§0), fondear wallet (§4), autorizar MCP (§5).

## Verificación end-to-end (al terminar)
```bash
grep -n "no-verificable\|noVerificable\|not cryptographically" app/src/api/verify.ts  # 1.1
grep -rn "no le prueba nada" ui/ contracts/                       # 1.5: vacío
grep -n "nullifierOf(sec, period)" contracts/src/testigo.compact  # 1.2
grep -n "HistoricMerkleTree<16" contracts/src/testigo.compact     # 1.3
npm run compile --workspace=contracts && npm test && npm run simulate
cat app/src/config/deployment.json                                # §4: poblado
gh repo view Gabosawn/phantomVerum --json repositoryTopics        # §0: midnightntwrk
git rev-list --count origin/main..origin/dev                      # §0: 0
```
