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

## Tests

```bash
npm run compile:fast --workspace=contracts   # compiles the contract (no proving keys needed)
npm test                                     # 48 cases, every one against both backends
npm run simulate                             # the four acts, printing the ledger at each step
```

```
 testigo · backends: model, contract — differential run, both must agree

 ✓ src/circuits/register-organization.test.ts  (8 tests) 113ms
 ✓ src/circuits/hardening.test.ts             (11 tests) 226ms
 ✓ src/circuits/contract-agreement.test.ts     (4 tests | 1 skipped) 227ms
 ✓ src/circuits/reveal-authorship.test.ts     (10 tests) 402ms
 ✓ src/circuits/report.test.ts                (16 tests) 551ms

 Test Files  5 passed (5)
      Tests  48 passed | 1 skipped (49)
   Duration  1.10s
```

### Two backends, one suite

The suite runs behind a seam (`tests/src/harness/types.ts`) with two interchangeable backends.
Tests never import a backend — they `describe.each` over whatever is available, so every case
below runs twice.

| Backend | What it is |
|---|---|
| `model` | The spec implemented in TypeScript on top of compact-runtime's own `persistentHash` and `StateBoundedMerkleTree`. Written from `docs/01-arquitectura.md`, deliberately **not** from the contract |
| `contract` | The compiled `testigo.compact` driven through compact-runtime's local simulator — no network, no proof server, no proving keys |

That independence is the whole point: the two implementations agree on every published digest
and on the full public ledger, and they got there separately. `contract-agreement.test.ts`
checks both directions — the four `pure circuit` digests over five input vectors, and a
whole-snapshot comparison after a scenario that exercises every circuit and every rejection.

What the `model` backend does *not* do is run the constraints inside a ZK circuit. It checks
credential membership with `findPathForLeaf` instead of `checkRoot(merkleTreePathRoot(path))`.
Only the `contract` backend proves the `.compact` actually enforces it.

**One known divergence, by construction.** The contract inserts credential leaves through the
on-chain VM's state ops (`StateValue.newCell(leafHash(leaf)).encode()`) while the model calls
`StateBoundedMerkleTree.update()` directly. Both agree on *membership* — which leaf is provably
in the tree, which is what the circuit constrains — but they reach different internal root
digests. The root is therefore not part of the comparable ledger surface and is not printed in
the demo; nothing in the product reads it (`leerEstadoLedger` returns counts and hashes, and
`anchor` is a separate per-org marker). See the note on `LedgerSnapshot` in `types.ts`.

### What is covered

| Circuit | Cases |
|---|---|
| `registerOrganization` | registers ok · re-registration fails and cannot overwrite the anchor · two orgs stay independent · issuing for an unregistered org fails |
| `report` | happy path (and nothing identifying reaches the ledger) · invalid credential fails · second report in the same period fails · a different period passes with unlinkable nullifiers · two orgs do not interfere · a BETA employee cannot report as ACME whichever leaf they aim the witness at · two employees of one org do not interfere · unregistered org fails |
| `revealAuthorship` | real author passes · foreign secret fails · nonexistent report fails · same author + different prosecutor ⇒ different hash · double reveal to the same prosecutor fails |
| hardening | identical resubmission fails (idempotency guard) · exact replay fails · nullifier/authorship cross-collision impossible · same-arity domains separated · each hash bound to its own tag · golden vectors taken from the compiled contract · period reaches the nullifier digest · the nullifier is keyed on the credential secret, not the personal one |
| agreement | `crypto.ts` reproduces all four pure circuits over five input vectors · the contract is operand-order sensitive · both backends reach an identical public ledger |

### The suite has teeth

Green tests against a hand-written model prove nothing on their own, so the suite was
mutation-tested: 13 deliberate defects injected one at a time into the model and the hash
construction — dropped idempotency guards, dropped membership check, dropped author check,
swapped domain tags, swapped hash operands, `period` dropped from the nullifier.

The first pass killed 12 of 13. The survivor was a nullifier reusing the report domain tag: the
domain-separation test had been comparing a `Vector<3>` digest against a `Vector<4>` one, so the
arity difference masked the tag collision. Two tests were added — tag binding and golden vectors
— and all 13 mutants now fail.

The same technique confirms the two backends are genuinely independent: break a guard in the
model alone and exactly the `['model']` variants fail while every `['contract']` variant
survives.

## Development plan — 4 independent blocks

> **Complete and updated version:** [`docs/03-plan-ejecucion.md`](docs/03-plan-ejecucion.md) —
> official event rubric, technical decisions validated against the compiler
> (Option A Merkle already compiles), data contracts between blocks (API for `app/`,
> formats), **Block E — Delivery** (deck/video/demo) and hourly timeline.

The blocks **don't block each other**: each works against the spec in
[`docs/01-arquitectura.md`](docs/01-arquitectura.md) (which defines circuit
names, ledger state and types) and against mocks of neighboring layers.
Integration happens at the end of each block.

### Block A — Compact Contracts (`contracts/`)

- [ ] Official template compiling untouched (validate toolchain and current syntax)
- [ ] `registerOrganization` — insert org, fail if already exists
- [ ] `report` — credential verification (Option A Merkle, fallback B), `reportId` + nullifier
- [ ] `revealAuthorship` — preimage + designated verifier (`prosecutorPk`)

**Deliverable:** `compact compile` green. Derived values and ledger
match the spec *exactly* (§3–§4).

### Block B — TypeScript Wiring (`app/`)

- [ ] Network config (Preview), local proof server, indexer
- [ ] Witness providers for the 3 circuits + local persistence of secrets/credentials (file)
- [ ] Local evidence hash (the file never leaves the machine)
- [ ] CLI scripts: `register-org`, `report`, `reveal-authorship`, `verify-authorship`
- [ ] Contract deploy

**Can start without Block A** by mocking the compiled contract
module with the spec signatures. **Deliverable:** one command runs the 4
stages E2E; the "wrong secret" case fails at proof time without emitting a tx.

### Block C — UI (`ui/`)

- [ ] Organization view: registration + mock credential issuance + ledger panel
- [ ] Whistleblower view: evidence loading (local hash), report, export key
- [ ] Prosecutor view: verification ✅/❌ against ledger

**Can start without Blocks A and B** behind a service layer
mock with the CLI script API. **Deliverable:** the 3 views connected to
the real `app/` layer.

### Block D — Tests (`tests/`) ✅

- [x] Per-circuit suite — 48 cases, each run against both backends (see [Tests](#tests))
- [x] E2E simulation of the 4 stages printing ledger state at each step
- [x] Two-backend seam: spec model + the real compiled contract, differentially compared
- [x] Mutation-tested: 13 injected defects, 13 killed
- [x] Reconciled against Block A's contract: names, domain tags, assert strings, and the
      nullifier secret

**Deliverable:** `npm test` green + `npm run simulate` in one command, both against the real
compiled `testigo.compact`.

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
