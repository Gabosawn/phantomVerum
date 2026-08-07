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
npm run dev --workspace=ui         # levanta las dos apps + el sistema visual
```

`npm run dev` abre tres servidores:

| URL | Qué es |
|---|---|
| `localhost:3000` | **PhantomVerum Cliente** — corre en tu máquina. Oscuro. Tiene proof server |
| `localhost:3001` | **PhantomVerum Explorer** — el ledger público. Claro. **Sin** proof server |
| `localhost:3002` | Sistema visual (paleta, tipografía, recursos) — referencia para el deck |

Son **dos orígenes distintos a propósito**: el browser les da `localStorage`
separado, así que la separación entre lo privado y lo público no depende de que
nosotros nos portemos bien. Lo único que las conecta es el portapapeles.

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
├── ui/                      # @phantomtrace/ui — React + Vite, DOS apps
│   ├── cliente/             #   app local y privada (:3000)
│   ├── explorer/            #   app pública, sin proof server (:3001)
│   ├── sistema/             #   hoja del sistema visual (:3002)
│   ├── shared/              #   cripto, tipos, servicio, componentes, tokens
│   └── pruebas/             #   los tests que cruzan las dos apps
├── tests/                   # @phantomtrace/tests — Vitest + simulación E2E
│   └── src/
│       ├── circuits/        #   tests por circuito
│       └── simulation/      #   simulación E2E de los 4 tiempos
├── deck/                    # material de presentación
└── docs/                    # idea, arquitectura, entorno
```

### Las dos aplicaciones

El dual-ledger de Midnight no se explica con un cartel: se traduce en **dos
programas separados**, con registro visual opuesto y sin estado compartido.

**PhantomVerum Cliente** — oscuro, corre en tu máquina, tiene proof server y
guarda los witnesses.

| Vista | Qué hace |
|---|---|
| **Emitir credenciales** (T1) | El directorio interno de ACME, que nunca se publica. Al ledger va sólo el ancla |
| **Denunciar** (T2) | Cargás la evidencia — se hashea **acá**, con Web Crypto — elegís org y período, y salen dos hashes |
| **Revelar autoría** (T4) | Cargás tu llave, elegís ante quién, y la prueba queda ligada a esa clave pública |

**PhantomVerum Explorer** — claro, público, **sin proof server**, y lo dice en
el pie: no hay nada privado que procesar.

| Vista | Qué hace |
|---|---|
| **Ledger** | 3 denuncias, 0 atribuibles. La columna «autor» no está censurada: no existe |
| **Verificar sello** (T3) | Arrastrás un documento y se compara contra la cadena. Un byte distinto ⇒ rojo |
| **Verificar autoría** (T4) | Pegás el material y verificás **con tu propia clave**. Cambiala y el veredicto se da vuelta |

Reglas de UI: legible y proyectable (fuente grande, alto contraste), veredictos
en paneles sólidos a todo el ancho. Todo lo que no sale de tu máquina se muestra
con una barra de censura: existiendo, sin mostrarse.

### Qué es real y qué está mockeado

Mientras el Bloque B no esté, la UI corre contra una capa de servicio local. Se
declara de frente porque la diferencia importa:

| Real, verificable | Fabricado |
|---|---|
| El SHA-256 de la evidencia — comprobalo con `sha256sum` contra lo que muestra la pantalla | Los `txId` y las alturas de bloque |
| Las cuatro derivaciones, espejo exacto de `contracts/src/testigo.compact` (mismos tags de dominio, misma aridad) | El «✓ sincronizado» del indexer |
| Los asserts del circuito: credencial ajena, doble denuncia por período y secret que no es del autor fallan de verdad, y antes de emitir nada | Los tiempos de proving |
| Los veredictos ✅/❌: son una recomputación local genuina, no una rama `if` | La existencia de una cadena |

Lo mockeado vive en exactamente dos archivos —`ui/shared/cripto.ts` y
`ui/shared/servicio/ClienteMock.ts`— detrás de la interfaz `TestigoClient`.
Ninguna vista los conoce. `H` acá es SHA-256; en el circuito es
`persistentHash`, así que los valores cambian al integrar.

### Tests

| Circuito | Casos |
|---|---|
| `registrarOrganizacion` | registra ok · re-registro falla |
| `denunciar` | caso feliz · credencial inválida falla · doble denuncia mismo período falla · período distinto pasa · dos orgs no interfieren |
| `revelarAutoria` | autor real pasa · secret ajeno falla · denuncia inexistente falla · mismo autor + otro fiscal ⇒ hash distinto |

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

### Bloque C — UI (`ui/`) ✅

- [x] **Cliente** (`:3000`): emitir credenciales, denunciar con hash local real,
      revelar autoría designada. Terminal del proof server con logs en vivo
- [x] **Explorer** (`:3001`): ledger público, verificar sello, verificar autoría
      con veredictos verde/rojo a pantalla completa
- [x] Separación por origen: dos puertos ⇒ `localStorage` distinto. El puente es
      el portapapeles y nada más
- [x] Capa de servicio con la API congelada de §3.1, lista para enchufar `app/`
- [x] 42 tests, incluyendo uno que verifica que el Explorer **no puede** importar
      nada privado del Cliente

**Pendiente de integración:** conectar `ClienteReal` cuando el Bloque B exista.

### Bloque D — Tests (`tests/`)

- [ ] Suite por circuito (tabla de arriba)
- [ ] Simulación E2E de los 4 tiempos que imprime el estado del ledger en cada paso

**Se puede arrancar sin el Bloque A** testeando contra el comportamiento del
spec. **Entregable:** `npm test` verde + `npm run simulate` con un comando.

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
