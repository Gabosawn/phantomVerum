# `contracts/` - Testigo en Compact

Contrato Compact del proyecto **Testigo**: denuncias anonimas con autoria
diferida. La semantica esta definida en
[`../docs/01-arquitectura.md`](../docs/01-arquitectura.md) secciones 3 a 5.

| | |
|---|---|
| Contrato de produccion | `src/testigo.compact` (Opcion A - Merkle) |
| Fallback congelado | `src/fallback/testigo-b.compact` (Opcion B) |
| Compiler / language | `0.31.1` / `0.23.0` |

## Compilar

```bash
npm run compile --workspace=contracts
npm run compile:fast --workspace=contracts
npm run check:fallback --workspace=contracts
```

El contrato principal usa un `HistoricMerkleTree` global de profundidad 8.
Cada hoja es `H("testigo:cred:v1" || orgId || credSecret)`, por lo que la
prueba de membership queda ligada a una organizacion sin revelar la credencial.
El arbol historico mantiene validos los paths despues de nuevas emisiones.

Los circuitos exportados son `registrarOrganizacion`, `emitirCredencial`,
`denunciar` y `revelarAutoria`. Los pure circuits `hojaDe`, `denunciaIdDe`,
`nullifierDe` y `autoriaDe` permiten recomputar valores localmente sin proof
server.

La opcion B es una red de seguridad no compilada por defecto. Reemplaza
membership Merkle por `H(orgSecret) == ancla`, con las limitaciones declaradas
en `docs/01-arquitectura.md`.

El emisor es mock, no hay revocacion y el circuito no prueba la veracidad de la
denuncia. La credencial, el secret y la evidencia son witnesses y no se
publican en el ledger.
