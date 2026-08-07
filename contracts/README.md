# `contracts/` — Testigo en Compact

Contrato Compact del proyecto **Testigo**: denuncias anónimas con **autoría
diferida**. Spec semántica en [`../docs/01-arquitectura.md`](../docs/01-arquitectura.md)
§3–§5; decisiones técnicas validadas contra el compilador en
[`../docs/03-plan-ejecucion.md`](../docs/03-plan-ejecucion.md) §2.

| | |
|---|---|
| Contrato en producción | `src/testigo.compact` (Opción A — Merkle) |
| Fallback congelado | `src/fallback/testigo-b.compact` (Opción B — no se deploya) |
| Compiler / language / runtime | `0.31.1` / `0.23.0` / `0.16.0` |

## Compilar

```bash
npm run compile   --workspace=contracts   # CON claves PLONK -> output/  (~29 s)
npm run compile:fast --workspace=contracts # --skip-zk, para iterar     (~0,6 s)
npm run check:fallback --workspace=contracts # verifica que la Opción B sigue viva
```

`output/` está gitignoreado: solo se commitea el `.compact`. Un `compile`
completo produce `output/contract/{index.js,index.d.ts}` (ESM),
`output/keys/*.{prover,verifier}` (8 archivos = 4 circuitos con prueba × 2),
`output/zkir/*.{zkir,bzkir}` y `output/compiler/contract-info.json`.

## Estado del ledger (todo público)

| Campo | Tipo | Qué guarda |
|---|---|---|
| `organizaciones` | `Map<Bytes<32>, Bytes<32>>` | `orgId → ancla` del emisor |
| `credenciales` | `HistoricMerkleTree<8, Bytes<32>>` | hojas de credenciales emitidas (256 máx.) |
| `denuncias` | `Set<Bytes<32>>` | `denunciaId` sellados |
| `nullifiers` | `Set<Bytes<32>>` | anti-spam por período |
| `autorias` | `Set<Bytes<32>>` | autorías reveladas a un fiscal |

Credencial, secret y evidencia son **witness**: nunca salen de la máquina del
denunciante (el proof server corre local).

## Circuitos

| Circuito | Tipo | Rol |
|---|---|---|
| `registrarOrganizacion(orgId, ancla)` | tx | spec §4.1 |
| `emitirCredencial(orgId, hoja)` | tx | auxiliar de la Opción A — emisor mock |
| `denunciar(orgId, periodo)` | tx | spec §4.2 — el corazón |
| `revelarAutoria(denunciaId, fiscalPk)` | tx | spec §4.3 — el diferencial |
| `hojaDe`, `denunciaIdDe`, `nullifierDe`, `autoriaDe` | `pure` | recomputables off-chain, sin proof server |

Los cuatro `pure circuit` aparecen en el TS generado bajo `pureCircuits`, así
que `verificarAutoria` es **100 % off-chain**.

## Por qué el árbol es global y el `orgId` va dentro de la hoja

```
hoja = persistentHash(["testigo:cred:v1", orgId, credSecret])
```

La hoja se reconstruye **en circuito** a partir del `orgId` público: el witness
solo aporta los hermanos del path, con lo cual no puede mentir sobre a qué
organización pertenece. Probar membership en el árbol global prueba pertenencia
*a esa org* — la semántica multi-org del spec se conserva sin una raíz por-org.

Ventaja práctica: el ledger TS generado expone
`credenciales.findPathForLeaf(hoja)`, así que el witness del path son ~5 líneas
off-chain en vez de reimplementar un árbol de Merkle en TypeScript.

`HistoricMerkleTree` (no `MerkleTree`) es obligatorio: con el histórico, un
path emitido sigue siendo válido después de nuevas inserciones — emitir una
credencial no invalida las denuncias en preparación.

## Domain separation

`nullifier` y `autoria` comparten shape y llevan un secret en la misma
posición. Sin tag de dominio, un atacante que registra una org con
`orgId = denunciaId` fuerza una colisión cruzada. Los cuatro hashes llevan su
tag en posición 0 (`testigo:cred:v1`, `testigo:denuncia:v1`,
`testigo:nullifier:v1`, `testigo:autoria:v1`).

## `disclose()`

Todo `disclose()` del archivo está **exigido por el compilador**, ninguno es
especulativo: se verificó compilando sin ellos en los argumentos puramente
públicos (`orgId`, `ancla`, `hoja`, `denunciaId`) y el compilador los rechaza —
trata los parámetros de un `export circuit` como potencialmente derivados de
witness. Los `assert` sobre comparaciones puras entre valores witness (la C1 de
`revelarAutoria`) van sin `disclose()`.

## Limitaciones declaradas

- **Emisor mock:** `registrarOrganizacion` y `emitirCredencial` no tienen
  control de acceso. Cualquiera puede registrar una org o agregar una hoja.
  Es el alcance del MVP; el emisor real (directorio corporativo firmante) es
  roadmap.
- **No se prueba la veracidad** del contenido denunciado (spec §6).
- **Sin revocación** de credenciales (spec §7).
- **Profundidad 8** = 256 credenciales por deploy, suficiente para la demo.
