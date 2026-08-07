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
npm run dev --workspace=ui         # starts the two apps + the visual system
```

`npm run dev` opens three servers:

| URL | What it is |
|---|---|
| `localhost:3000` | **PhantomVerum Client** — runs on your machine. Dark. Has a proof server |
| `localhost:3001` | **PhantomVerum Explorer** — the public ledger. Light. **No** proof server |
| `localhost:3002` | Visual system (palette, typography, assets) — reference for the deck |

They are **two distinct origins on purpose**: the browser gives each its own
`localStorage`, so the separation between private and public does not depend
on us behaving well. The only thing connecting them is the clipboard.

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
├── ui/                      # @phantomtrace/ui — React + Vite, TWO apps
│   ├── cliente/             #   local, private app (:3000)
│   ├── explorer/            #   public app, no proof server (:3001)
│   ├── sistema/             #   visual system sheet (:3002)
│   ├── shared/              #   crypto, types, service, components, tokens
│   └── pruebas/             #   the tests that cross the two apps
├── tests/                   # @phantomtrace/tests — Vitest + E2E simulation
│   └── src/
│       ├── circuits/        #   per-circuit tests
│       └── simulation/      #   E2E simulation of the 4 stages
├── deck/                    # presentation material
└── docs/                    # idea, architecture, environment
```

### The two applications

Midnight's dual ledger is not explained with a sign: it translates into **two
separate programs**, with opposite visual registers and no shared state.

**PhantomVerum Client** — dark, runs on your machine, has a proof server and
keeps the witnesses.

| View | What it does |
|---|---|
| **Issue credentials** (T1) | ACME's internal directory, never published. Only the anchor goes to the ledger |
| **Report** (T2) | You load the evidence — hashed **here**, with Web Crypto — pick org and period, and two hashes come out |
| **Reveal authorship** (T4) | You load your key, choose before whom, and the proof gets bound to that public key |

**PhantomVerum Explorer** — light, public, **no proof server**, and it says so
in the footer: there is nothing private to process.

| View | What it does |
|---|---|
| **Ledger** | 3 reports, 0 attributable. The "author" column is not censored: it does not exist |
| **Verify seal** (T3) | Drag a document and it is compared against the chain. One different byte ⇒ red |
| **Verify authorship** (T4) | Paste the material and verify **with your own key**. Change it and the verdict flips |

UI rules: legible and projectable (large font, high contrast), verdicts in
solid full-width panels. Everything that never leaves your machine is shown
behind a censor bar: it exists, without being shown.

### What is real and what is mocked

Until Block B is plugged in, the UI runs against a local service layer. This is
declared upfront because the difference matters:

| Real, verifiable | Fabricated |
|---|---|
| The evidence's SHA-256 — check it with `sha256sum` against what the screen shows | The `txId`s and block heights |
| The four derivations, an exact mirror of `contracts/src/testigo.compact` (same domain tags, same arity) | The indexer's "✓ synced" |
| The circuit asserts: someone else's credential, a double report in the same period and a secret that is not the author's genuinely fail, before emitting anything | Proving times |
| The ✅/❌ verdicts: a genuine local recomputation, not an `if` branch | The existence of a chain |

The mocked part lives in exactly two files —`ui/shared/cripto.ts` and
`ui/shared/servicio/ClienteMock.ts`— behind the `TestigoClient` interface.
No view knows about them. `H` here is SHA-256; in the circuit it is
`persistentHash`, so the values change at integration time.

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

### Block C — UI (`ui/`) ✅

- [x] **Client** (`:3000`): issue credentials, report with a real local hash,
      reveal designated authorship. Proof server terminal with live logs
- [x] **Explorer** (`:3001`): public ledger, verify seal, verify authorship
      with full-screen green/red verdicts
- [x] Separation by origin: two ports ⇒ different `localStorage`. The bridge is
      the clipboard and nothing else
- [x] Service layer with the frozen §3.1 API, ready to plug `app/` in
- [x] 42 tests, including one verifying the Explorer **cannot** import
      anything private from the Client

**Integration pending:** connect the real client when Block B is wired in.

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
