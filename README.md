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
   publishes the evidence hash (reportId), the `orgId`, the epoch, and an
   anti-spam nullifier. The organization sees *which department is affected*;
   it cannot know **which employee** reported — the nullifier is cryptographically
   unlinkable to the credential.
3. **The evidence is immutable** — the hash is sealed on-chain. Any
   alteration won't match.
4. **Months later, they reveal authorship** — `revealAuthorship` proves they know
   the hash preimage and leaves an on-chain record bound to *that* prosecutor's
   key. The record alone is useless to anyone else. The package handed to the
   prosecutor **does not contain the report secret**: it carries the output of
   `proveAuthorship`, a circuit that writes nothing on-chain. Holding the whole
   package does not let you act as the author — `revealAuthorship` needs the
   secret as a witness, and the circuit answers `not the author`. What is still
   roadmap is narrower than it sounds: shipping real proof-server bytes in that
   package, so it also proves the *bearer* is the author and not merely that the
   author designated this key.

Full detail: [`docs/00-idea.md`](docs/00-idea.md) and
[`docs/01-arquitectura.md`](docs/01-arquitectura.md).

## Prior art

Other projects published under the `midnightntwrk` topic solve neighbouring
problems. Describing them accurately is the point: "nobody else does deferred
authorship" is only worth saying if we can say what everybody else *does* do.

| Project | What it proves | Where it stops short of this |
|---|---|---|
| **velo** | that a forensic verdict is legitimate — the evidence is sealed on the expert's machine and attested in ZK | It attests a verdict. It has no mechanism for the author of a sealed record to come forward *later* and prove they wrote it, to one chosen recipient. That gap is deferred authorship. |
| **asfalia** | solvency, with a proof that expires | The expiry idea is the same one enforced here by `blockTimeGte`/`blockTimeLt` on every report. We constrain the window inside the circuit rather than around it, with no oracle and no trusted clock. |
| **midnight-mail** | private messaging | Deployed to Preprod with a real contract address and block numbers. On deployment they are ahead of us. |

The framing we borrow from velo, because it is the right one:

> It is not a code-review convention. It is a constraint of the circuit: a
> report that violates it cannot be produced.

That is literally true here of the nullifier (one report per credential per
period), of domain separation (every hash bound to its own tag), and of the
report window (`blockTime`, checked in-circuit).

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
| `localhost:3000` | **Phantom Trace Client** — runs on your machine. Dark. Has a proof server |
| `localhost:3001` | **Phantom Trace Explorer** — the public ledger. Dark. **No** proof server |
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
├── shared/                  # @phantomtrace/shared — the single TS impl of the 5 pure circuits
└── docs/                    # idea, architecture, environment
```

### The two applications

Midnight's dual ledger is not explained with a sign: it translates into **two
separate programs**, with opposite visual registers and no shared state.

**Phantom Trace Client** — dark, runs on your machine, has a proof server and
keeps the witnesses.

| View | What it does |
|---|---|
| **Issue credentials** (T1) | ACME's internal directory, never published. Only the anchor goes to the ledger |
| **Report** (T2) | You load the evidence — hashed **here**, with Web Crypto — pick org and period, and two hashes come out |
| **Reveal authorship** (T4) | You load your key, choose before whom, and the proof gets bound to that public key |

**Phantom Trace Explorer** — dark, public, **no proof server**, and it says so
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

The mocked part lives in exactly one file — `ui/shared/servicio/ClienteMock.ts`
— behind the `TestigoClient` interface. No view knows about it.

`ui/shared/cripto.ts` is **not** a mock: it re-exports the five pure circuits
from `@phantomtrace/shared/crypto`, which uses the same `persistentHash` the
circuit uses, pinned digest by digest against the compiled contract by
`tests/src/circuits/contract-agreement.test.ts`. The hashes the UI shows are
the ones the chain would produce. The only SHA-256 left is `hashDeArchivo`,
which hashes the evidence file — the same thing `app/`'s witnesses do.

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

### Block A — Compact Contracts (`contracts/`) ✅

- [x] Option A (`testigo.compact`) compiles with keys; Option B frozen in `fallback/`
- [x] `registrarOrganizacion` / `emitirCredencial` / `denunciar` / `revelarAutoria`
- [x] Domain separation, epoch tied to `blockTime`, Merkle membership (HistoricMerkleTree)
- [x] **Time-bound reports enforced inside the circuit** — `blockTimeGte`/`blockTimeLt` constrain every report to its epoch, with no oracle and no trusted clock

**Deliverable:** `compact compile` green. Derived values and ledger
match the spec *exactly* (§3–§4).

### Block B — TypeScript Wiring (`app/`) 🟡

- [x] Network config (Preview/local), proof server, indexer providers
- [x] Witness providers for the circuits + local persistence of secrets/credentials (file)
- [x] Local evidence hash (the file never leaves the machine)
- [x] Core API (§3.1) + CLI scripts (`register-org`, `issue-credential`, `report`, …)
- [ ] Contract deploy to Preview (`deployment.json` still null)

**Deliverable:** one command runs the 4 stages E2E against Preview; the
"wrong secret" case fails at proof time without emitting a tx.

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

**Integration pending:** connect the real client when Block B is deployed to Preview.

### Block D — Tests (`tests/`) ✅

- [x] Per-circuit suite — each case run against both backends (see [Tests](#tests))
- [x] E2E simulation of the 4 stages printing ledger state at each step
- [x] Two-backend seam: spec model + the real compiled contract, differentially compared
- [x] Reconciled against Block A's contract: names, domain tags, assert strings, and the
      nullifier secret
- [x] Harness + npm scripts compatible with `noexec` mounts (this machine)

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
| [`docs/04-bloque-b-pasos.md`](docs/04-bloque-b-pasos.md) | Block B step breakdown: witness wiring, API surface, CLI scripts |
| [`docs/05-deploy-local.md`](docs/05-deploy-local.md) | Local devnet deploy: genesis seed, rehearsal steps before Preview |
| [`docs/05-mejoras_ES.md`](docs/05-mejoras_ES.md) | Plan de mejoras: arquitectura, seguridad y compliance (Español) |
| [`docs/06-improvements.md`](docs/06-improvements.md) | Actionable improvements backlog, split by owner, with priorities and file:line references |
