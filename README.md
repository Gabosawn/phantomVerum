# PhantomTrace

> **Corruption reports with reversible anonymity.** The whistleblower proves
> they are an insider without revealing who they are, the evidence is sealed —
> and, unlike all existing systems, they can prove authorship later:
> only them, only before the authority they choose, only when it suits them.

Built on [Midnight](https://midnight.network) (Compact + ZK).

---

## How it works (the 4 stages)

1. **The organization registers** — publishes the credential anchor on
   the ledger and issues credentials to employees (mock, off-chain).
2. **An employee reports** — the app verifies their credential *privately* and
   publishes only `reportId = H(evidence ‖ secret)` and an anti-spam nullifier.
   The organization sees that *there is* a report; it cannot know from whom.
3. **The evidence is immutable** — the hash is sealed on-chain. Any
   alteration won't match.
4. **Months later, they reveal authorship** — `revealAuthorship` proves they know
   the hash preimage, tied to *that* prosecutor's key (designated verifier).
   Intercepted by anyone else, the proof is useless.

Full detail: [`docs/00-idea.md`](docs/00-idea.md) and
[`docs/01-arquitectura.md`](docs/01-arquitectura.md).

## Quick start

```bash
npm install                        # installs all workspaces
npm run compile                    # compiles Compact contracts
npm test                           # runs the test suite
npm run simulate                   # E2E simulation of the 4 stages
npm run dev --workspace=ui         # starts the frontend on :3000
```

CLI scripts (workspace `app`):

```bash
npm run register-org --workspace=app       # register organization
npm run report --workspace=app             # sealed report + nullifier
npm run reveal-authorship --workspace=app  # authorship proof to the prosecutor
npm run verify-authorship --workspace=app  # off-chain verification (✅/❌)
```

## Repo structure

```
phantomtrace/
├── contracts/               # @phantomtrace/contracts — Compact circuits
│   ├── src/                 #   testigo.compact (the 3 circuits)
│   └── output/              #   compiler artifacts (generated)
├── app/                     # @phantomtrace/app — TypeScript wiring
│   └── src/
│       ├── witnesses/       #   witness providers for the 3 circuits
│       ├── scripts/         #   CLI: register-org, report, reveal-authorship, verify-authorship
│       └── config/          #   Preview network, proof server, indexer
├── ui/                      # @phantomtrace/ui — React + Vite
│   └── src/
│       ├── views/           #   Organization / Whistleblower / Prosecutor
│       ├── components/      #   reusable components
│       ├── hooks/           #   wallet, contract
│       └── lib/             #   helpers and constants
├── tests/                   # @phantomtrace/tests — Vitest + E2E simulation
│   └── src/
│       ├── circuits/        #   per-circuit tests
│       └── simulation/      #   E2E simulation of the 4 stages
├── deck/                    # presentation material
└── docs/                    # idea, architecture, environment
```

### The 3 UI views

| View | What it does |
|---|---|
| **Organization** | Register org (anchor) + issue credential (mock) + ledger panel: there are N reports, none attributable |
| **Whistleblower** | Load evidence (hashed locally — stated on screen), choose org/period, report, export authorship key |
| **Prosecutor** | Load reportId + key + delivered material → verify against ledger → ✅ / ❌ |

UI rules: legible and projectable (large font, high contrast). The whistleblower
view explicitly states what does NOT leave the machine.

### Tests

> Everything under `tests/` is written in English. Contract-facing identifiers
> (circuit names, ledger fields, witnesses, `assert` messages, domain tags) stay
> in Spanish because they must match the compiled `.compact` byte for byte.

```bash
npm test           # 22 cases across the three circuits + the hardening suite
npm run simulate   # the four acts end to end, printing the ledger at each step
```

```
 testigo · backends: model — contract backend OFF (no contracts/output/contract/index.cjs)

 ✓ src/circuits/registrar-organizacion.test.ts (3 tests) 6ms
 ✓ src/circuits/hardening.test.ts            (8 tests) 58ms
 ✓ src/circuits/denunciar.test.ts            (6 tests) 113ms
 ✓ src/circuits/revelar-autoria.test.ts      (5 tests) 79ms

 Test Files  4 passed (4)
      Tests  22 passed (22)
   Duration  598ms
```

### What is covered

| Circuit | Cases |
|---|---|
| `registrarOrganizacion` | registers ok · re-registration fails and cannot overwrite the anchor · two orgs stay independent |
| `denunciar` | happy path (and nothing identifying reaches the ledger) · invalid credential fails · second report in the same period fails · a different period passes with unlinkable nullifiers · two orgs do not interfere · two employees of one org do not interfere |
| `revelarAutoria` | real author passes · foreign secret fails · nonexistent report fails · same author + different prosecutor ⇒ different hash · double reveal to the same prosecutor fails |
| hardening (§2.2, §2.6) | identical resubmission fails (idempotency guard) · exact replay fails · nullifier/autoria cross-collision impossible · same-arity domains separated · each hash bound to its own tag · frozen golden vectors · period reaches the nullifier digest |

### Two backends, one suite

The suite runs through a seam (`tests/src/harness/types.ts`) with two interchangeable
backends. Tests never import a backend — they `describe.each` over whatever is available.

| Backend | What it is | Available |
|---|---|---|
| `model` | The spec (§3–§4) implemented in TypeScript, over compact-runtime's **real** `persistentHash` and **real** `StateBoundedMerkleTree` — so digests and Merkle roots are byte-identical to the circuit's, not simulated | always |
| `contract` | The compiled `.compact` driven through `@midnight-ntwrk/compact-runtime`'s local simulator — no network, no proof server | once `contracts/output/` exists |

With both present, every case runs twice and **any divergence between them is a real bug in
one of the two**. The model is written from the spec, deliberately not from the contract, which
is what gives the comparison its value.

What the `model` backend does *not* do is run the constraints inside a ZK circuit: it checks
credential membership with `findPathForLeaf` rather than `checkRoot(merkleTreePathRoot(path))`.
Same bytes, same outcome — but only the `contract` backend proves the `.compact` enforces it.

### The suite has teeth

Green tests against a hand-written model prove nothing on their own, so the suite was
mutation-tested: 13 deliberate defects injected one at a time into the model and the hash
construction (dropped idempotency guards, dropped membership check, dropped author check,
swapped domain tags, swapped hash operands, `periodo` dropped from the nullifier).

The first pass killed 12 of 13. The survivor was a nullifier reusing `testigo:denuncia:v1` —
the domain-separation test had been comparing a `Vector<3>` digest against a `Vector<4>` one,
so the arity difference masked the tag collision. Two tests were added (tag binding + golden
vectors) and all 13 mutants now fail the suite.

## Development plan — 4 independent blocks

> **Complete and updated version:** [`docs/03-plan-ejecucion.md`](docs/03-plan-ejecucion.md) —
> official event rubric, technical decisions validated against the compiler
> (Option A Merkle already compiles), data contracts between blocks (API for `app/`,
> formats), **Block E — Delivery** (deck/video/demo) and hourly timeline.

The blocks **don't block each other**: each works against the spec in
[`docs/01-arquitectura.md`](docs/01-arquitectura.md) (which defines circuit
names, ledger state and types) and against mocks of neighboring layers.
Integration happens at the end of each block.

### Block A — Compact Contracts (`contracts/`) ✅

- [x] Option A (`testigo.compact`) compiles with keys; Option B frozen in `fallback/`
- [x] `registrarOrganizacion` / `emitirCredencial` / `denunciar` / `revelarAutoria`
- [x] Domain separation, epoch tied to `blockTime`, Merkle membership (HistoricMerkleTree)

**Deliverable:** `compact compile` green. Derived values and ledger
match the spec *exactly* (§3–§4).

### Block B — TypeScript Wiring (`app/`) 🟡

- [x] Network config (Preview/local), proof server, indexer providers
- [x] Witness providers for the circuits + local persistence of secrets/credentials (file)
- [x] Local evidence hash (the file never leaves the machine)
- [x] Core API (§3.1) + simulator selftest (deploy/connect + circuit calls)
- [ ] CLI scripts wired end-to-end (`app/src/scripts/` still empty)
- [ ] Contract deploy to Preview (`deployment.json` still null)

**Deliverable:** one command runs the 4 stages E2E against Preview; the
"wrong secret" case fails at proof time without emitting a tx.

### Block C — UI (`ui/`) 🟡

- [x] Scaffold: three views + Vite entry (English stubs)
- [ ] Organization view wired to `app/` (registration + credential + ledger panel)
- [ ] Whistleblower view wired (local hash, report, export key)
- [ ] Prosecutor view wired (verification ✅/❌ against ledger)

**Deliverable:** the 3 views connected to the real `app/` layer.

### Block D — Tests (`tests/`) ✅

- [x] Per-circuit suite against the compiled contract (model + simulator backends)
- [x] E2E simulation of the 4 stages printing ledger state at each step
- [x] Two-backend seam: spec model + compiled Compact contract
- [x] Hardening / adversarial regressions (epoch, domain separation, guards)
- [x] `npm test` + `npm run simulate` green on `dev` (incl. noexec/`index.js` harness fixes)

**Deliverable:** `npm test` green + `npm run simulate` with one command. The seam
(`tests/src/harness/`) swaps backends without touching assertions.

### Contracts between blocks (the only thing frozen upfront)

1. **Circuits and ledger** — exactly as `docs/01-arquitectura.md` §3–§4. If the
   installed syntax forces a deviation, adapt the syntax, never the
   semantics.
2. **`app/` API** — the 4 CLI script functions, with TS signatures
   agreed upon before starting C.
3. **Credential** — try Option A (Merkle); if it doesn't work, fallback to
   Option B. The decision doesn't block B/C/D: the `report` circuit
   interface is the same in both.

## Documentation

| Doc | What for |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Toolchain, services and conventions — context for AI agents |
| [`docs/00-idea.md`](docs/00-idea.md) | The idea, the problem and the differentiator |
| [`docs/01-arquitectura.md`](docs/01-arquitectura.md) | Actors, flow, spec of the 3 circuits, ledger state |
| [`docs/02-entorno.md`](docs/02-entorno.md) | Environment setup: toolchain, services, checklist |
| [`docs/03-plan-ejecucion.md`](docs/03-plan-ejecucion.md) | Enhanced execution plan: official rubric, decisions validated against the compiler, data contracts between blocks, delivery block and hourly timeline |
