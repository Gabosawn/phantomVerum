# 05 — Plan de mejoras: arquitectura, seguridad y compliance

> Resultado de una investigación en paralelo (arquitectura de protocolo · seguridad
> y compliance · calidad y entregables). **Todo lo marcado ✅ VERIFICADO se comprobó
> compilando o ejecutando contra el compilador 0.31.1 y la red Preview real**, no
> leyendo documentación. Lo no verificado está marcado como tal.
>
> Contexto: vie 7/8 ~16:00 ART. Entrega sáb 13:00. Deploy a Preview **todavía no
> ocurrió** — es el 40 % del rubric y bloquea todo lo demás.

---

## 0. Lo que hay que decidir ANTES de deployar (irreversible)

### 0.1 Autoridad de mantenimiento del contrato — se elige al deployar, para siempre

`deployContract` de midnight-js **genera una signing key al azar** si no le pasás
una (`signingKey ?? sampleSigningKey()`) y la guarda en el LevelDB de private
state local. Consecuencias:

- Si perdés `.private-state/`, el contrato queda **permanentemente
  no-actualizable**.
- Por el camino de bajo nivel (`createUnprovenDeployTx`, recomendado porque
  `deployContract` cuelga en Preview), si no pasás la key explícitamente podés
  shippear un contrato congelado sin darte cuenta.

El mecanismo de upgrade de Midnight es la **Contract Maintenance Authority**:
permite rotar verifier keys de circuitos **conservando dirección, estado y
balance**, pero **no existe migración de estado ni cambio de layout del ledger**.
Si v2 necesita otro campo, es contrato nuevo.

**Acción:** decidir y documentar la key de mantenimiento antes del deploy;
hacer backup fuera de `.private-state/`. Slide de roadmap: *"v2 se shippea como
rotación de verifier key vía CMA; el layout del ledger quedó congelado en v1,
por eso fijamos los tipos ahora."*

### 0.2 `deployContract()` cuelga en Preview

Reportado consistentemente en los ejemplos del ecosistema: llama
`watchForTxData` internamente y puede colgar 30–120 s o indefinidamente por lag
del indexer. Usar `createUnprovenDeployTx` + `submitTxAsync`. **Bonus:** la
dirección del contrato está disponible en `deployTxData.public.contractAddress`
**antes** de submitear — se puede poner en el README mientras la tx confirma.
Esperar 2–10 s de lag del indexer: poll, no query único.

---

## 1. La duda de §3.4, RESUELTA — y es mitad victoria, mitad corrección

Se decodificó el transcript por **dos métodos independientes** (análisis de
`declare_pub_input` en el ZKIR + volcado del `publicTranscript` del simulador).
Coinciden.

| Circuito | Publica | NO publica |
|---|---|---|
| `registrarOrganizacion` | `orgId`, `ancla` | — |
| `emitirCredencial` | `orgId`, repr. *hiding* de la hoja | `credCommitment`, la hoja cruda |
| **`denunciar`** | raíz de Merkle, `nullifier`, `denunciaId`, `inicio`/`fin` de época | **`orgId`**, `credencialSecret`, `secretPersonal`, `evidenciaHash` |
| `revelarAutoria` | `denunciaId`, `autoriaHash` | **`fiscalPk`**, `secretPersonal`, raíz de Merkle |

### ✅ `orgId` NO aparece en `denunciar` — punto fuerte no reclamado

En el ZKIR, los dos field elements de `orgId` **nunca** son `declare_pub_input`.
Como el árbol de Merkle es **global**, la raíz es la misma para todas las
organizaciones ⇒ **el conjunto de anonimato es toda credencial de toda
organización, no solo la org acusada.** Es más privacidad de la que el deck
reclama hoy, y es gratis reclamarla.

### ❌ `periodo` SÍ aparece — pero con fuga de 0 bits

El ZKIR hace `declare_pub_input` de `inicio` y `fin`. En el transcript aparecen
literales (`8071766a` LE = 1786147200). `periodo = inicio / 86400` es trivial.

**El matiz que lo convierte en no-problema:** el circuito fuerza
`inicio ≤ blockTime < inicio + 86400`, o sea `periodo == floor(blockTime/86400)`
**siempre** (probado con 4 blockTimes distintos). El timestamp del bloque ya es
público ⇒ **publicar `periodo` no agrega información**.

**Framing inatacable:** *"el transcript revela la época, que es una función
determinista del timestamp del bloque — información que la cadena ya publica.
La organización del denunciante, en cambio, no aparece."*

### ✅ Bonus: `fiscalPk` tampoco sale

Un observador ve *que* alguien reveló autoría de la denuncia X, **no ante quién**.
Y `revelarAutoria` no ejecuta `checkRoot` ⇒ revelar autoría no vuelve a exponer
la pertenencia a la org. *Caveat honesto:* quien tenga el export (y por tanto
`sec`) puede enumerar candidatos.

---

## 2. HOY — ~1,25 h, el mejor retorno del plan

| # | Ítem | h | Por qué |
|---|---|---|---|
| 1 | **Portar `transcript.mjs` a `contracts/test/`** (ya escrito y **19/19 verde**) | 0,5 | Convierte la afirmación de privacidad en un test ejecutable. Suite 47 → 66. Es el artefacto que un juez de privacidad busca y casi nadie muestra. Engineering + QA |
| 2 | **Corregir `.agents/skills/midnight-security/SKILL.md`** | 0,25 | **Está commiteado en el repo público** y afirma en 5 lugares que *"circuit arguments … are part of the public transcript"*. **Es falso** — lo desmiente la doc oficial y nuestra medición. Un juez que lo lea concluye que `orgId` es público y que no entendemos nuestro propio contrato |
| 3 | **Corregir §3.4 de `docs/03`** con el resultado real | 0,25 | Hoy dice "no verificado"; ya está verificado |
| 4 | **Script `test` en `app/package.json`** | 0,25 | `app/` no tiene script `test`: sus ~99 checks nunca corren. `npm test` pasa de 47 a ~146 visibles. QA es 15 % y casi nadie lo muestra |
| 5 | **Arreglar nombres de scripts del README** | 0,1 | El README promete `register-org`/`report`; `app/package.json` define `registrar-org`/`denunciar`. **Un juez que copia y pega recibe `Missing script`** |
| 6 | **CI con la action oficial** `midnightntwrk/setup-compact-action@v1` | 0,3 | Badge verde = prueba automática del gate anti-DQ desde clone limpio. Ojo: la action cachea `~/.local/share/compact`, que **no existe** — el toolchain real vive en `~/.compact` |

---

## 3. Hallazgo nuevo: DoS del árbol + squatting de `orgId` (reproducidos)

Nadie había conectado "sin control de acceso" con "profundidad 8":

- **Agotamiento del árbol:** cualquiera llama `emitirCredencial`. Se insertaron
  **255 hojas basura → `Error: exceeded structure bounds`**. El canal queda
  muerto: ninguna credencial nueva puede emitirse jamás. Los denunciantes ya
  registrados siguen funcionando. **El arreglo exige redeploy** (la profundidad
  es parámetro de tipo). Costo del ataque: 256 txs.
- **Squatting:** `assert(!organizaciones.member(orgId))` es first-come-first-served,
  sin update ni revoke. Un atacante registra el `orgId` de una empresa real con
  **su** ancla ⇒ la empresa real nunca puede registrarse, y el squatter emite
  credenciales a quien quiera.

### Fix verificado (compila y corre, ~12 líneas)

Convertir `ancla` —hoy metadata decorativa— en el commitment del secret del emisor:

```compact
export pure circuit anclaDe(emisorSec: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<2, Bytes<32>>>([domEmisor(), emisorSec]);
}
// dentro de emitirCredencial, tras el member():
assert(organizaciones.lookup(disclose(orgId)) == anclaDe(emisorSecret()),
       "no sos el emisor de esta organizacion");
```

Probado: emisor legítimo ✅ / tercero rechazado ✅. Cierra ambos DoS y le da
sentido a `ancla`. Costo total ~3 h (contrato 0,5 + app 1 + tests 1 + verif 0,5).
Recompilar PLONK: 42 s. Costo de circuito medido: `denunciar` **no cambia**
(el camino caliente es gratis); `emitirCredencial` 2,82 → 5,21 MB.

**Veredicto: DECK + ROADMAP → promover a HOY si el deploy cierra antes de las 21:00.**
En Q&A es oro: *"sabemos exactamente cuál es el fix, son 12 líneas y compilan"*.

---

## 4. H-2: el fix cuesta 1,5 h, no 6 — y no necesita criptografía nueva

> **Corrección a una versión previa de este documento**, que recomendaba ECDH
> como único camino. Una investigación posterior encontró algo más simple y
> **más barato que el contrato actual**.

### ✅ OPCIÓN 0 (RECOMENDADA) — sacar `sec` del hash del recibo · 1,5 h

**El circuito ya prueba en ZK que quien escribe conoce el preimagen de
`denunciaId`.** Esa garantía la da la cadena al verificar el proof — no el hash.
El único motivo por el que hoy le entregamos `secretDenuncia` al fiscal es que
`autoriaDe(sec, denunciaId, fiscalPk)` mete `sec` adentro, y sin `sec` el fiscal
no puede recomputar el hash para buscarlo en el `Set`.

Solución: sacar `sec` del hash y que el `fiscalPk` sea un **nonce fresco que el
fiscal elige en el momento**:

```compact
export pure circuit reciboDe(denunciaId: Bytes<32>, fiscalNonce: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<3, Bytes<32>>>([domAutoria(), denunciaId, fiscalNonce]);
}
```

El fiscal recomputa `reciboDe(denunciaId, suNonce)` con datos **100 % públicos**
y lo busca en `autorias`. **Nadie le entrega ningún secreto jamás.** Que el
recibo exista solo puede haberlo causado alguien que pasó el assert
`denunciaIdDe(ev, sec) == denunciaId`.

**Verificado ejecutando:**
```
[fiscal]          recibo esperado en el ledger? SI ✓
[atacante]        bloqueado: failed assert: no sos el autor
[fiscal-suplanta] bloqueado: failed assert: no sos el autor   ← el ataque de H-2, muerto
```

La tercera línea es la clave: **el propio fiscal, con todo lo que recibió, no
puede republicar la autoría.**

**Cuesta menos que el contrato actual:** 36,7 s de compilación ZK vs 40,8 s;
prover key 5 201 780 B vs 5 204 698 B. Cero criptografía nueva, cero
dependencias, ~6 líneas de contrato.

**Veredicto: HOY, antes del deploy.** Cierra el agujero reproducido y deja la
historia de seguridad del pitch cerrada.

### OPCIÓN A′ — ECDH, solo si sobran ≥ 6 h después del deploy

Agrega **confidencialidad del destinatario** (un observador no puede saber *a
quién* se reveló). Es un upgrade estrictamente aditivo sobre la Opción 0.
Compilado y verificado end-to-end; prover key 5,75 MB (+10 %), 38,6 s.

⚠️ **No usar el módulo `EcdhMask` de OpenZeppelin tal cual**: su KDF usa
`persistentHash` (SHA-256, caro en circuito) y **duplica la prover key a
11,0 MB**. Cambiando la KDF a `transientHash` baja a 5,75 MB.

⚠️ **Trampa del escalar, medida:** `ecMul`/`ecMulGenerator` fallan en *runtime*
si el escalar ≥ el orden de Jubjub. **81 % de los `Field` aleatorios revientan**
(162/200 en la medición) y **no hay chequeo en compilación**. Patrón seguro
(0 fallos en 500 muestras): `degradeToTransient(persistentHash([seed]))`, que
trunca a 31 bytes.

### ❌ Lo que NO funciona (dos correcciones a supuestos previos)

- **`CurvePoint` no existe** — es `JubjubPoint`, y **no es un struct**: `P.x`
  falla, hay que usar `jubjubPointX/Y`.
- **El esquema "commitment + apertura interactiva off-chain" está roto**: el
  fiscal manda un nonce `n`, el denunciante responde `H(sec‖n)` — **y el fiscal
  no tiene con qué verificar esa respuesta sin conocer `sec`**. Es un no-op. La
  Opción 0 es exactamente ese esquema arreglado: mover el nonce del fiscal
  *adentro* del hash del recibo.

### Material de respaldo (ECDH, para el deck)

La stdlib expone `ecAdd`, `ecMul`, `ecMulGenerator`, `hashToCurve`.
⚠️ El tipo se llama **`JubjubPoint`** (no `CurvePoint`/`NativePoint` — la doc
oficial está desactualizada acá). `jubjubSchnorrVerify` **no existe** en 0.31.1
(sí en repo HEAD ~0.33) — no confiar en el `main` de GitHub como referencia.

Construcción ECDH que compila y corre:

```compact
export pure circuit marcaDelFiscal(fsk: Field, R: JubjubPoint, denunciaId: Bytes<32>): Bytes<32> {
  return marcaDe(ecMul(R, fsk), denunciaId);   // el fiscal verifica OFF-CHAIN
}
export circuit revelarAutoriaZK(denunciaId: Bytes<32>, fiscalPk: JubjubPoint): [] {
  const sec = secretDenuncia(); const ev = evidenciaHash(); const r = efimero();
  assert(denunciaIdDe(ev, sec) == denunciaId, "no sos el autor");
  const marca = marcaDe(ecMul(fiscalPk, r), denunciaId);
  efimeras.insert(disclose(ecMulGenerator(r)));
  autorias.insert(disclose(marca));
}
```

Resultado en el simulador:
```
FISCAL    recomputa con SU fsk -> 720a4da3...  en ledger: true
EMPLEADOR recomputa con SU fsk -> e891d35f...  en ledger: false
```

**El fiscal verifica 100 % off-chain y NUNCA recibe `secretDenuncia`** ⇒ no puede
republicar la autoría ni quemar slots. Prover key +10 % (5,20 → 5,75 MB).

**Costo de integración: 5–6 h** (cambia la API — `fiscalPk` pasa a `JubjubPoint`,
nuevo witness `efimero`, el fiscal necesita keypair Jubjub, cambia el formato del
export y `verificarAutoria`).

**Veredicto: DECK con el PoC compilado como respaldo → HOY solo si Preview cierra
antes de las 21:00 y sobran 6 h.** Convertiría el clímax del video de "suposición
de confianza declarada" a **propiedad criptográfica**.

---

## 5. `ownPublicKey()` no sirve para autorización — con exploit corrido

Probado a tres niveles independientes:
1. El código generado lo trata **idéntico a un witness**
   (`partialProofData.privateTranscriptOutputs.push`).
2. Los ZKIR de `assert(ownPublicKey()==owner)` y `assert(miSecreto()==owner)`
   **diffean a cero**: 42 instrucciones, 2 `private_input` cada uno.
3. **Exploit ejecutado:** Mallory pasa la clave de Alice → *ACCESS CONTROL
   BYPASSED*. Una línea de frontend.

Respaldo: doc oficial de Midnight (*"Do not use `ownPublicKey()` for verification
of the caller"*), auditoría **CRITICAL C-01 de OpenZeppelin**, y Thomas Kerber
(*"`ownPublicKey` was never intended to provide access control"*).

**Trampa ergonómica no documentada:** el patrón **inseguro compila limpio**,
mientras el seguro (`persistentHash(secret)`) **exige `disclose()`**. El
compilador parece bendecir el inseguro. `disclose()` es análisis de *privacidad*,
no de *integridad*.

**Nuestro contrato ya usa el patrón correcto.** Munición directa para el deck:
*"el control de acceso que shippeamos es la misma construcción que la librería
auditada de OpenZeppelin adoptó después de que su propia auditoría matara la
ingenua."*

⚠️ Si alguien piensa usar OZ multisig: `ShieldedMultiSig.compact` **sigue
autenticando con `ownPublicKey()`** (quedó fuera del alcance de la auditoría).

---

## 6. Compliance: el claim de la SEC está mal, y la UE es mejor gancho

### El claim de la SEC tiene dos errores y un problema de fondo

`docs/00-idea.md:25-27` dice *"paga 10–30 % de la multa solo a quien prueba que
fue el primero en reportar"*.

- **"de la multa" → es de lo COBRADO.** 15 U.S.C. §78u-6(b)(1): *"of what has
  been **collected**"*. Y es **agregado entre todos los denunciantes**, no per cápita.
- **"el primero en reportar" no es el criterio.** El estatuto exige *"original
  information … that led to the successful enforcement"*, con umbral de sanciones
  **> $1.000.000**.
- **El problema de fondo:** 17 CFR §240.21F-7(b) exige **abogado** para denunciar
  anónimamente, usar el portal TCR, y *"**before the Commission will pay any award
  to you, you must disclose your identity**"*. **Una denuncia en blockchain no es
  una submission válida ante la SEC.** El sistema puede ser un sello de evidencia
  *previo* al Form TCR — nunca "denuncia anónima ante la SEC".

⚠️ `sec.gov` devuelve 403 desde este entorno: verificar las cifras FY2025 a mano
antes de ponerlas en un slide.

### La Directiva UE: el claim es exacto y tiene dos artículos mucho mejores

*"Obligatoria para +50 empleados"* → **correcto** (Art. 8(3); Art. 8(4) sin umbral
para servicios financieros, blanqueo, transporte y medio ambiente).

**Los dos artículos que deberían liderar el pitch:**

- **Art. 6(3)** — *"Las personas que hayan denunciado de forma anónima pero que
  posteriormente hayan sido identificadas y sufran represalias **seguirán teniendo
  derecho a protección**"*. Es la norma que hace jurídicamente coherente
  **denunciar anónimo hoy y reclamar protección mañana**. La revelación de autoría
  diferida es su implementación criptográfica exacta. Encaje quirúrgico.
- **Art. 21(5)** — **inversión de la carga de la prueba**: si el denunciante
  acredita que denunció y sufrió un perjuicio, *"se presumirá que el perjuicio se
  produjo como represalia"*. Hoy esa prueba la custodia **quien va a despedirlo**.
  El sello con timestamp de bloque se la da al denunciante, en un registro que el
  empleador no controla. **Ese es el valor real del producto.**

**Mejor mercado: España.** Ley 2/2023 Art. 7.3 obliga a que los canales internos
*"permitirán incluso la presentación y posterior tramitación de comunicaciones
anónimas"* — la Directiva las deja opcionales, España las hace obligatorias.
Multas hasta **1.000.000 €**. Art. 33.2 exige que el sistema *"no obtendrá datos
que permitan la identificación del informante"* — que es literalmente lo que hace
una prueba ZK. **Argentina:** Ley 27.401 Art. 23 pone el canal en la lista
*potestativa*; no hay régimen general de protección.

### Lo que NO cubrimos (decirlo de frente)

~60 % del Art. 9(1): acuse de recibo en 7 días, bidireccionalidad, respuesta
motivada en ≤3 meses, canal verbal, canales externos.

**Tres conflictos duros** que un juez con background legal va a buscar:
1. **Inmutabilidad vs. obligación de borrar** (Art. 17 y 18(1); España Art. 32.4
   supresión a los 3 meses; RGPD Art. 17). Mitigación: on-chain **solo commitments
   opacos, cero payload**.
2. **España Art. 26.1: "este registro NO SERÁ PÚBLICO"**. Reencuadre obligatorio:
   **la cadena no es el libro-registro; es el ancla de integridad de un
   libro-registro que sigue siendo privado off-chain.**
3. **Art. 16(1) cubre la identidad deducible INDIRECTAMENTE** — nullifier, timing,
   pagador de fees y tamaño del conjunto de anonimato caen ahí. En España es
   infracción muy grave que se consuma *"aunque no se llegue a producir la efectiva
   revelación"*.

**Posicionamiento honesto:** no es un canal conforme a la Directiva. Es una
**capa de no-repudio para el denunciante**: prueba criptográfica, custodiada por
él y no por el empleador, de que (i) pertenecía a la org, (ii) denunció, (iii) en
fecha cierta, (iv) con contenido determinado. **Complemento probatorio del canal
obligatorio, no sustituto.**

---

## 7. Verificabilidad para el juez

### ⚠️ El explorador "oficial" es una trampa

`explorer.preview.midnight.network` devuelve **HTTP 200 para cualquier ruta** pero
no muestra datos — un juez ve una página vacía y concluye que el deploy es falso.

**Usar `https://preview.midnightexplorer.com`** — indexa Preview de verdad y
**404ea ante direcciones inventadas**, o sea que un link que funciona es evidencia
falsable. Rutas en **plural**: `/contracts/<addr>`, `/transactions/<hash>`,
`/blocks/<altura>`. Linkear bloques **por altura, nunca por hash** (intermitente).

### Lo que prueba un deploy, de más fuerte a más débil

1. **Dirección + link al explorer** (falsable por el juez).
2. **`curl` copiable del indexer** (CORS `*`, sin auth — verificado):
   ```bash
   curl -s https://indexer.preview.midnight.network/api/v4/graphql \
     -H 'Content-Type: application/json' \
     -d '{"query":"{ contractAction(address:\"<ADDR>\"){ address state transaction { hash block { height } } } }"}'
   ```
3. **Hash de la tx de deploy** con `transactionResult { status }` → `SUCCESS`.
4. **Screenshots — valor probatorio casi nulo.** Solo como apoyo visual.

Para la demo en vivo, el artefacto más fuerte es la subscription
`contractActions` con `offset: {height: 0}`: **replaya el deploy y cada llamada en
orden, con los nombres de circuito en `entryPoint`**, streameando frente al juez.

**Dos correcciones al skill `indexer` local:** `Transaction` es una **interfaz**
GraphQL — `transactionResult` y `fees` viven en `RegularTransaction`, hay que usar
`... on RegularTransaction`. Y **el bug de `offset: null` no se reproduce** en el
indexer v4 actual de Preview: no gastar tiempo en el workaround.

---

## 7-bis. 🔴 EL RIESGO REAL NO ES CRIPTOGRÁFICO — es de red y timing

**Medido contra Preview ahora mismo, no inferido:**

```
1000 bloques consecutivos (~100 min de chain time):
  bloques con transacciones:  129   (87 % VACÍOS)
  transacciones totales:      141   (~1,4 tx/min en TODA la red)
  contract calls encontradas:   0   (en ~2000 bloques escaneados)
```

**El conjunto de anonimato por bloque es ≈ 1.** Una denuncia será, con altísima
probabilidad, la única transacción de su bloque y la única contract call de la
hora. Correlacionar contra fichajes, VPN corporativa o "quién estaba en la
oficina" es trivial.

**Esto es más grave que cualquier fuga criptográfica del contrato**, y hay que
decirlo en el deck antes de que lo pregunte un juez.

### El mempool público está abierto en el RPC oficial

`author_pendingExtrinsics` responde HTTP 200 en `rpc.preview.midnight.network`
(verificado). No hace falta correr un nodo: el endpoint oficial sirve el pool de
transacciones pendientes a cualquiera. La doc de Midnight recomienda
`--rpc-methods Safe`, que el endpoint público **no** aplica.

### Lo que SÍ está bien por diseño

**La fee NO revela quién paga.** `DustSpend` tiene exactamente cuatro campos
(`newCommitment`, `oldNullifier`, `proof`, `vFee`) — **sin owner, sin address**.
El gasto de DUST se autoriza por prueba ZK. Confirmado por introspección del
indexer: `DustSpendProcessed` y `DustOutput` no exponen address.

⚠️ **Pero cualquier movimiento unshielded sí publica la address**
(`UnshieldedUtxo.owner` es público y consultable sin auth). **Regla de diseño:
el circuito de denuncia no debe mover tokens unshielded.** El nuestro no lo hace.

### Tres bombas no documentadas por Midnight

1. **El comando de instalación oficial del proof server incluye `-v`**, y ese
   flag hace `debug!("Received request: {hex}")` sobre cada `/prove` — o sea
   **un hex-dump de cada witness y de cada coin secret key a `docker logs`**.
   ✅ Verificado: nuestro container **no** usa `-v`.
2. **El proof server bindea a `0.0.0.0` con CORS permisivo y sin TLS.**
   ✅ **Corregido**: recreado con `-p 127.0.0.1:6300:6300`, verificado que ya no
   responde desde la IP de LAN.
3. **El `disconnect` del indexer no borra nada.** `DELETE FROM wallets` tiene
   0 resultados en todo el repo: el ciphertext de la viewing key, su hash
   (pseudónimo estable) y el mapeo wallet→todas-sus-transacciones **persisten
   indefinidamente**. No hay política de retención publicada.

### Mitigaciones — paquete de ~3 h

| # | Mitigación | h | Estado |
|---|---|---|---|
| M1 | Proof server local, sin `-v`, bind `127.0.0.1` | 0,25 | ✅ **HECHO** |
| M2 | **No llamar `connect` del indexer / no entregar viewing key.** Leer con `contractAction(address)`, que no pide credencial | 0,5-1 | **HACER** — elimina toda la fuga del indexer |
| M9 | `assert(path.leaf == derivePublicKey(secretKey()))` — la doc oficial lo llama *"the security-critical line"*; sin eso, cualquiera replaya un path visto en una tx pública | 0,25 | **VERIFICAR** si ya está |
| M10 | Domain separator del nullifier distinto al del commitment | 0,5 | ✅ ya está |
| M3 | Delay aleatorio antes del submit | 0,5 | Barato; con 1,4 tx/min ayuda poco solo, pero es defensa declarable |
| M5 | Tor/VPN para el submit RPC | 0,5-1 | Única defensa contra el binding IP↔address |
| M11 | Tráfico señuelo (denuncias dummy programadas) | 1-2 | Alto valor dado el conjunto ≈1 |

**NO usar 1AM para sponsorship:** delega el *proving*, o sea que ProofStation
recibe **los witnesses en claro** más la IP. Empeora el modelo de amenaza.

**DUST sponsorship propio** sí existe y está documentado oficialmente
(`/sdks/official/wallet-developer-guide.md#dust-sponsorship`, usa
`Transaction.merge` por debajo), pero son 4-8 h. **Al deck.**

### Para el deck: lo que Midnight NO documenta

Nada sobre privacidad a nivel de red — ni IP, ni Tor, ni timing, ni batching, ni
tamaño de conjunto de anonimato más allá de una frase. Sin privacy policy ni
retention policy para sus endpoints públicos. Decir esto de frente, con nuestras
mediciones al lado, es exactamente el tipo de honestidad técnica que distingue
un proyecto serio.

---

## 8. Cortado con fundamento

| Qué | Por qué |
|---|---|
| **Recompensa al denunciante** | `sendShielded` **no crea los ciphertexts** que la wallet necesita para descubrir la moneda ⇒ pagarle a un desconocido es plata invisible. La versión unshielded publica su dirección y mata el producto. La respuesta del ecosistema (MIP-0012) es un spec *propuesto* de 900 líneas |
| **Fianza anti-spam** | `receiveUnshielded` exige un UTXO firmado y público del denunciante ⇒ arquitectónicamente incompatible con anonimato |
| **Multi-contrato** | Compilado: `cross-contract calls are not yet supported`. Llega en toolchain 0.33 = **ledger 9**, que Preview no corre. **No actualizar el toolchain** |
| **OZ `Initializable`** | Bug abierto (LFDT-Minokawa#270, reproducido en 0.29–0.31): dos módulos en el mismo directorio **colapsan sus flags en un solo slot de ledger**. Inlinear el flag, son 4 líneas |
| **Migrar los `.mjs` a Vitest** | 4 h, cero puntos de rubric. Ya corren contra el contrato compilado real, que es el mecanismo que pide §3.3 |
| **Wallet en el browser** | 10–21 h contra un budget de 6–8. `dapp-connector-api` v4 cambió la API (`connect(networkId)`, no `enable()`), la doble instanciación de WASM es **bug upstream abierto** sin fix canónico (midnight-js#1052), `levelPrivateStateProvider` no funciona en browser, y habría que shippear 18 MB de claves |

⚠️ **Trampa de tipos:** la polaridad de `Either` está **invertida** entre familias —
shielded usa `Either<ZswapCoinPublicKey, ContractAddress>` (contrato = `right`),
unshielded usa `Either<ContractAddress, UserAddress>` (contrato = `left`). Bug
abierto LFDT-Minokawa#477: *"both versions type-check — for a value transfer
that's a silent mis-send."*

---

## 9. UI (Bloque C): la opción recomendada

**Read-only + shim de Node, NO wallet en el browser.** El indexer tiene CORS `*`,
así que el browser lee estado de la cadena con `fetch` plano y cero SDK.

`conectarSimulador()` corre **el contrato real completo** (asserts, witnesses,
Merkle) en **4,1 s sin red**. Un servidor `node:http` de ~60 líneas delante de
`ApiTestigo` le da a la UI los 5 métodos de escritura y `leerEstadoLedger()` por
JSON plano — sin WASM en el browser, sin wallet, y **sigue funcionando si el
deploy falla** (se cambia el ejecutor, la API de arriba es idéntica por diseño).

Construir exactamente dos cosas, que es donde vive el 15 %:
- **Panel split "qué ve la cadena / qué nunca sale de tu máquina"**
- **Verificación dual FISCAL ✅ / EMPLEADOR ❌** — `app/src/api/verificar.ts` ya lo
  implementa 100 % off-chain. **El clímax del video ya está escrito en TypeScript.**

Detalle que un juez nota: `TxResult.simulado?: boolean` ya existe *"para que el
CLI y la UI no muestren un txId falso como si fuera verificable en un explorer"*.
Exponerlo en la UI y mencionarlo en el README — es exactamente la honestidad que
nos separa de depapp.

**Costo 5–7 h. Veredicto: MAÑANA TEMPRANO, después del deploy.**

---

## 10. Orden recomendado

```
AHORA        faucet (humano) · topic midnightntwrk (Gabriel) · §2 ítems 1-6 (~1,25 h)
     ↓
HASTA 21:00  B4 (CLI) → B5 (deploy a Preview)  ← el 40 %, todo lo demás depende de esto
     ↓
SI CIERRA    §3 access control (3 h)  →  §4 designated verifier ECDH (5-6 h)
ANTES 21:00
     ↓
MAÑANA       UI opción B (5-7 h) · README + evidencia del deploy · deck con §6
10:30        FEATURE FREEZE — grabar video sobre el estado congelado
```

**Prioridad si hay que sacrificar:** gate de compilación > deploy real > evidencia
verificable en el README > UI > todo lo demás.

La ingeniería ya es fuerte: ~210 asserts contra el contrato compilado real,
limitaciones documentadas honestamente, domain separation, y una lista de
hallazgos adversariales reproducidos y arreglados. **Lo que falta no es calidad
de ingeniería, es evidencia que un juez pueda ver en 90 segundos.**
