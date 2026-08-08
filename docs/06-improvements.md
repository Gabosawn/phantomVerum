# 06 — Pendientes asignados a German

> **Para German.** Este documento está escrito para que puedas arrancar sin haber
> seguido la conversación previa. Todo lo que necesitás saber está acá: qué ya se
> hizo, qué falta, por qué importa y cómo saber que terminaste.
>
> Origen: una auditoría externa del viernes 7/8 (~20:30) que revisó los docs
> oficiales de Midnight, npm, Docker Hub, los ocho repos rivales publicados hoy bajo
> el topic `midnightntwrk`, y el código de este repo. Produjo ~12 hallazgos. La
> mayoría ya fueron resueltos por Santiago y Gabriel (ver abajo). Lo que queda es
> tuyo.
>
> Última actualización: vie 7/8 ~21:45.

---

## Estado actual — NO rehagas nada de esto

Ya está hecho y verificado. Si tocás estos archivos, vas a pisar trabajo de otro.

| Qué | Quién | Commit | Evidencia |
|---|---|---|---|
| Parche del bug `offset: null` del indexer | Santiago | `5c86993` | `app/src/config/providers.ts`, +36 líneas |
| Corrección del texto sobre `orgId` | Santiago | `5c86993` | `README.md`, `docs/00-idea.md` |
| Test de privacidad del transcript | Santiago | `5c86993` | `contracts/test/transcript-privacy.mjs`, 183 líneas — **13/13 verde** |
| Dependencia `midnight-js-protocol` faltante | Gabriel | `005d8c1` | `app/package.json` |
| Docs de entorno desactualizados | Gabriel | `005d8c1` | `AGENTS.md`, `docs/02-entorno.md` |

Para confirmarlo vos mismo: `npm test --workspace=contracts` tiene que terminar en
`transcript-privacy: 13/13 OK`.

---

## Tus tareas

### T1 · P1 · Declarar la limitación del conjunto de anonimato

**Archivo:** `contracts/README.md`, sección "Declared limitations" (~línea 138-152).

**Qué hay que agregar** (una limitación más a la lista que ya existe):

El anonimato de un denunciante **no** está protegido por el tamaño del árbol de
Merkle. Está limitado por **cuántas credenciales emitió esa empresa en particular**,
y ese número lo puede contar cualquiera mirando la blockchain.

**Por qué pasa esto.** Dos funciones del contrato reciben el `orgId` (el
identificador de la empresa) a la vista de todos:

- `issueCredential(orgId, credCommitment)` — `contracts/src/testigo.compact:167`
- `report(orgId, period)` — `contracts/src/testigo.compact:175`

Como el `orgId` viaja en claro, cualquier observador puede contar cuántas veces se
emitió una credencial para cada empresa.

**Por qué importa de verdad.** Si una empresa tiene 3 empleados registrados, el
denunciante queda prácticamente identificado — *aunque la prueba criptográfica sea
perfecta*. Y ese no es un caso raro: la PyME donde denunciar te expone es
exactamente el caso de uso más común y más delicado del producto.

**Por qué lo declaramos en vez de esconderlo.** Un juez que lo descubre solo, después
de leer "anonymous whistleblowing", se lleva una impresión mucho peor que uno que lo
lee en nuestra propia sección de limitaciones. El plan del proyecto ya dice que la
honestidad preventiva desarma al juez técnico. Esta es esa carta.

**Texto sugerido** (adaptalo al estilo de las otras, que están en inglés):

> - **The anonymity set is bounded per organization, and publicly countable.**
>   `orgId` is a public argument of both `issueCredential` and `report`, so anyone
>   can count how many credentials each organization issued. A reporter's anonymity
>   set is that number — not the 256 leaves of the global tree. An organization with
>   very few registered employees leaves its reporter effectively identified, even
>   though the Merkle proof is cryptographically sound. Roadmap: require a minimum
>   number of issued credentials before `report` is allowed against an organization.

**Ojo, no confundir con la que ya está.** La línea 148 ya declara algo sobre la raíz
de Merkle y el anonimato — es **otra cosa** (habla de cachear el path). La tuya es
una limitación estructural distinta. Agregala aparte, no la mezcles.

**✓ Terminaste cuando:** la limitación está escrita en la lista, redactada como un
límite del conjunto de anonimato (no como un "puede haber riesgos de privacidad"
genérico).

---

### T2 · P1 · Crear la carpeta del deck y las dos slides que faltan

**Problema:** no existe la carpeta `deck/` en el repo. El `README.md` la menciona
pero está vacía en el árbol. Las dos frases de abajo no tienen dónde vivir.

**Paso 1 — creá `deck/`** con el formato que prefieras (Markdown, PDF exportado,
link a Slides — lo que uses para presentar). Lo importante es que quede en el repo,
porque el deck es entregable obligatorio del hackathon.

**Paso 2 — Slide de "cómo funciona": agregá la propiedad de tiempo.**

El contrato ya tiene algo que no estamos contando. En
`contracts/src/testigo.compact:189-190`:

```
assert(blockTimeGte(disclose(windowStart as Uint<64>)), "period not started yet");
assert(blockTimeLt(disclose(windowEnd as Uint<64>)), "period already over");
```

En castellano: **una denuncia solo vale dentro de su ventana de tiempo, y eso lo
verifica el propio circuito — sin depender de ningún reloj externo ni de que alguien
diga la verdad sobre la fecha.**

Vale la pena decirlo porque uno de los rivales de hoy (**asfalia**, "proof of
solvency that expires") vende exactamente esa propiedad como su momento estrella del
demo. Nosotros ya la tenemos y no la mencionamos en ningún lado. Es una frase, cero
código.

**Paso 3 — Slide de prior art: nombrá bien a la competencia.**

Hoy se publicaron ocho proyectos bajo el topic `midnightntwrk`. El más parecido al
nuestro es **velo** (atestación ZK de veredictos forenses, la evidencia se sella en
la máquina del perito).

Nombralo con precisión: **velo prueba que un veredicto es legítimo; no hace autoría
diferida.** Esa distinción es la que sostiene nuestro diferenciador — **nadie en el
campo tiene autoría diferida**. Describir bien a un rival es lo que hace creíble el
"nadie más lo tiene".

Dato interno, no para la slide: **midnight-mail ya deployó en Preprod** con
dirección de contrato y números de bloque reales. Ese es el eje de Engineering y es
el único lugar donde vamos atrás.

**Molde de frase que podés reusar** (tomado de velo), aplicable al nullifier y a la
separación de dominios:

> No es una convención de code review. Es una restricción del circuito: una denuncia
> que la viola no puede producirse.

**✓ Terminaste cuando:** existe `deck/` en el repo, con la propiedad de tiempo
mencionada y la tabla de prior art nombrando a velo correctamente.

---

### T3 · P2 · Limpieza: dos cosas que van a confundir a alguien

**3a — Borrar un archivo roto que quedó dando vueltas.**

```bash
rm contracts/test/transcript-org-anonimato.mjs
```

Es un borrador viejo, sin trackear en git, escrito contra la versión en español del
código (antes de la traducción al inglés). Si alguien intenta correrlo, revienta con
`SyntaxError: does not provide an export named 'EPOCA'`. **El test bueno es
`contracts/test/transcript-privacy.mjs`**, el que hizo Santiago, que ya está
enganchado a `npm test` y pasa 13/13. El viejo no sirve para nada y solo genera la
duda de "¿cuál de los dos es?".

**3b — Hay tres versiones de este mismo documento en la historia.**

| Commit | Qué es |
|---|---|
| `50a028e` | Primera versión, prioridades originales |
| `622ee06` | Recalibración (en la rama `docs/improvements-backlog`, nunca llegó a `dev`) |
| `5c86993` | Copia de la primera versión que trajo Santiago a `dev` |

Santiago trabajó sobre la primera versión mientras la recalibración vivía en otra
rama sin mergear — por eso hizo tareas que ya habían bajado de prioridad. (Salió
bien igual, pero fue casualidad.) Este archivo que estás leyendo reemplaza a las
tres. Si ves la rama `docs/improvements-backlog` dando vueltas, se puede borrar.

**✓ Terminaste cuando:** el archivo huérfano no existe y no hay dos documentos
compitiendo por ser la lista de pendientes.

---

## Lo que NO es tuyo

**El deploy del contrato (B5) es de Gabriel** — figura como lead técnico de
toolchain, proof server y deploy en `docs/contexto-hackathon.md`.

Te lo aviso igual porque es lo más importante que le falta al proyecto y explica la
prioridad de todo lo demás: `app/src/config/deployment.json` sigue con todos los
campos en `null`, es decir **el contrato compila pero no está vivo en ninguna red**.
Engineering + QA es el 55% del puntaje, y el análisis de ediciones anteriores del
hackathon concluyó que un deploy real fue la diferencia entre el ganador de $3.500 y
el de $500.

Ninguna de tus tres tareas mueve esa aguja. Son todas de 15 minutos o menos —
hacelas y no te quedes trabado en ellas si podés ayudar con el deploy.

---

## 🔴 Para Gabriel — cuatro cosas verificadas el sáb 8/8 ~21:30

Ninguna está cubierta por las tareas de arriba. Las dos primeras son de él por rol;
las dos últimas las detectó una verificación posterior al brief.

### GA1 · P0 · El topic `midnightntwrk` sigue sin poner — **solo Gabriel puede**

`gh repo view Gabosawn/phantomVerum --json repositoryTopics` devuelve vacío.
Intentado con permisos de colaborador → **HTTP 404: requiere admin del repo.**

```bash
gh repo edit Gabosawn/phantomVerum --add-topic midnightntwrk --add-topic compact
```

**Es causal de descalificación listada explícitamente en las reglas del evento.**
Un minuto de trabajo. Es lo más barato y lo más caro de olvidar.

### GA2 · P0 · `main` está ~15 commits atrás de `dev`

**Un juez clona `main`, no `dev`.** Hoy ese clone tiene el contrato compilando,
pero **no** los Bloques C y D, ni el workspace `shared/`, ni los 8 scripts CLI,
ni `deploy.ts`. Es decir: ve un contrato suelto, no un proyecto.

Verificado: `git rev-list --count origin/main..origin/dev` → 15.

Merge `dev` → `main` apenas el E2E local esté verde. Si el deploy se demora,
mergear igual antes de la entrega: es preferible un `main` completo sin deploy
que un `main` que parece un contrato huérfano.

### GA3 · P1 · El README declara una limitación que YA NO EXISTE (under-claiming)

`contracts/README.md:142` sigue diciendo:

> *"The authorship key export hands the `secret` to the prosecutor … Whoever
> holds it can republish the authorship to another key and burn the real
> author's `(report, prosecutor)` slot."*

**Eso está arreglado.** El commit `81baeed` ("ZK proof export — secret nunca sale
de la maquina") agregó el circuito `proveAuthorship`
(`contracts/src/testigo.compact:248`) y migró `ExportLlaveAutoria` a v2, donde el
campo `secret` fue reemplazado por `proof`.

**Estamos declarando una debilidad que ya no tenemos.** Un juez que lee el README
ve un agujero inexistente y baja la nota por algo que resolvimos.

Hay que reescribir esa limitación como **propiedad conseguida**. Y es material
fuerte para el deck: convierte el clímax del video (FISCAL ✅ / EMPLEADOR ❌) de
"suposición de confianza declarada" a **propiedad criptográfica** — el fiscal
verifica sin recibir jamás el secreto.

⚠️ Además hay que revisar `contracts/test/sec-audit.mjs` §D, que hoy documenta ese
ataque como *comportamiento conocido* y debería assertear que **ya no funciona**.

### GA4 · P2 · Prior art sin los competidores de hoy

No hay ninguna mención a `velo`, `midnight-mail` ni `asfalia` fuera de este doc.
Ocho equipos publicaron hoy bajo el topic `midnightntwrk`:

- **velo** es el más cercano — atestación ZK de veredictos forenses. Nombrarlo con
  precisión: *velo prueba que un veredicto es legítimo; no hace autoría diferida.*
  Citar bien a un competidor es lo que vuelve creíble el claim propio.
- **asfalia** vende como titular *"prueba de solvencia que expira"* — que es
  exactamente la propiedad `blockTime` que nosotros ya tenemos y ahora sí
  reclamamos (`README.md:232`).
- **`midnight-mail` ya deployó a Preprod** con dirección de contrato y números de
  bloque reales. **Es el único eje donde estamos atrás, y es el que pesa 40 %.**

---

## Contexto por si nunca tocaste esta parte del repo

- **Dónde está el contrato:** `contracts/src/testigo.compact`. Los cuatro circuitos
  son `registerOrganization`, `issueCredential`, `report`, `revealAuthorship`.
- **Cómo correr los tests del contrato:** `npm test --workspace=contracts`
- **Tu área habitual (frontend):** `ui/cliente`, `ui/explorer`, `ui/sistema`
- **Convención de commits:** Conventional Commits — `docs: ...`, `fix: ...`,
  `feat(t2): ...`. Regla del equipo: `main` siempre compila.
- **El equipo:** Gabriel (lead técnico, deploy) · Juan (contratos Compact) · German
  (frontend, sos vos) · Santiago (QA, deck, video, submit)

---

## Anexo — hallazgos descartados, no los reinvestigues

Cada uno se verificó y se descartó con evidencia. Están acá para que nadie los
vuelva a levantar.

| Hallazgo | Veredicto |
|---|---|
| "Los docs prometen que la empresa queda oculta" | **Falso.** `docs/00-idea.md:40` dice "Identity, credential, and evidence never touch the chain" — cierto, y nunca menciona la empresa. La sección de limitaciones ya declara el límite on-chain vs off-chain. |
| "Falta esperar el DUST antes de deployar" | **Falso.** `deployContract({ waitForFunds: true })` ya bloquea hasta estar fondeada, en `app/src/api/executor-network.ts:152-164`. |
| `docs.midnight.network/compact/merkle-membership-privacy` | **Da 404.** La página no existe. No la cites. |
| Paquetes viejos `wallet` / `wallet-api` / `zswap` | Ausentes en los seis `package.json`. Limpio — solo no dejes que un tutorial viejo convenza a nadie de agregarlos junto a `ledger-v8`. |
| "B1–B5 sin arrancar" (`docs/04-bloque-b-pasos.md`) | Desactualizado. B1–B4 están hechos (8 scripts en `app/src/scripts/`). Falta solo B5, el deploy. |
