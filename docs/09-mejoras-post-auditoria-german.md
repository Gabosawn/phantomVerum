# 09 — Mejoras post-auditoría (para German)

> Plan de fix para los 3 hallazgos **Altos** que quedaron abiertos en la 2ª
> auditoría (`docs/08-auditoria-resultado.md`). El Crítico (C-1) ya está
> documentado como limitación y no se toca. Diseñado para resolverlos con la
> primitiva más simple y verificable, no la más elegante — el tiempo de
> hackathon manda.

## Contexto

La 2ª auditoría encontró tres hallazgos Altos con fix propuesto pero sin
implementar:

- **H-1**: la raíz de Merkle que se publica en cada `report` es una huella del
  estado del árbol. El emisor, que ve cada `issueCredential`, puede mapear
  raíz→cantidad de hojas de SU organización y colapsar el anonimato al
  empleado más nuevo si la org tiene pocos empleados.
- **H-2**: `registerOrganization` es first-come, sin control de acceso,
  irreversible (contrato inmutable). Un atacante puede registrar el `orgId`
  de una empresa real con su propia ancla y negárselo para siempre.
- **H-3**: `issueCredential` no tiene guard de idempotencia — la misma
  `(orgId, credCommitment)` consume una hoja nueva del árbol cada vez que se
  llama. Con registro de org libre, cualquiera puede llenar las 65.536 hojas
  y bloquear la emisión legítima para siempre.

Verificado contra el código real (no de memoria) el estado exacto de los 3
circuitos, y contra las skills `compact-standard-library` / `compact-ledger`
qué primitivas existen de verdad: `Set`, `Map`, `Counter`, `kernel.self()` sí
existen. **`firstFree()`, que sugiere el propio documento de auditoría para
H-1, NO aparece en ningún inventario de la stdlib** — no usarlo, es
probablemente una sugerencia no verificada del audit anterior. Los 3 fixes de
abajo usan solo primitivas confirmadas. Para H-1 se prioriza `Map<K, Uint<64>>`
sobre `Map<K, Counter>` porque `Counter` no tiene ni un solo uso existente en
este contrato (mayor riesgo de sintaxis no verificada), mientras que `Map` con
`lookup`/`insert`/`member` ya se usa 3 veces en el mismo archivo — mismo
resultado, menos riesgo.

## Diseño de los 3 fixes

### H-3 — guard de idempotencia (el más simple, hacer primero)

Nuevo ledger `Set<Bytes<32>>` que registra qué hojas
(`leafOf(orgId, credCommitment)`) ya se insertaron, con el mismo idiom
`assert(!X.member(...)); X.insert(...)` que ya usan `report` (línea 273-274)
y `revealAuthorship` (línea 305) del propio archivo — no se inventa un patrón
nuevo.

`contracts/src/testigo.compact`:
- Agregar cerca de `credentials` (línea 59):
  `export ledger issuedLeaves: Set<Bytes<32>>;`
- En `issueCredential` (líneas 227-232), insertar el guard entre el chequeo
  de issuer y el insert en el árbol:
  ```
  const leaf = leafOf(orgId, credCommitment);
  assert(!issuedLeaves.member(disclose(leaf)), "credential already issued");
  issuedLeaves.insert(disclose(leaf));
  credentials.insert(disclose(leaf));
  ```

No cambia ninguna firma pública, no toca `shared/src/crypto.ts` (no es un pure
circuit nuevo), no rompe ningún digest existente.

### H-1 — piso de anonimato por organización

Contador de emisiones por org, usando `Map<Bytes<32>, Uint<64>>` (no
`Counter`, por lo dicho arriba). Umbral `K` como constante nombrada (propongo
`K = 5`, ajustable).

`contracts/src/testigo.compact`:
- Nuevo ledger: `export ledger credentialsIssuedByOrg: Map<Bytes<32>, Uint<64>>;`
- Constante: `const ANONYMITY_FLOOR: Uint<64> = 5;` (o inline el literal `5`
  con comentario — confirmar sintaxis exacta de constantes top-level
  compilando, no asumir).
- En `issueCredential`, después de insertar la hoja:
  ```
  const prevCount = credentialsIssuedByOrg.member(disclose(orgId))
    ? credentialsIssuedByOrg.lookup(disclose(orgId))
    : 0;
  credentialsIssuedByOrg.insert(disclose(orgId), (prevCount + 1) as Uint<64>);
  ```
- En `report`, junto al chequeo C1 de membership (línea ~259), agregar:
  ```
  const issuedForOrg = credentialsIssuedByOrg.member(disclose(orgId))
    ? credentialsIssuedByOrg.lookup(disclose(orgId))
    : 0;
  assert(issuedForOrg >= ANONYMITY_FLOOR, "organization has not issued enough credentials yet for anonymity");
  ```

Esto no elimina la huella de la raíz (eso requeriría rediseño del árbol), pero
establece un piso duro: ningún `report` puede referenciar una organización
con menos de `K` credenciales emitidas — exactamente la mitigación que pide
el propio audit ("piso de k-anonimato"), con una primitiva que sí existe.

**Nota de riesgo a verificar en implementación:** el operador ternario
`cond ? a : b` con ramas de tipo `Uint<64>` vs literal `0` debería tipar bien
por subtyping, pero hay que confirmarlo compilando — no asumir.

### H-2 — orgId derivado del issuerSecret (el más invasivo — dejar para el final)

Hoy `registerOrganization(orgId: Bytes<32>, anchor: Bytes<32>)` acepta
`orgId` como argumento público libre — cualquiera elige cualquier string. El
fix real: que `orgId` sea una función determinística del secreto del emisor,
así ocupar "tu" orgId sin conocer tu secreto es imposible.

`contracts/src/testigo.compact`:
- Nuevo pure circuit (mismo estilo que `anchorOf` en línea 148, dominio
  propio):
  ```
  export pure circuit orgIdOf(issuerSec: Bytes<32>): Bytes<32> {
    return persistentHash<Vector<2, Bytes<32>>>([domOrgId(), issuerSec]);
  }
  ```
  (revisar cómo están declarados los demás `domXxx()` helpers — ~línea 82-118
  — y seguir exactamente ese patrón de tag)
- Cambiar la firma: `export circuit registerOrganization(anchor: Bytes<32>): []`
  — ya no recibe `orgId`, lo deriva:
  ```
  export circuit registerOrganization(anchor: Bytes<32>): [] {
    const orgId = orgIdOf(issuerSecret());
    assert(!organizations.member(disclose(orgId)), "organization already registered");
    organizations.insert(disclose(orgId), disclose(anchor));
  }
  ```

**Cascada de cambios que esto obliga (por qué va último):**
- `shared/src/crypto.ts` (el espejo TS de los pure circuits, hoy "seis pure
  circuits") pasa a siete — agregar `orgIdOf` ahí y en
  `tests/src/harness/crypto.ts` (que solo re-exporta), y actualizar el
  comentario "six" → "seven" en ambos.
- `app/src/scripts/register-org.ts` cambia de flujo: hoy recibe `orgId` (o lo
  genera random) + `issuerSecret`; después del fix, solo recibe/genera
  `issuerSecret`, calcula `orgId` off-chain con el mismo `orgIdOf` (vía
  `shared/crypto`) para poder imprimírselo al usuario, y lo pasa al circuito
  ya derivado.
- `tests/src/harness/model.ts` (el backend TS que corre en paralelo al
  contrato compilado, para el test diferencial) necesita el mismo cambio de
  semántica en su implementación de `registerOrganization`, si no los dos
  backends divergen y `contract-agreement.test.ts` empieza a fallar.
- `contracts/test/sec-audit.mjs` bloque de front-running (línea ~71-72, el
  que hoy documenta "a phantom org registers for free (declared MVP
  limitation)") pasa de documentar el gap a un `checkRejects` probando que ya
  no se puede.
- `contracts/README.md` — la limitación ya declarada ("Mock registration:
  registerOrganization has no access control...") se actualiza o se borra
  según si el fix entra completo.
- `docs/00-idea.md` / `docs/01-arquitectura.md` si describen la firma de
  `registerOrganization`.

Si no alcanza el tiempo para toda esta cascada, la recomendación explícita
del propio audit es dejarlo declarado — no forzar un fix a medias que rompa
la firma sin actualizar todos los consumidores.

## Orden de ejecución

1. **H-3** — cambio de un archivo, sin cascada, ~10 min incluyendo test.
2. **H-1** — cambio de un archivo (contrato), riesgo bajo-medio, ~20-30 min
   incluyendo test.
3. Recompilar una sola vez después de H-3+H-1 juntos (ambos tocan
   `issueCredential`/`report`, un solo recompile cubre los dos):
   `npm run compile --workspace=contracts`, correr `npm test`,
   `npm run simulate`, `node contracts/test/sec-audit.mjs`.
4. **Punto de decisión:** si queda tiempo → H-2 completo con toda su cascada.
   Si no → declarar H-2 en `contracts/README.md` (la entrada "Mock
   registration" ya existe, solo hay que confirmar que sigue describiendo la
   realidad) y dejar constancia acá de que H-1/H-3 se arreglaron y H-2 quedó
   declarado a propósito.
5. Actualizar `contracts/README.md` §"Declared limitations" reflejando el
   nuevo estado (el bullet del "Merkle root revealed" pasa de limitación pura
   a "mitigada con piso de k-anonimato"; si H-3 se arregla, ya no hace falta
   mencionar el brick permanente como abierto).
6. Nuevos bloques de test en `contracts/test/sec-audit.mjs` siguiendo el
   patrón `checkRejects`/`check` ya usado (ver bloque C2 como ejemplo): uno
   para H-3 (doble `issueCredential` con mismo `credCommitment` rechazado),
   uno para H-1 (report antes de alcanzar `ANONYMITY_FLOOR` rechazado, y
   aceptado después de alcanzarlo).
7. **No redeployar todavía** — recompilar cambia el bytecode y las verifier
   keys; el contrato ya desplegado en Preview (`aeb44bb5...`) queda obsoleto
   respecto al código fuente hasta que se corra
   `NETWORK=preview npm run deploy --workspace=app` de nuevo. Confirmar antes
   de redeployar si el video ya se grabó contra el contrato viejo.

## Verificación end-to-end

```bash
compact compile contracts/src/testigo.compact <dir>   # 5 circuitos, sin errores
compact compile contracts/src/fallback/testigo-b.compact <dir>  # el fallback no tiene credentials/H-1; si H-2 entra, confirmar si aplica igual ahí
npm run compile --workspace=contracts                  # regenera las 5 prover+verifier keys
npm test                                                # 375+ casos, ambos backends (model + contract) deben seguir de acuerdo
npm run simulate                                        # los 4 actos
node contracts/test/sec-audit.mjs                       # los nuevos bloques H-1/H-3 (y H-2 si entra) en verde
```

Si H-2 entra: además correr `contract-agreement.test.ts` con atención — es el
que verifica que `model` y `contract` backends coinciden dígito a dígito;
cualquier divergencia ahí significa que `tests/src/harness/model.ts` no se
actualizó en paralelo.
