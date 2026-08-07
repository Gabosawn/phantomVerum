# `contracts/` — Testigo in Compact

Compact contract of the **Testigo** project: anonymous whistleblowing with
**deferred authorship**. Semantic spec in
[`../docs/01-arquitectura.md`](../docs/01-arquitectura.md) §3–§5; technical
decisions validated against the compiler in
[`../docs/03-plan-ejecucion.md`](../docs/03-plan-ejecucion.md) §2.

| | |
|---|---|
| Production contract | `src/testigo.compact` (Option A — Merkle) |
| Frozen fallback | `src/fallback/testigo-b.compact` (Option B — never deployed) |
| Compiler / language / runtime | `0.31.1` / `0.23.0` / `0.16.0` |

## Compile and test

```bash
npm run compile   --workspace=contracts    # WITH PLONK keys -> output/ (~30 s)
npm run compile:fast --workspace=contracts # --skip-zk, for iterating   (~0.6 s)
npm run check:fallback --workspace=contracts # verifies Option B is still alive
npm test --workspace=contracts             # 47 checks against the compiled contract
```

The tests run the **real compiled contract** in the local simulator of
`@midnight-ntwrk/compact-runtime` — no network, no proof server, no mocks.
They require a prior `compile`.

| File | What it proves |
|---|---|
| `test/smoke.mjs` | the pure circuits: 32 bytes, determinism, domain separation |
| `test/merkle-roundtrip.mjs` | the 4 acts of the demo, end to end |
| `test/security-claims.mjs` | the load-bearing properties of the design |
| `test/sec-audit.mjs` | regression of attacks that once worked |

`output/` is gitignored: only the `.compact` gets committed. A full `compile`
produces `output/contract/{index.js,index.d.ts}` (ESM),
`output/keys/*.{prover,verifier}` (8 files = 4 provable circuits × 2),
`output/zkir/*.{zkir,bzkir}` and `output/compiler/contract-info.json`.

## Ledger state (all public)

| Field | Type | What it holds |
|---|---|---|
| `organizations` | `Map<Bytes<32>, Bytes<32>>` | `orgId → anchor` of the issuer |
| `credentials` | `HistoricMerkleTree<8, Bytes<32>>` | leaves of issued credentials (256 max) |
| `reports` | `Set<Bytes<32>>` | sealed `reportId`s |
| `nullifiers` | `Set<Bytes<32>>` | per-period anti-spam |
| `authorships` | `Set<Bytes<32>>` | authorships revealed to a prosecutor |

Credential, secret and evidence are **witnesses**: they never leave the
whistleblower's machine (the proof server runs locally).

## Circuits

| Circuit | Kind | Role |
|---|---|---|
| `registerOrganization(orgId, anchor)` | tx | spec §4.1 |
| `issueCredential(orgId, credCommitment)` | tx | Option A helper — mock issuer |
| `report(orgId, period: Uint<64>)` | tx | spec §4.2 — the heart |
| `revealAuthorship(reportId, prosecutorPk)` | tx | spec §4.3 — the differentiator |
| `credCommitmentOf`, `leafOf`, `reportIdOf`, `nullifierOf`, `authorshipOf` | `pure` | recomputable off-chain, no proof server |

The `pure circuit`s appear in the generated TS under `pureCircuits`, so
`verify-authorship` is **100 % off-chain**.

## Why the tree is global and the `orgId` lives inside the leaf

```
credCommitment = persistentHash(["phantomtrace:credcomm:v1", credSecret])
leaf           = persistentHash(["phantomtrace:cred:v1", orgId, credCommitment])
```

The leaf is built **in-circuit** from the public `orgId` **at both ends**:

- when **issuing**, with the same `orgId` that was just validated against
  `organizations` — if the leaf arrived precomputed, that assert would be
  decorative and the credential of a phantom organization could be smuggled
  in;
- when **reporting**, with the `orgId` being declared — the witness only
  provides the path siblings, so it cannot lie about which organization it
  belongs to.

Proving membership in the global tree proves membership *in that org* — the
spec's multi-org semantics hold without a per-org root.

The issuer receives the **commitment**, never the employee's
`credentialSecret`.

## Epochs: the period is not chosen by the caller

`period` is an **epoch index** (`Uint<64>`), not a free label. The circuit
binds it to the chain's clock:

```
start = period * 86400              // epochDuration(), in seconds
assert(blockTimeGte(start))         // "period not started yet"
assert(blockTimeLt(start + 86400))  // "period already over"
```

so only **one** epoch is valid at any moment: the current one. Without this
restriction the nullifier would be useless — the same credential would
produce N distinct nullifiers by varying the label, and the anti-spam of spec
§4.2/§6 would be worth nothing. Midnight's `blockTime` is
`secondsSinceEpoch`, which is why the duration is in seconds. 1-day epochs:
deliberately coarse, because fine-grained periods allow timing correlation
(spec §6).

Practical advantage: the generated TS ledger exposes
`credentials.findPathForLeaf(leaf)`, so the path witness is ~5 lines
off-chain instead of reimplementing a Merkle tree in TypeScript.

`HistoricMerkleTree` (not `MerkleTree`) is mandatory: with the historic
variant, an issued path remains valid after new insertions — issuing a
credential does not invalidate reports in preparation.

## Domain separation

`nullifier` and `authorship` share a shape and carry a secret in the same
position. Without a domain tag, an attacker who registers an org with
`orgId = reportId` forces a cross collision. All five hashes carry their tag
in position 0 (`phantomtrace:credcomm:v1`, `phantomtrace:cred:v1`,
`phantomtrace:report:v1`, `phantomtrace:nullifier:v1`,
`phantomtrace:authorship:v1`).

## `disclose()`

Every `disclose()` in the file is **required by the compiler**, none is
speculative: this was verified by compiling without them on the purely public
arguments (`orgId`, `anchor`, `leaf`, `reportId`) and the compiler rejects it
— it treats the parameters of an `export circuit` as potentially derived from
witnesses. The `assert`s over pure comparisons between witness values (the C1
of `revealAuthorship`) go without `disclose()`.

## Declared limitations

- **Mock issuer:** `registerOrganization` and `issueCredential` have no
  access control. Anyone can register an org or add a leaf. That is the MVP
  scope; the real issuer (a signing corporate directory) is roadmap.
- **The truth of the reported content is not proven** (spec §6).
- **No credential revocation** (spec §7).
- **Depth 8** = 256 credentials per deploy, enough for the demo.
- **The authorship key export hands the `secret` to the prosecutor**
  (`03-plan-ejecucion.md` §3.2). Whoever holds it can republish the
  authorship to another key and burn the real author's
  `(report, prosecutor)` slot. Current mitigation: it is handed to a single
  prosecutor, out of band. Roadmap: a ZK proof to the prosecutor instead of
  the secret. Covered by `test/sec-audit.mjs` §D.
- **The Merkle root revealed** by `checkRoot` narrows the anonymity set if
  the path is cached. `app/src/witnesses` must recompute the path with
  `findPathForLeaf` over the latest state before every report, so all
  whistleblowers of the moment reveal the same root.
