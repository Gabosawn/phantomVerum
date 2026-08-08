# germantu — todo lo que sigue roto (8/8, post-auditoría e2e + diagnóstico de tooling)

Esto junta dos corridas de hoy:

1. Diagnóstico de entorno/MCP (`midnight-expert:doctor` + `midnight-tooling:doctor`), con varios fixes ya aplicados en esta sesión.
2. Auditoría end-to-end + seguridad sobre la rama `worktree-e2e-fix-querycontractstate` (commit `e8914e1`), que deployó el contrato por primera vez.

**Importante: nada de la auditoría está en `dev` todavía.** Verifiqué que `origin/worktree-e2e-fix-querycontractstate` es `dev` + 2 commits (`bebf8e0`, `e8914e1`), fast-forward limpio, sin conflictos. El código vulnerable citado abajo (`app/src/api/verify.ts`) existe tal cual en esa rama — la versión en `dev` es distinta. Los 3 bugs "ya arreglados", el deploy real y las 5 vulnerabilidades encontradas viven solo ahí hasta que se mergee.

## 0. Antes que nada — merges pendientes

- [ ] Mergear `worktree-e2e-fix-querycontractstate` → `dev` (fast-forward, verificado sin conflictos). Sin esto lo demás no existe fuera de esa rama.
- [ ] `git pull` en `dev` — está 2 commits atrás de `origin/dev`.
- [ ] Mergear `dev` → `main` — `origin/main` está 26 commits atrás de `origin/dev`. Gate de descalificación: un jurado que clona `main` (rama default) ve un repo viejo.
- [ ] Poner el topic `midnightntwrk` en el repo (Settings → Topics). Gate de descalificación explícito en las reglas, lista vacía hoy. Requiere permisos de admin en GitHub — acción manual, 1 clic.

## 1. Seguridad — 5 hallazgos reproducidos, no teóricos

### 1.1 Crítico — el veredicto de autoría se falsifica con datos públicos
`app/src/api/verify.ts` (función con `proofConsistent` / `designatedToVerifier`)

`ok = proofConsistent && designatedToVerifier` se calcula ANTES de leer el ledger. `proofConsistent` es `pkg.proof === pkg.authorshipHash` (tautología, ambos campos los aporta quien trae el paquete). `designatedToVerifier` compara contra `pkg.prosecutorPk`, que también lo elige el atacante. Dos ataques verificados: deanonimización (el empleador scrapea ambos valores del ledger público y arma su propio veredicto ok) e incriminación (mezclar `reportId` de una denuncia con `authorshipHash` de otra también da `ok: true`).

- [ ] Fail-closed: si `proof === authorshipHash`, devolver "verificación no disponible en este build" en vez de `ok: true`. Veredicto de 3 estados (verificado / refutado / no disponible) en vez de un booleano.

> Nota: en `origin/dev` (commit `67c5e4f`, ya en el repo) se arregló un bug relacionado pero distinto — `PreviewExplorerReader.verificarAutoria` en el Explorer dropeaba el parámetro `verificadorPk` por completo, permitiendo auto-designación. Verifiqué el código: ese fix no toca `proofConsistent`/`designatedToVerifier` en `verify.ts`, que sigue exactamente igual. Este hallazgo (1.1) sigue abierto.

### 1.2 Alto — el nullifier se evade por el orgId
`contracts/src/testigo.compact:138-142, 175, 202-203`

`nullifierOf` mezcla `orgId`, que es un parámetro público elegido por el llamador (a diferencia de `period`, que el circuito fija al `blockTime`). Como `registerOrganization` e `issueCredential` no tienen control de acceso, fabricar orgs fantasma es gratis y multiplica los reportes permitidos por época sin límite.

Agravante de proceso: `contracts/test/sec-audit.mjs` sección `[HIGH-1]` (líneas 44-52, verificado) solo varía `period`, nunca `orgId` — el test da verde tildando una propiedad que no se cumple.

- [ ] Sacar `orgId` del nullifier (una denuncia por credencial por época, sin importar en cuántas orgs esté enrolada).
- [ ] Agregar el eje `orgId` al bloque `[HIGH-1]` de `sec-audit.mjs`.

### 1.3 Crítico — 256 llamadas sin autenticar dejan el contrato inservible para siempre
`contracts/src/testigo.compact:49, 167-170`

`credentials` es `HistoricMerkleTree<8>` = 256 hojas. `issueCredential` acepta cualquier `Bytes<32>` de cualquiera, sin cuota ni revocación. El contrato es inmutable: no hay recuperación. A las 256 emisiones, cualquier emisión legítima queda bloqueada para siempre (`exceeded structure bounds`).

- [ ] Subir la profundidad del árbol a 16 (65.536 hojas, también agranda el conjunto de anonimato).
- [ ] Atar la emisión al anchor de la org (`organizations`, hoy es estado muerto: se escribe y ningún circuito lo lee).

### 1.4 Medio — el mismo autor produce el mismo reportId en dos despliegues distintos
`contracts/src/testigo.compact:119-147`, `app/src/witnesses/index.ts`

Ni `reportIdOf` ni `nullifierOf` mezclan la dirección del contrato; las etiquetas de dominio son constantes (`phantomtrace:*`) para todo despliegue. El mismo autor con la misma evidencia, contra dos instancias desplegadas, produce `reportId` y nullifiers idénticos en ambos ledgers → correlacionables. Además, una prueba generada contra un devnet descartable (donde el atacante controla todo el estado) verifica igual contra la verifier key de producción.

- [ ] Mezclar `kernel.self().bytes` en la derivación de autoría (o pasarlo como argumento explícito para mantener el circuito `pure`).

### 1.5 Alto — no es designated-verifier: la prueba entregada es transferible
`contracts/src/testigo.compact:229-231`, `types.ts`, 2 vistas de la UI

El contrato afirma que el registro, mostrado a otro fiscal o al empleador, "no prueba nada". Un esquema designated-verifier real exige que el destinatario pueda simular una prueba indistinguible con su propia clave — eso no existe acá: `prosecutorPk` es un input público más, la prueba se verifica contra la verifier key pública. El ZKIR lo confirma: `proveAuthorship.zkir` no contiene ningún opcode `member`.

- [ ] Corregir la afirmación en los 4 lugares donde aparece (contrato + `types.ts` + 2 vistas de UI): "el binding es uno por fiscal; la prueba es públicamente verificable y por lo tanto transferible una vez entregada" — no prometer una propiedad que no se tiene.

## 2. UI — el cable no está enchufado

`ui/cliente/src/estado.tsx:169,188` (verificado en código)

`conectarClientePreview()` se llama en el `useEffect` de montaje, pero el resultado se descarta (`.then((cp) => { if (cancelado || !cp) return; setModo("preview"); })` — nunca usa `cp`). El cliente activo (línea 188) es incondicionalmente `new ClienteMock(...)`. El badge del header diría "preview" mientras cada operación sigue corriendo contra el mock.

- [ ] Usar el cliente que devuelve `conectarClientePreview()` en vez de descartarlo cuando `modo === "preview"`.

## 3. Deploy a Preview — un paso de distancia

- [ ] Fondear la wallet de `DEPLOY_SEED` (hoy `cap: 0` DUST, `NIGHT` = 0). Vía faucet web (el automático pide captcha, `Missing X-Captcha-Token`) o transferencia manual de tNIGHT a `mn_addr_preview13w6m2fcwzv0vuw7tm7th8mphxjhayryzfvkk38h4dkzl2t5nlwjq6jyzea`.
- [ ] Correr `NETWORK=preview npm run deploy --workspace=app`.
- [ ] Persistir el resultado en `app/src/config/deployment.json` — verificado: sigue con los 5 campos en `null` incluso en la rama que ya deployó localmente hoy. El deploy real corrió pero no quedó grabado en el repo.

## 4. Entorno / MCP — lo que quedó de la sesión de diagnóstico

- [ ] Autorizar el MCP `midnight` (Kapa, docs oficiales) con `/mcp` en una sesión interactiva — requiere login del usuario, no se puede hacer en background.
- MCP `midnight-devnet` y plugin `devs`: **no existen** — referencias rotas del propio ecosistema de plugins midnight-expert. No son pendientes de acción, son limitaciones del tooling en sí.

## Orden recomendado

1. Mergear `worktree-e2e-fix-querycontractstate` → `dev` → pull → `dev` → `main` (sección 0)
2. Topic `midnightntwrk` (sección 0)
3. Fail-closed en `verifyAuthorship` (1.1) — rompe la demo estrella si no se arregla
4. Corregir la afirmación de designated-verifier (1.5) — un jurado técnico la puede pinchar contra el ZKIR
5. Fondear wallet y deploy a Preview (sección 3) — 40% de la nota, según la rúbrica citada en el reporte original
6. `orgId` fuera del nullifier + profundidad del árbol a 16 (1.2, 1.3) — si no entran antes de la entrega, declararlos como limitación conocida en el README
7. `reportId`/nullifier atado a `contractAddress` (1.4)
8. Cliente UI conectado de verdad a Preview (sección 2)
