# 08 — Resultado de la auditoría (2ª pasada, modo goal)

> Ejecutada el 8–9/8 sobre `dev`, siguiendo `docs/07-auditoria-handoff.md`.
> Método: verificar contra el **ZKIR compilado**, el **código fuente del ledger
> de Midnight** y **compilando Y ejecutando** — nunca de memoria. Todo lo que
> sigue está commiteado en `dev` (`5be81fb`), sin tocar `main`, sin redeploy,
> sin actualizar el toolchain.

## Veredicto en 3 frases

1. **El repo estaba sólido pero mentía en un punto caro:** una pasada anterior
   había "corregido" `docs/05 §1` para afirmar que `orgId` **es** público en
   `denunciar`. Es falso, verificado contra la fuente. Quedaba en ~8 lugares,
   incluido el Q&A del hackathon y un test verde que lo "probaba" mal.
2. **La suite pasa 375/375, pero dos checks eran vacíos** (una tautología y un
   test que miraba el objeto equivocado). Corregidos y ahora prueban lo que dicen.
3. **Un hallazgo de seguridad Crítico y tres Altos** salieron de la auditoría
   adversarial. El Crítico y varios se documentaron como limitación (no se
   redeployó); los Altos quedan como recomendación con fix propuesto.

---

## OBJETIVO 1 — La doc dice lo mismo que el código

### El error caro: "`orgId` es público en `denunciar`" — FALSO (corregido)

Verificado contra el crate `zkir` del ledger (`LFDT-Minokawa/compact` +
`midnightntwrk/midnight-ledger`):

- `num_inputs` en el `.zkir` es la **aridad de witnesses**, no la lista de
  public inputs (compilador: `(length index*)`; VM del ledger: se cargan como
  celdas de witness privado).
- `declare_pub_input` es el **único** opcode que mete un valor en el vector de
  public inputs, y el compilador lo emite solo al tocar el ledger (donde
  compila `disclose()`). En `report.zkir`, las vars de `orgId` **no** están ahí.
- El `ContractCall` on-chain lleva un `communication_commitment` **ocultante**
  (Poseidon con opening nunca publicado), no los args crudos.

**Conclusión:** `report` publica el `reportId`, el `nullifier`, la época y la
raíz global de Merkle — **no el `orgId`**. `orgId` es público solo por
`registerOrganization`/`issueCredential`. **Consecuencia (M-1):** on-chain no se
puede atribuir una denuncia a una org; la semántica multi-org es cierta
in-circuit pero no verificable por un tercero en la cadena.

Corregido en: `README.md`, `docs/00`, `docs/01`, `docs/03`, `docs/05-mejoras`,
`docs/06`, `docs/07`, `docs/contexto-hackathon.md`. El test que lo afirmaba mal
(`transcript-privacy.mjs §4`) leía `proofData.input` (el vector local del
prover, que siempre contiene los args); ahora verifica sobre el transcript
público real, con un guard que prueba que el reportId SÍ aparece y el orgId NO.

**Frase segura ante un juez:** *"la org es pública porque se registra y emite
credenciales on-chain; una denuncia individual no revela de qué org es."*

### Documentación desactualizada vs contrato v2 (corregido)

`contracts/README.md` describía el contrato v1:

| Decía (v1) | Es (v2) |
|---|---|
| `HistoricMerkleTree<8>`, 256 hojas | `<16>`, 65 536 |
| 5 tags, incl. `authorship:v1` | 6 tags: se saca `authorship`, entran `receipt:v1` e `issuer:v1` |
| `authorshipOf`, `revealAuthorship(reportId, prosecutorPk)` | `receiptOf`, `revealAuthorship(reportId)` (nonce = witness) |
| export con campo `proof` | export v3 `{version, reportId, receipt}` |
| "65 checks" | 87 |

Otros fósiles corregidos: `shared/src/crypto.ts` y `tests/harness/crypto.ts`
decían "seven pure circuits" (son 6); `secrets.ts` documentaba
`nullifierOf(credSecret, orgId, period)` (ya sin `orgId`); comentario de
`proveAuthorship` listaba `prosecutorPk` como público (es witness); depth-8
fósil en `model.ts`, `docs/03`, `docs/05`, `docs/06`.

### Afirmaciones verificadas como CIERTAS (no se tocaron)

- Fees en DUST **shielded** con esquema commitment/nullifier
  (`ledger/src/dust.rs`: `DustCommitment`, `DustNullifier`, `DustSpend`).
- El indexer recibe la **viewing key en claro** (`connect(viewingKey)` en el
  schema GraphQL v4; el server la usa para filtrar por relevancia).
- Contrato deployado en Preview `aeb44bb5…`, bloque 325503, y los 4 actos
  (325613/618/623/627) — confirmado consultando el indexer en vivo.
- `preview.midnightexplorer.com` da 404 a una address inventada;
  `explorer.preview.midnight.network` da 200 (confirmado en vivo).
- El contrato v1 `00bb2fc3…` sigue queryable (confirmado).
- El contrato **no mueve tokens**: los 5 ZKIR solo usan
  `member`/`insert`/`lookup`/`checkRoot`; cero opcodes de coin/Zswap/DUST.

---

## OBJETIVO 2 — El código está bien

### Lo que está sólido (confirmado ejecutando, no solo compilando)

- **Witness ↔ contrato:** 38/38 en ejecución. Nombres, tuplas, tipos y private
  state correctos; `credentialPath` devuelve 16 siblings (depth-16 real, sin
  fósiles de 8 en código).
- **Nullifier ligado a la credencial probada:** el ZKIR fuerza que el mismo
  secret alimente el commitment y el nullifier — no se puede probar pertenencia
  con un secret y quemar el nullifier de otro.
- **C0 (época) es constraint del chain, no del prover:** `blockTimeGte/Lt` con
  `windowStart/End` como public inputs; el período queda clavado a
  `floor(blockTime/86400)`.
- **`receiptOf` sin secret en el preimagen:** el fiscal recomputa con datos
  públicos y su nonce; no puede acuñar un recibo para otro nonce. Sin
  `ownPublicKey()` en ningún lado.
- **Separación de dominios completa:** 6 tags, todos en posición 0, distintos en
  cada par de misma aridad. **Sin colisión cross-domain residual.**

### Hallazgos de seguridad

| # | Sev | Hallazgo | Estado |
|---|---|---|---|
| C-1 | **Crítico** | El secret del emisor se deriva del `orgId` público (`sha256("phantomtrace:demo-issuer:v1:"+orgId)`) y se usa en modo `--network`. Cualquiera lo recomputa y emite credenciales bajo una org ajena → la auth v2 es *demo-grade* en el deploy. | **Documentado** (README limitación #3 + warning en `common.ts`). No se cambió runtime para no romper la demo/evidencia; el fix real (secret aleatorio, en vault) es ~1 h. |
| H-1 | Alto | La raíz de Merkle disclosada es una **huella del estado del árbol**: el emisor, que ve cada `issueCredential`, mapea raíz→cantidad de hojas y puede colapsar el conjunto de anonimato a **un** empleado (el más nuevo). Recomputar el path "fresco" NO ayuda: lo que filtra es la identidad de la raíz. | **Abierto** — recomiendo piso de k-anonimato in-circuit (`firstFree() >= K`) + batch de emisión + delay emisión→denuncia. |
| H-2 | Alto | `registerOrganization` es first-come, irreversible y front-runnable: un atacante registra tu `orgId` con su ancla y lo **niega permanentemente** (contrato inmutable, sin update). | **Abierto** — mínimo: declarar la limitación; fix real: derivar `orgId` del issuerSecret para que okupar una etiqueta ajena sea inútil. |
| H-3 | Alto | `issueCredential` **no tiene guard de idempotencia**: la misma `(orgId, credCommitment)` consume una hoja nueva cada vez. Con registro libre, cualquiera llena las 65 536 hojas y **brickea** la emisión para siempre. | **Abierto** — 3 líneas: `Set` de hojas emitidas + assert de no-duplicado; opcional: cuota por org. |
| M-2 | Medio | `proveAuthorship` devuelve un recibo **no ligado al nonce/verificador** (el nonce es privado, el recibo es `output`, no public input). Hoy es código muerto (nadie lo llama), pero cablearlo como dice la doc reintroduce la republicación (H-2 de la 1ª auditoría). | **Abierto** — ligar el nonce al statement público, o borrar el circuito (el flujo v3 no lo necesita). |
| M-3 | Medio | La entropía del `prosecutorNonce` no se valida: un nonce memorable (nº de expediente, fecha) es enumerable offline contra el set público `authorships`. | **Abierto** — exigir que el nonce venga de `randomBytes(32)`. |
| M-4 | Medio | Metadata de la tx liga la wallet que paga a cada `report`/`revealAuthorship`; anula el mitigante del secret-por-denuncia en la capa de transporte. | **Abierto** — documentar: wallet fresca por denuncia; nunca reusar para revelar. |
| M-5 | Medio | Proof server publicado en todas las interfaces (`-p 6300:6300`) y recibe todos los witnesses en claro. | Ya en el handoff; recomiendo `-p 127.0.0.1:6300:6300`. |
| M-6 | Medio | `secrets/` y el private state LevelDB en **texto plano** en disco (solo `0600`). Para el modelo de amenaza (empleador con acceso a la máquina) es la ruptura más probable. | **Abierto** — cifrar con clave derivada de passphrase. |

### Calidad de los tests — verdes por el motivo correcto

Además del `[HIGH-1]` que ya estaba arreglado, encontré **2 checks vacíos** (ahora corregidos):

- `transcript-privacy.mjs §2`: `rootA === rootB` con la misma expresión dos
  veces (tautología); y el "same field elements" pasaba comparando `[] === []`
  porque el extractor no matcheaba el formato real del transcript. Reescrito con
  un extractor de celdas real + guard de no-vacuidad.
- `transcript-privacy.mjs §4`: afirmaba "orgId visible" leyendo `proofData.input`
  (vector local del prover). Reescrito para verificar sobre el transcript público
  y con un guard que prueba que el reportId SÍ está y el orgId NO.
- `ui/shared/cripto.test.ts`: `receiptOf(x,y) === receiptOf(x,y)` (tautología).
  Reescrito para probar que el recibo liga el `reportId` y no necesita secret.
- Cobertura ampliada: `contract-agreement.test.ts` ahora fija también
  `credCommitmentOf` contra el contrato compilado.

---

## Qué NO se tocó y cabos sueltos

- **`main`:** intacto. **No se redeployó.** **No se actualizó el toolchain**
  (0.31.1). Ambos contratos compilan; el fallback también.
- **`contracts/test/transcript-org-anonimato.mjs`** (sin trackear): roto —
  importa nombres en español (`nuevoMundo`, `EPOCA`, `resumen`) que el harness
  inglés no exporta, así que nunca corre. Su propiedad ya está cubierta por
  `transcript-privacy.mjs`. **Recomiendo borrarlo** (no lo hice: no es mío).
- **`estrategia-ganar.md`** (sin trackear): no es parte de la auditoría, se dejó.
- ⚠️ **Divergencia con `origin/dev`:** mientras auditaba, alguien pusheó
  `df89f78` (deck) a `origin/dev`. Tu `dev` local tiene mi commit `5be81fb`
  sobre la base vieja. **Antes de pushear hay que integrar** (rebase/merge) —
  `dev` local y `origin/dev` están 1 y 1 divergidos.
- **Faltan deck y video** (2 de los 3 entregables). Ninguna auditoría de código
  cambia eso.
