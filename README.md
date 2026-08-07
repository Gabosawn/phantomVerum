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

| Circuit | Cases |
|---|---|
| `registerOrganization` | registers ok · re-register fails |
| `report` | happy path · invalid credential fails · double report same period fails · different period passes · two orgs don't interfere |
| `revealAuthorship` | real author passes · wrong secret fails · nonexistent report fails · same author + different prosecutor ⇒ different hash |

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

### Block D — Tests (`tests/`)

- [ ] Per-circuit suite (table above)
- [ ] E2E simulation of the 4 stages printing ledger state at each step

**Can start without Block A** testing against the spec's
behavior. **Deliverable:** `npm test` green + `npm run simulate` in one command.

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
