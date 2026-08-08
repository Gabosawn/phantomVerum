# PhantomTrace

> **Corruption reports with reversible anonymity.** The whistleblower proves
> they are an insider without revealing who they are, the evidence is sealed —
> and, unlike all existing systems, they can prove authorship later:
> only them, only before the authority they choose, only when it suits them.

Built on [Midnight](https://midnight.network) (Compact + ZK).

[![CI](https://github.com/Gabosawn/phantomVerum/actions/workflows/ci.yml/badge.svg)](https://github.com/Gabosawn/phantomVerum/actions/workflows/ci.yml)

> **La pipa de verificación (`proveAuthorship`) aún no está puenteada a nivel de CI**,
> por lo que el badge puede mostrar fallo sin que haya errores de compilación ni de test.

---

## Deployed on Preview — check it yourself

```
contract    aeb44bb55ab8c2eff09889ee179d18b6877b74fdc3bb316aebe45eed46c12815
deploy tx   47eb052b96091f90d87554049c00e737a5f14354270441de6c4b4ac3bbc991dd
block       325503
compiler    0.31.1        deployed 2026-08-08T06:07:14Z
```

**[View the contract on the explorer →](https://preview.midnightexplorer.com/contracts/aeb44bb55ab8c2eff09889ee179d18b6877b74fdc3bb316aebe45eed46c12815)**

Or ask the indexer directly. No key, no account, CORS is open — paste this
anywhere:

```bash
curl -s https://indexer.preview.midnight.network/api/v4/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ contractAction(address:\"aeb44bb55ab8c2eff09889ee179d18b6877b74fdc3bb316aebe45eed46c12815\"){ address state transaction { hash block { height } } } }"}'
```

It answers with the address, the serialized contract state, the transaction
and its block.

### The four acts, run against that contract

`NETWORK=preview npm run e2e --workspace=app -- --network`, 2026-08-08 06:14Z.
Every block below is on Preview and can be looked up:

```
ACT 1  registerOrganization                            block 325613
       issueCredential (issuer sees only the commitment) block 325618
ACT 2  report sealed, epoch 20673                      block 325623
ACT 3  second report, same epoch → rejected at PROOF TIME, no tx submitted
ACT 4  revealAuthorship for the prosecutor's nonce     block 325627

       package fields : version, reportId, receipt — no secret leaves the machine
       PROSECUTOR : ✅ AUTHORSHIP VERIFIED
       EMPLOYER   : ❌ DOES NOT VERIFY
```

The last two lines are the product. Same bytes, two verifiers, opposite
verdicts — and the ✅ is a recomputation the prosecutor performs from public
data plus a nonce they generated, not a field anyone handed them.

> Use `preview.midnightexplorer.com`, not `explorer.preview.midnight.network`.
> Measured, both on 2026-08-08: given a made-up address, the official-looking
> host returns **HTTP 200** and renders an empty page, while
> `midnightexplorer` returns **404**. A link that works on a host which
> answers 200 for everything is not evidence of anything; a link that works on
> one that 404s is.

Two notes so nobody has to reconcile them later. `deployment.json` records
`deployTxId` as `006d8d08…`, the identifier the deploy path returns; the hash
above is what the indexer reports for the same action, and it is the one the
explorer indexes. And the address lives in exactly one place —
`app/src/config/deployment.json` — which is what both the CLI and the browser
read.

**v1, superseded but still on chain:**
[`00bb2fc3…`](https://preview.midnightexplorer.com/contracts/00bb2fc3274cf02b0bd2a1f1d096a490a50da5308f5a7792b5dcf3733fca2978)
(block 324294, deployed 03:37Z). It is the pre-audit contract — orgId in the
nullifier, depth-8 tree, the secret inside the authorship hash — and it is
still queryable, which is the point: a deploy does not erase the one before it.
The contract in the box above is the fixed one.

---

## How it works (the 4 stages)

1. **The organization registers** — publishes the credential anchor on
   the ledger and issues credentials to employees (mock, off-chain).
2. **An employee reports** — the app verifies their credential *privately* and
   the `report` transaction discloses the sealed evidence hash (reportId), the
   epoch, an anti-spam nullifier, and the global credential-tree root. It does
   **not** disclose the `orgId`: `orgId` is a circuit argument, and arguments
   stay private unless disclosed — `report` never discloses it. The organization
   is public only because registration and credential issuance disclose it, not
   because the report names it. Nobody — not even the issuer — can link a report
   to a specific employee: the nullifier is cryptographically unlinkable to the
   credential.
3. **The evidence is immutable** — the hash is sealed on-chain. Any
   alteration won't match.
4. **Months later, they reveal authorship** — the prosecutor sends a fresh
   nonce off-chain; `revealAuthorship` proves in ZK that the caller knows the
   `reportId` preimage and writes a receipt bound to *that* nonce. The
   prosecutor then verifies by **recomputing** `receiptOf(reportId, theirNonce)`
   and finding it on the ledger.

   Two things follow, and they are the whole point. **Nothing secret is ever
   handed over** — the package is two public fields — so the prosecutor cannot
   resell or republish the authorship. And the verdict is not a comparison
   between fields of a file its bearer controls: the employer recomputes with
   their own nonce, gets a different receipt, and that one was never published.
   Only someone who satisfied the circuit's authorship assert could have put
   the real one there.

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

The two apps sit on different sides of this line, so they get different rows.
Declared upfront because the difference matters.

**Explorer (`:3001`) — reads the real chain.** It queries the Preview indexer
for the deployed contract at the address above. The ledger it shows is the
ledger. No SDK in the browser: plain `fetch` against a GraphQL endpoint with
open CORS.

**Client (`:3000`) — runs locally, and says so.** Its circuits execute against
`ClienteMock`; writing to the contract from a browser needs Lace plus the local
proof server and that integration is not done. The header reads "local".

| Real, verifiable | Fabricated (Client only) |
|---|---|
| The evidence's SHA-256 — check it with `sha256sum` against what the screen shows | The `txId`s and block heights the Client displays |
| The four derivations, an exact mirror of `contracts/src/testigo.compact` (same domain tags, same arity) | The Client's "✓ synced" indicator |
| The circuit asserts: someone else's credential, a double report in the same period and a secret that is not the author's genuinely fail, before emitting anything | Proving times |
| The Explorer's ledger reads, and the contract they come from | — the chain itself is real, and you can `curl` it |
| Both verdicts: ✅ is a recomputation found on the ledger, ❌ is one that is not there. Neither is an `if` branch | — |

The mocked part lives in exactly one file — `ui/shared/servicio/ClienteMock.ts`
— behind the `TestigoClient` interface. No view knows about it, which is what
lets the Explorer swap in `ExplorerPreview.ts` (a real indexer reader, same
interface) without a single view changing.

`ui/shared/cripto.ts` is **not** a mock: it re-exports the five pure circuits
from `@phantomtrace/shared/crypto`, which uses the same `persistentHash` the
circuit uses, pinned digest by digest against the compiled contract by
`tests/src/circuits/contract-agreement.test.ts`. The hashes the UI shows are
the ones the chain would produce. The only SHA-256 left is `hashDeArchivo`,
which hashes the evidence file — the same thing `app/`'s witnesses do.

## Tests

```bash
npm run compile:fast --workspace=contracts   # compiles the contract (no proving keys needed)
npm test                                     # all four suites, 375 checks
npm run simulate                             # the four acts, printing the ledger at each step
```

| Workspace | Checks | What it runs against |
|---|---|---|
| `contracts` | 87 | the compiled contract, via `@midnight-ntwrk/compact-runtime` |
| `app` | 172 | witnesses + the §3.1 API, against the simulator |
| `ui` | 68 | the service layer and the shared crypto |
| `tests` | 48 | every case twice — hand-written model **and** compiled contract |

### Two backends, one suite

Every test case runs against two interchangeable backends:

| Backend | What it is |
|---|---|
| `model` | The spec in TypeScript, written from `docs/01-arquitectura.md` |
| `contract` | The compiled `testigo.compact` driven through compact-runtime's local simulator |

The two implementations converged independently and agree on every published digest.
`contract-agreement.test.ts` verifies all pure circuits digest by digest and compares
full ledger snapshots after a scenario that exercises every circuit and rejection path.

13 deliberate mutations (dropped guards, swapped tags, removed operands) were injected one at
a time and all 13 are caught — 12 on first pass, the survivor after tightening.

### What is covered

| Circuit | Cases |
|---|---|
| `registerOrganization` | registers ok · re-registration fails · two orgs stay independent · issuing for an unregistered org fails |
| `report` | happy path (nothing identifying reaches the ledger) · invalid credential fails · second report in the same period fails · a different period passes with unlinkable nullifiers · two orgs do not interfere · unregistered org fails |
| `revealAuthorship` | real author passes · foreign secret fails · nonexistent report fails · same author + different prosecutor ⇒ different hash · double reveal to the same prosecutor fails |
| hardening | idempotency guard · exact replay fails · nullifier/authorship cross-collision impossible · domain tags bound · golden vectors from the compiled contract · nullifier keyed on credential secret |
| agreement | `crypto.ts` reproduces all four pure circuits · operand-order sensitivity · both backends reach identical public ledger |

## Development plan — 4 independent blocks ✅

Full detail: [`docs/03-plan-ejecucion.md`](docs/03-plan-ejecucion.md).

| Block | Scope | Key deliverable |
|---|---|---|
| **A — Contracts** | `testigo.compact` compiling with proving keys, domain separation, Merkle tree, block-time-bound reports | `compact compile` green, ledger matches spec §3–§4 |
| **B — Wiring** | Network config, witness providers, CLI scripts, Preview deploy | `npm run e2e` against Preview |
| **C — UI** | Client (:3000) + Explorer (:3001) with local proof server, dual-origin separation | Explorer reads the real Preview indexer |
| **D — Tests** | Two-backend differential suite: model + compiled contract, 375 checks | `npm test` + `npm run simulate` green |

**Contracts between blocks:** circuits and ledger per `docs/01-arquitectura.md` §3–§4; Option A Merkle (shipped); Option B frozen in `fallback/`.

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
