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
npm test --workspace=contracts             # 87 checks against the compiled contract
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
| `test/transcript-privacy.mjs` | what the public transcript of a report does and does not expose |

`output/` is gitignored: only the `.compact` gets committed. A full `compile`
produces `output/contract/{index.js,index.d.ts}` (ESM),
`output/keys/*.{prover,verifier}` (10 files = 5 provable circuits × 2),
`output/zkir/*.{zkir,bzkir}` and `output/compiler/contract-info.json`.

⚠️ `output/` being gitignored means a stale build is invisible: it compiles,
the tests pass, and a circuit added since the last `compile` simply is not
there. Run `compile` after pulling anything that touches `src/`.

## Ledger state (all public)

| Field | Type | What it holds |
|---|---|---|
| `organizations` | `Map<Bytes<32>, Bytes<32>>` | `orgId → anchor` of the issuer |
| `credentials` | `HistoricMerkleTree<16, Bytes<32>>` | leaves of issued credentials (65 536 max) |
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
| `revealAuthorship(reportId)` | tx | spec §4.3 — the differentiator; the prosecutor's nonce travels as a **witness**, not an argument |
| `proveAuthorship(reportId, evidenciaHash)` | proof only | spec §4.4 — writes nothing; returns the receipt for off-chain cross-checking |
| `anchorOf`, `credCommitmentOf`, `leafOf`, `reportIdOf`, `nullifierOf`, `receiptOf` | `pure` | recomputable off-chain, no proof server |

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

`nullifierOf` and `receiptOf` share a shape (`H(_, X, Y)` over `Bytes<32>`),
and so do `reportIdOf` and `leafOf`. Without a domain tag, an attacker who
registers an org with `orgId = reportId` forces a cross collision. All six
hashes carry their tag in position 0 (`phantomtrace:credcomm:v1`,
`phantomtrace:cred:v1`, `phantomtrace:report:v1`,
`phantomtrace:nullifier:v1`, `phantomtrace:receipt:v1`,
`phantomtrace:issuer:v1`).

## `disclose()`

Every `disclose()` in the file is **required by the compiler**, none is
speculative: this was verified by compiling without them on the purely public
arguments (`orgId`, `anchor`, `leaf`, `reportId`) and the compiler rejects it
— it treats the parameters of an `export circuit` as potentially derived from
witnesses. The `assert`s over pure comparisons between witness values (the C1
of `revealAuthorship`) go without `disclose()`.

## The authorship export carries no secret

The package the whistleblower hands to a prosecutor used to contain the
report's `secret`. It does not anymore, and that is a property of the
circuits rather than a handling rule: the v3 export is
`{version, reportId, receipt}` — two public fields. `revealAuthorship` needs
the secret as a **witness**, so someone holding the whole export — or even
scraping `reportId` and `receipt` off the public ledger — cannot republish
the authorship, and cannot verify as its addressee either: verification
**recomputes** `receiptOf(reportId, myNonce)` and looks *that* value up, and
the nonce is not in the file nor on the chain. `test/sec-audit.mjs` §D and
`test/receipt-authorship.mjs` assert exactly that, and assert alongside it
that the secret itself is still omnipotent, which is why it stays on one
machine.

`proveAuthorship` (§4.4) complements this: it proves knowledge of the
`reportId` preimage inside a circuit, writes nothing to the ledger, and
returns `receiptOf(reportId, prosecutorNonce)` so a verifier can cross-check
it against `ledger.authorships`.

One implementation note worth keeping, because it is not obvious: a circuit
that touches **no** ledger state at all compiles without a ZKIR and without a
prover/verifier key pair. `proveAuthorship` asserts `reports.member(reportId)`
partly for that reason — without a ledger read there is no key to prove with
and no key to check against, and "exportable ZK proof" would just be a local
hash with a good name. `compact compile` reports **5 circuits** and
`output/keys/` holds `proveAuthorship.prover` / `.verifier`; if it ever
reports 4, that assert was dropped and the export claim has silently died.

## Declared limitations

- **Mock registration:** `registerOrganization` has no access control —
  anyone can claim an unused `orgId`. Since v2, `issueCredential` **is**
  authenticated against the org's published anchor, so a squatter can only
  issue under their own anchor; what stays mock is registration itself and
  the issuer's off-chain identity. The real issuer (a signing corporate
  directory) is roadmap.
- **The truth of the reported content is not proven** (spec §6).
- **No credential revocation** (spec §7).
- **Depth 16** = 65 536 credentials per deploy. (Depth 8 turned out to be a
  permanent kill switch before issuance was authenticated; see the note on
  `credentials` in the contract.)
- **The export does not yet carry `proveAuthorship` proof bytes.** The
  circuit and its key pair exist, but the v3 package is just
  `{version, reportId, receipt}`; nothing calls the proof server's `/prove`
  and nothing checks against the verifier key. What ships instead is the
  recompute-and-look-up scheme above, which already defeats scraping and
  splicing. What the wired proof would add is stronger: evidence that
  *whoever handed you the file* knows the preimage, not only that the author
  once designated this nonce. Wiring `/prove` and `/check` closes it — no
  circuit or format change is needed.
- **The Merkle root revealed** by `checkRoot` narrows the anonymity set if
  the path is cached. `app/src/witnesses` must recompute the path with
  `findPathForLeaf` over the latest state before every report, so all
  whistleblowers of the moment reveal the same root.
