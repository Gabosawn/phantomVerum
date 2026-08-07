# 03 — Enhanced execution plan

> Extends the 4-block plan from the README with what was missing: the official
> event rubric, technical decisions already validated against the real compiler,
> data contracts between blocks, the delivery block (deck/video), and an hourly
> timeline. Everything stated here was verified on Fri 7/8: against compiler
> 0.31.1 compiling test contracts, against the official compatibility matrix,
> against GitHub/npm, and against the published event rules.

---

## 0. What rules: the official BA 2026 rubric

Source: [official rules](https://hackbuenosaires.com/rules) ·
[binding PDF](https://mpc.midnight.network/hubfs/Midnight_Hack_Buenos_Aires_Official_Rules.pdf)

| Criterion | Weight |
|---|---|
| **Engineering & Implementation** | **40 %** |
| QA & Reliability | 15 % |
| Product & Vision | 15 % |
| UX & Design | 15 % |
| Communication | 10 % |
| BizDev & Viability | **5 %** |

**Reading:** 55 % of the score is Engineering + QA. Every hour on real deploy,
tests, and functional demo yields ~8× more than an hour on business slides.
BizDev = **a single slide**.

**Explicit DQ gate:** *"if the submitted Compact contract does not compile,
the project is automatically disqualified."* Also: public repo + deck +
demo/video before Sat 13:00 ART (incomplete submission = DQ), mandatory
topic `midnightntwrk`, Apache 2.0, clear README.

**Evidence of what wins:** Dawn won the grand prize ($3,500) with real deploy
on testnet + Lace integrated; depapp only won Best Tutorial ($500) with
*mocked* transaction hashes. The difference was the real deploy. That's the 40 %.

---

## 1. Anti-DQ checklist — do first (≈1 h)

| # | Item | Verified status | Action |
|---|---|---|---|
| 1 | Topic `midnightntwrk` | ❌ `repositoryTopics: null` | `gh repo edit Gabosawn/phantomVerum --add-topic midnightntwrk --add-topic compact` |
| 2 | Node ≥ 22 | ❌ installed v20.19.4 | `nvm install 22 && nvm use 22` **before** first `npm install` |
| 3 | Deps `@midnight-ntwrk/*` | ❌ no package.json declares them | Pin exact (verified against Preview matrix): midnight-js **4.1.1**, compact-runtime **0.16.0**, dapp-connector-api **4.0.1**, testkit-js **4.1.1**. `npm install` + commit lockfile |
| 4 | Broken npm scripts | ❌ (see §1.1) | Fix before they blow up in integration |
| 5 | tDUST from Preview faucet | pending | Request TODAY (faucets crash/rate-limit) |
| 6 | `.env.example` | ❌ doesn't exist (.gitignore allows it) | Create with `DEPLOY_SEED=`, `NETWORK=preview` |
| 7 | Proof server pinned | ⚠️ runs `:latest` | Use `:8.1.0` (the Preview matrix version) |
| 8 | Apache 2.0 license | ✅ | — |
| 9 | Public repo | ✅ | — |
| 10 | Post-kickoff commits | ✅ all from today, 11:14+ | Add 1 line to README declaring `.agents/` as third-party AI tooling, not product code |

### 1.1 Broken npm scripts (verified)

- Root `package.json`: `"build": "npm run build --workspaces"` fails because
  `contracts/` has no `build` script → use `--workspaces --if-present`.
- `app/` and `tests/` don't have `"type": "module"` but tsconfig emits ES2022
  → `node dist/...` throws `Cannot use import statement outside a module`.
  Also change to `module`/`moduleResolution: NodeNext` in Node workspaces
  (with `bundler`, relative imports without `.js` break at runtime).
- `tests/`: `"simulate": "node dist/simulation/e2e.js"` but nothing generates
  that `dist/` → add `build` script.
- `"lint"` invokes eslint which is not installed and with eslint 8 syntax →
  delete it (with 24h you don't install a linter).

---

## 2. Technical decisions — already validated compiling against 0.31.1

An agent wrote and compiled test contracts for each point in the spec
(§3–§5 of `01-arquitectura.md`). Results:

### 2.1 Option A (Merkle) WORKS — and already exists compiling

- `HistoricMerkleTree<8, Bytes<32>>` + `merkleTreePathRoot` + `checkRoot`
  exist in 0.31.1. **The full Option A contract compiles and generates
  PLONK keys (46 s).** Also B (26 s). No technical blocker.
- **Chosen variant: global tree with `orgId` inside the leaf**
  (`leaf = H(dom ‖ orgId ‖ credSecret)`, built **in-circuit** — the
  witness only provides the siblings, cannot lie about which leaf it proves).
  Proving membership in the global tree proves membership *in that org*: the
  multi-org semantics are preserved.
- Why not "per-org root in the Map" (more literal to §3): compiles the same,
  but the generated TS ledger doesn't expose path helpers for that form —
  you'd have to reimplement the tree off-chain manually (3–4 h of risk).
  With the global tree, the generated TS **gives you** `findPathForLeaf()`:
  the path witness is ~5 lines.
- `HistoricMerkleTree` (not `MerkleTree`) is mandatory: with the historic one,
  emitted paths remain valid after new insertions.
- **B is frozen as a safety net**: both contracts exist;
  the fallback is changing an artifact path, not rewriting.

### 2.2 Domain separation — mandatory, not optional

`nullifier` and `authorship` share shape and the same `secret` in position 0.
An attacker registering an org with `orgId = reportId` forces a cross-domain
collision. Validated fix: domain tag in position 0
(`pad(32, "phantomtrace:nullifier:v1")`, etc.) in all 4 hashes. A technical
judge asking about this gets an answer with the tag in the code.

### 2.3 `disclose()` Rules (Differ from the Spec Pseudocode)

- **Every** ledger operation requires `disclose()` on its arguments —
  even public params of `export circuit` (the compiler treats them as
  potentially-witness). This applies to `insert`, `lookup`, `member`,
  `checkRoot`.
- `assert` on witness-derived comparisons **do not** take
  `disclose()` (C1 of `revealAuthorship` goes clean).

### 2.4 Demo advantage: exported pure circuits

`reportIdOf`, `nullifierOf`, `authorshipOf`, `leafOf` as
`export pure circuit` → appear in generated TS as pure functions.
The app computes `reportId` and prosecutor verification **locally, without
proof server**. `verifyAuthorship` off-chain comes free.

### 2.5 Syntax 0.23 traps (to avoid wasting time)

`goes_left` is snake_case (only stdlib inconsistency) ·
`MerkleTree.root()` is runtime-only, in-circuit use `checkRoot(digest)` ·
`firstFree()` doesn't exist in-circuit · `Opaque<"string">` **is not hashable**
(`period` stays as `Bytes<32>`; `Uint<32>` with cast also works) ·
`pad(32, ...)` requires literals → domain tags go as circuits helpers.

### 2.6 Included hardening + weakness to declare

- Idempotency guards: `Set.insert` is idempotent, without
  `assert(!member(...))` a resubmit would pass silently. Included in
  reports, nullifiers, and authorships.
- `assert(organizations.member(orgId))` before `lookup` (readable error).
- **Declare upfront** (deck + README): `registerOrganization` /
  `issueCredential` have no access control — consistent with "mock
  issuer", same as we declare the weak anti-spam of B.

The reference contracts (A, B, and per-point probes) are compiled in the
session scratchpad; porting them to `contracts/src/` is the first item of
Block A.

---

## 3. Data contracts between blocks — freeze BEFORE starting

The original plan says "mocks + integration at the end" but doesn't define what
to mock against. This was what was missing. **Frozen here; if it needs to
change, all blocks are notified.**

### 3.1 `app/` API (what C and D mock against)

```ts
type Hex32 = string;            // 64 chars hex, no 0x
type TxResult = { txId: string; blockHeight?: number };

registerOrganization(p: { orgId: Hex32; anchor: Hex32 }): Promise<TxResult>;

issueCredential(p: { orgId: Hex32 }): Promise<{ credentialSecret: Hex32; leafIndex: number; tx: TxResult }>;   // Option A only

report(p: { orgId: Hex32; period: string; evidence: Uint8Array }):
  Promise<{ reportId: Hex32; nullifier: Hex32; tx: TxResult }>;
  // hashes evidence LOCALLY; throws InvalidCredentialError | RepeatedNullifierError (fail at proof time, no tx)

revealAuthorship(p: { reportId: Hex32; prosecutorPk: Hex32 }):
  Promise<{ authorshipHash: Hex32; tx: TxResult }>;
  // throws NotTheAuthorError (proof time, no tx)

verifyAuthorship(p: AuthorshipKeyExport): Promise<{ ok: boolean; inLedger: boolean }>;
  // 100 % off-chain: recomputes with pure circuits + reads ledger via indexer

readLedgerState(): Promise<{ organizations: number; reports: Hex32[]; nullifiers: number; authorships: Hex32[] }>;
  // for the UI panel; via indexer GraphQL + generated deserializer
```

### 3.2 Formats that cross boundaries

- **Whistleblower secrets** → `secrets/whistleblower.json` (already gitignored):
  `{ version: 1, personalSecret, credentialSecret, orgId, leafIndex }`.
- **Authorship key export** (what the UI exports and the prosecutor loads) →
  `AuthorshipKeyExport = { version: 1, reportId, evidenceHash, secret,
  prosecutorPk, authorshipHash }`. ⚠️ Stated limitation: the prosecutor learns
  `secret` — acceptable for MVP, roadmap: ZK proof to the prosecutor.
- **Contract address** → `app/src/config/deployment.json` committed:
  `{ network: "preview", contractAddress, deployTxId, deployedAt,
  compilerVersion: "0.31.1" }`. `ui/` and `tests/` import from here. Never
  from a loose env var.
- **Deploy seed** → `.env` (`DEPLOY_SEED=`), never committed;
  `.env.example` yes.

### 3.3 Block D test mechanism (decided)

Vitest against the **real compiled contract** via
`@midnight-ntwrk/compact-runtime` (local simulator, no network and no proof
server) — not pure mocks. The circuit tests test the actual `.compact`
and survive integration.

---

## 4. Revised blocks

Each block is executable by one person or a supervised agent; they don't
block each other because §3 already freezes the interfaces.

### Block A — Contracts (`contracts/`) — risk already burned

- [ ] Port the validated Option A contract to `contracts/src/testigo.compact`
      (adapt names if needed), `compact compile` green **in the repo**
- [ ] Script `compile` in contracts/package.json + CI or pre-push gate
      (main always compiles = automatic anti-DQ)
- [ ] Freeze B in `contracts/src/fallback/` (compiled, unused)
- **Deliverable:** green compile committed + keys generated. It's the gate for
  the 40 % — goes first and today.

### Block B — TS Wiring (`app/`)

- [ ] Pinned deps (§1) + Preview config (`rpc.preview.midnight.network`,
      indexer v4, local proof server :6300)
- [ ] Witnesses: `credentialPath()` = `ledger.credentials.findPathForLeaf(leaf).path`
      (~5 lines; handle `undefined` = "not an employee")
- [ ] The 5 methods from §3.1 + persistence §3.2
- [ ] `verifyAuthorship` with pure circuits (no proof server — free)
- [ ] Deploy to Preview + `deployment.json` committed **tonight** (§6)
- **Deliverable:** E2E of the 4 stages via CLI against Preview; the
  "wrong secret" case fails at proof time without emitting tx.

### Block C — UI (`ui/`)

- [ ] The 3 views from the README, mocking §3.1 until integrated
- [ ] **Split panel "what the chain sees / what never leaves your machine"** in
      the Whistleblower view — it's the artifact a privacy judge looks for
      (15 % UX is won here, not in cosmetic polish)
- [ ] **Dual verification screen** in the Prosecutor view: same proof,
      prosecutor's key → ✅ / employer's key → ❌. It's THE video moment
- **Deliverable:** 3 views against real `app/`. Legible and projectable.

### Block D — Tests (`tests/`)

- [ ] Per-circuit suite against the compiled contract (§3.3), README table
      + 2 new cases: identical report resubmit fails (guard);
      nullifier/authorship collision impossible (domain separation)
- [ ] `npm run simulate`: the 4 stages printing the ledger at each step
- **Deliverable:** `npm test` green visible in README/video (QA = 15 % and
  almost nobody shows it).

### Block E — Delivery (NEW — previously had no owner or schedule)

- [ ] **Deck** (~9 slides, structure already written in `contexto-hackathon.md`)
      with three mandatory corrections:
      1. Exact prior art: **depapp won Best Tutorial ($500); the grand
         "Protect That Data" prize was Dawn's**. The table must say it
         right — factual accuracy is credibility.
      2. Claim framing, unassailable: *"the designated-verifier primitive
         exists as a circom library; nobody integrated it into a working
         whistleblower system — delayed authorship as a product only
         exists in papers. We are the first to ship it, and on
         Midnight."* Bonus: Dawn literally declares *"your identity is never
         revealed"* — cite it as state of the art to surpass.
      3. Honest limitations slide (mock issuer, no access control on
         registration, veracity, off-chain metadata) — preventive honesty
         disarms the technical judge. BizDev: ONE slide (5 %).
- [ ] **Video ≤ 3 min** — script with timestamps:
      0:00–0:20 hook (SEC: prove you were first without burning yourself) ·
      0:20–0:40 prior art table, "delayed authorship?" column all ❌ ·
      0:40–2:20 the 4 stages LIVE: T2 with split-screen
      chain/machine + proving timer; T3 alteration rejected;
      **T4 climax: two windows PROSECUTOR ✅ / EMPLOYER ❌** ·
      2:20–2:45 engineering (green compile, address in explorer, tests) ·
      2:45–3:00 closing: "the mailbox is plumbing; delayed authorship is the
      product".
- [ ] Record against the **frozen** demo (Sat 10:30), never at 12:30.
- [ ] Final README: remove empty checkboxes and phantom `deck/`; add
      screenshots + contract address + how to run everything.

---

## 5. Timeline (Fri afternoon → Sat 13:00 ART)

| Deadline | Milestone (green = committed and pushed) |
|---|---|
| **Fri 15:30** | §1 complete: topic, Node 22, deps + lockfile, scripts fixed, `.env.example`, tDUST requested. §3 frozen (this doc). |
| **Fri 17:00** | **Block A delivered: `compact compile` green in the repo** (gate secured, decision A confirmed). B/C/D/E start in parallel. |
| **Fri 21:00** | B: 4 stages E2E against **undeployed/local**. D: circuit suite green. |
| **Fri 24:00** | **Deploy to Preview + `deployment.json` committed + E2E against Preview.** If it fails here, the entire morning remains for plan B — that's why it goes today. |
| **Sat 09:00** | UI integrated with real `app/`. `npm run simulate` green against Preview. |
| **Sat 10:30** | **Feature freeze.** Video is recorded on this state. Deck closed. |
| **Sat 12:00** | Video uploaded, final README, release tag. 1 h buffer. |
| **Sat 13:00** | Submit. **No operations against Preview after Sat 11:00.** |

**Priority if something must be sacrificed:** compile gate > E2E CLI against Preview >
video/deck > polished UI > exhaustive tests.

---

## 6. Integration and plan B

**Integration order:** A→B (real contract replaces mock) → B+D (simulate
against network) → B+C (UI against real app). Smoke test after each step = the
4-stage E2E script.

**Plan B if Preview fails** (RPC down, faucet dry, tx won't confirm):
the demo falls back to local/undeployed (node `ws://localhost:9944` + indexer
`:8088`, already documented in AGENTS.md) and the video is recorded with
whatever is green. Have pre-generated proofs + pre-recorded video as a fallback
for the live demo; show at least ONE proof generation live with a timer if it
takes < 30 s.
