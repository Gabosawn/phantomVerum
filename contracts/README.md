# `contracts/` - PhantomTrace in Compact

Compact contract for the **PhantomTrace** project: anonymous reports with delayed
authorship. The semantics are defined in
[`../docs/01-arquitectura.md`](../docs/01-arquitectura.md) sections 3 through 5.

| | |
|---|---|
| Production contract | `src/testigo.compact` (Option A - Merkle) |
| Frozen fallback | `src/fallback/testigo-b.compact` (Option B) |
| Compiler / language | `0.31.1` / `0.23.0` |

## Compile

```bash
npm run compile --workspace=contracts
npm run compile:fast --workspace=contracts
npm run check:fallback --workspace=contracts
```

The main contract uses a global `HistoricMerkleTree` of depth 8.
Each leaf is `H("phantomtrace:cred:v1" || orgId || credSecret)`, so the
membership proof is bound to an organization without revealing the credential.
The historic tree keeps paths valid after new issuances.

The exported circuits are `registerOrganization`, `issueCredential`,
`report`, and `revealAuthorship`. The pure circuits `leafOf`, `reportIdOf`,
`nullifierOf`, and `authorshipOf` allow recomputing values locally without a
proof server.

Option B is a safety net not compiled by default. It replaces
Merkle membership with `H(orgSecret) == anchor`, with the limitations stated
in `docs/01-arquitectura.md`.

The issuer is a mock, there is no revocation, and the circuit does not prove
the veracity of the report. The credential, secret, and evidence are witnesses
and are not published on the ledger.
