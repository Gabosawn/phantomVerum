# 04 — Block B: TypeScript wiring, step by step

> Micro-granular execution plan for Block B (`app/`) on the branch
> `feat/bloque-b-wiring`. Each step has an acceptance criterion (✓) — a step
> is not done until its ✓ is verified by running the command. Convention:
> small commits with Conventional Commits (`feat(b3.2): ...`).
>
> **Golden rule (from `01-arquitectura.md` §8):** do not invent APIs. Every
> import, signature, or type from `@midnight-ntwrk/*` is verified against the
> installed types (`tsc --noEmit`) or against official examples — never from
> memory. Interfaces with other blocks: frozen in `03-plan-ejecucion.md` §3.

Dependencies between phases:

```
F0 (toolchain/scaffolding) ──┐
                             ├──> B1 (config+providers) ──> B3 (API) ──> B4 (CLI) ──> B5 (deploy Preview)
FA (contract ported) ────────┘         B2 (witnesses) ──────┘
F5.0 (seed+faucet) — starts as soon as F0 finishes, runs in parallel to everything
```

---

## Phase 0 — Toolchain and scaffolding (owner: agent W-scaffold)

Touches: root `package.json`, `app/package.json`, `tests/package.json`,
`app/tsconfig.json`, `tests/tsconfig.json`, `.env.example`, docker.
**Does not touch `contracts/`.**

- [ ] **0.1** Branch `feat/bloque-b-wiring` created. ✓ `git branch --show-current`
- [ ] **0.2** Node ≥ 22 available. Preference: `nvm install 22`; if no nvm,
      official binary to `~/.local/node-v22` + PATH documented in
      `docs/02-entorno.md`. ✓ `node --version` ≥ 22, and `npm --version` responds.
- [ ] **0.3** Verify versions published TODAY with `npm view <pkg> version`
      for each package (do not trust the memory list):
      `@midnight-ntwrk/midnight-js-contracts`, `-network-id`,
      `-indexer-public-data-provider`, `-http-client-proof-provider`,
      `-node-zk-config-provider`, `-types`, `@midnight-ntwrk/compact-runtime`,
      `@midnight-ntwrk/wallet`, `@midnight-ntwrk/wallet-api`,
      `@midnight-ntwrk/zswap`, `@midnight-ntwrk/ledger`.
      Cross-check with the Preview compatibility matrix
      (docs.midnight.network/relnotes/support-matrix). Expected: midnight-js
      4.1.1 / compact-runtime 0.16.0 — if it differs, the matrix rules.
      ✓ table pasted in the commit message.
- [ ] **0.4** `app/package.json`: dependencies pinned EXACT (no `^`),
      `"type": "module"`, scripts `build` (`tsc -p .`), and the 5 CLI scripts
      (`register-org`, `issue-credential`, `report`, `reveal-authorship`,
      `verify-authorship`) + `e2e` pointing to `dist/scripts/*.js`.
      ✓ `npm pkg get type dependencies` shows expected.
- [ ] **0.5** `app/tsconfig.json` and `tests/tsconfig.json`:
      `module: NodeNext`, `moduleResolution: NodeNext`, `outDir: dist`,
      `rootDir: src`. `tests/package.json`: `"type": "module"` + `build`
      script. ✓ `npx tsc -p app --noEmit` passes (with empty src it's trivial).
- [ ] **0.6** Root `package.json`: `build`/`test`/`compile` with
      `--workspaces --if-present`; delete `lint` script.
      ✓ `npm run build` doesn't abort.
- [ ] **0.7** `.env.example` at root: `DEPLOY_SEED=` (empty, with comment on
      how to generate it), `NETWORK=preview`, `PROOF_SERVER=http://localhost:6300`.
      ✓ the file exists and `.env` remains in `.gitignore`.
- [ ] **0.8** Proof server pinned: pull `midnightntwrk/proof-server:8.1.0`,
      recreate the container with that tag (same port 6300).
      ✓ `curl -s localhost:6300/health` → `ok` and `docker ps` shows `:8.1.0`.
- [ ] **0.9** `npm install` at root (with Node 22 active) and commit
      `package-lock.json`. ✓ `npm ls --depth=0 --workspace=app` no errors.

## Phase A' — Contract ported (owner: agent W-contract)

Touches: only `contracts/`. Prerequisite for B2/B3 (generated TS types come
from here).

- [ ] **A.1** Port the validated Option A contract (scratchpad
      `spec-validation/src/testigo_a2.compact`) to
      `contracts/src/testigo.compact`. Review against spec §3–§4:
      same circuit and ledger names, domain separation, guards.
      ✓ semantic diff against spec reviewed manually.
- [ ] **A.2** Port Option B to `contracts/src/fallback/testigo-b.compact`
      (frozen, not compiled by default). ✓ file present.
- [ ] **A.3** `contracts/package.json`: script
      `compile` = `compact compile src/testigo.compact output/` (WITH keys —
      real deploy needs them) and `compile:fast` = with `--skip-zk` for
      iteration. ✓ `npm run compile --workspace=contracts` exit 0.
- [ ] **A.4** Compile and verify artifacts: `output/contract/index.cjs` +
      types, `output/keys/*.prover|.verifier`, `output/zkir/`.
      ✓ `ls contracts/output/keys | wc -l` = 8 (4 circuits × 2).
      Note: `output/` is gitignored — only the `.compact` is committed.
- [ ] **A.5** Anti-DQ gate: `contracts/` compiles from clean clone.
      ✓ in a temp dir: clone the branch, `npm run compile` green.
- [ ] **A.6** Generated TS smoke: minimal script that imports the generated
      module and calls the pure circuits (`reportIdOf`, `nullifierOf`,
      `authorshipOf`, `leafOf`) with dummy values. ✓ prints 4 hashes of 32 bytes.

## Phase B1 — Config and providers (`app/src/config/`)

Starts when F0 and A' are green. Owner: agent W-app (wave 2).

- [ ] **B1.1** `config/networks.ts`: the two environments —
      `preview` (`wss://rpc.preview.midnight.network`,
      `https://indexer.preview.midnight.network/api/v4/graphql`, proof server
      `http://localhost:6300`) and `local` (`ws://localhost:9944`,
      `http://localhost:8088/api/v4/graphql`, `:6300`). Selection by
      `process.env.NETWORK` (default `preview`). ✓ trivial unit: prints active
      config.
- [ ] **B1.2** `config/deployment.ts` + `config/deployment.json` (placeholder
      `{ "network": null, "contractAddress": null }`): type, reader, and writer.
      Format frozen in `03-plan-ejecucion.md` §3.2. ✓ `tsc --noEmit`.
- [ ] **B1.3** `config/providers.ts`: build the midnight-js providers object —
      indexer public data provider, http-client proof provider, zk-config
      provider pointing to `contracts/output/` (verify which applies in Node
      according to installed types), private state provider, wallet/midnight
      provider from `DEPLOY_SEED`. **Verify each import against installed
      packages** — exact names come from
      `node_modules/@midnight-ntwrk/*/dist/*.d.ts`, not memory.
      ✓ `tsc --noEmit` + a script that instantiates providers against Preview
      and runs a trivial indexer query.
- [ ] **B1.4** `setNetworkId` according to active network, once, in a
      `config/init.ts` module imported by all scripts. ✓ included in B1.3.

## Phase B2 — Identity, secrets, and witnesses (`app/src/witnesses/`)

Can start in parallel with B1 (only depends on A').

- [ ] **B2.1** `witnesses/secrets.ts`: read/write `secrets/whistleblower.json`
      (format §3.2: `{version, personalSecret, credentialSecret, orgId,
      leafIndex}`), creation with `crypto.randomBytes(32)` if nonexistent,
      permissions 0600. ✓ manual test: creates, re-reads, 64-char hex fields.
- [ ] **B2.2** `witnesses/evidence.ts`: local hash of evidence file
      (`node:crypto` sha-256 → 32 bytes). The file is NEVER uploaded anywhere
      — explicit comment. ✓ hashes a test file, deterministic.
- [ ] **B2.3** `witnesses/index.ts`: implement the witnesses object required by
      the contract's generated type (the 4: `credentialSecret`,
      `personalSecret`, `evidenceHash`, `credentialPath`). The exact shape
      (tuples `[privateState, value]`, `WitnessContext`) comes from the
      generated types in `contracts/output/` — verify with `tsc`, don't assume.
      `credentialPath` uses `findPathForLeaf` from the ledger state (see
      A.6/skill midnight-js); handle `undefined` → readable error "credential
      not issued for this org". ✓ `tsc --noEmit` against generated types.

## Phase B3 — Core API (`app/src/api.ts` — the §3.1 signatures, frozen)

Depends on B1 + B2.

- [ ] **B3.1** `api/contract.ts`: `deployContract()` and
      `connectContract(address)` with midnight-js contracts (deploy /
      findDeployedContract according to installed API). ✓ `tsc --noEmit`.
- [ ] **B3.2** `registerOrganization({orgId, anchor})` → real tx.
      ✓ against undeployed/local or Preview: tx confirms and
      `readLedgerState()` reflects it.
- [ ] **B3.3** `issueCredential({orgId})`: generates `credentialSecret`, computes
      `leafOf(orgId, credSecret)` with the pure circuit, inserts the leaf
      (`issueCredential` circuit), saves to secrets, returns `leafIndex`.
      ✓ two issuances → two leaves, recoverable paths.
- [ ] **B3.4** `report({orgId, period, evidence})`: validates credential via
      witnesses, locally computes expected `reportId`/`nullifier` (pure
      circuits) and returns them with the tx. Typed errors:
      `InvalidCredentialError`, `RepeatedNullifierError` — both must
      fire AT PROOF TIME (no tx emitted): capture the proof server failure
      and map it. ✓ happy path + the 2 negative cases.
- [ ] **B3.5** `revealAuthorship({reportId, prosecutorPk})` + error
      `NotTheAuthorError` (proof time). ✓ real author passes; wrong secret
      fails without tx.
- [ ] **B3.6** `verifyAuthorship(AuthorshipKeyExport)`: 100 % off-chain —
      recomputes `reportIdOf`/`authorshipOf` with pure circuits and checks
      `authorshipHash ∈ authorships` via indexer. No proof server. ✓ the 4
      cases from the README table (real author ✅, wrong secret ❌, nonexistent
      report ❌, different prosecutor → different hash).
- [ ] **B3.7** `readLedgerState()`: GraphQL query to the indexer +
      deserialization with the generated module. Returns
      `{organizations, reports[], nullifiers, authorships[]}` (§3.1).
      ✓ reflects state after each tx from previous steps.
- [ ] **B3.8** Authorship key export: `exportKey(reportId,
      prosecutorPk)` → `AuthorshipKeyExport` JSON (§3.2). ✓ `verifyAuthorship`
      on the export returns `{ok: true, inLedger: true}`.

## Phase B4 — CLI Scripts (`app/src/scripts/`)

Depends on B3. Each script: simple positional arguments, readable output
(it's video material), exit code ≠ 0 on error.

- [ ] **B4.1** `register-org.ts` — `npm run register-org --workspace=app -- <orgId>`
      (generates anchor/tree per Option A). ✓ prints orgId + tx.
- [ ] **B4.2** `issue-credential.ts` — issues for the local whistleblower.
      ✓ prints leafIndex.
- [ ] **B4.3** `report.ts` — `-- <orgId> <period> <file>`.
      ✓ prints reportId + nullifier + tx; with invalid credential exits ≠ 0
      WITHOUT tx.
- [ ] **B4.4** `reveal-authorship.ts` — `-- <reportId> <prosecutorPk>` + writes
      the key export to `secrets/export-<reportId>.json`. ✓ prints
      authorshipHash + export path.
- [ ] **B4.5** `verify-authorship.ts` — `-- <export-path>` → `✅ AUTHORSHIP
      VERIFIED` / `❌ NOT VERIFIED` (this is what's projected in T4).
      ✓ both results depending on input.
- [ ] **B4.6** `e2e.ts` — the 4 stages run, printing the ledger state
      after each step + the alteration attempt (T3) failing + the dual
      verification (prosecutor ✅ / employer ❌). ✓ `npm run e2e
      --workspace=app` green end-to-end.

## Phase B5 — Deploy to Preview (milestone Fri 24:00)

- [ ] **B5.0** *(starts as soon as F0.9 finishes — HUMAN involved)*
      `scripts/generate-seed.ts`: generates seed, writes it to `.env`, prints
      the address. **→ Juan requests tDUST from the Preview faucet with that
      address** (usually has captcha — not automatable). ✓ balance > 0 via
      indexer.
- [ ] **B5.1** Real deploy: `scripts/deploy.ts` → writes
      `config/deployment.json` with address + txId + `compilerVersion`.
      ✓ valid address and the Preview indexer returns the contract state.
- [ ] **B5.2** Commit `deployment.json`. ✓ `git show` includes it.
- [ ] **B5.3** Full E2E (`B4.6`) against Preview with the deployed
      contract. ✓ green; txIds appear in the indexer.
- [ ] **B5.4** Reconnection smoke: delete local state (not secrets),
      `connectContract(address)` from scratch and `readLedgerState()` reflects
      everything. ✓ this is what `ui/` and `tests/` will use.

---

## Agent assignment

| Wave | Agent | Phases | Files touched |
|---|---|---|---|
| 1 | **W-scaffold** | Full F0 | package.json (root/app/tests), tsconfigs, `.env.example`, docker |
| 1 | **W-contract** | Full A' | `contracts/` only |
| 2 | **W-app** | B1 + B2 + B3 + B4 | `app/src/` only |
| 2→ | **HUMAN (Juan)** | B5.0 faucet | — |
| 3 | **W-deploy** | B5.1–B5.4 | `app/src/scripts/deploy.ts`, `deployment.json` |

Rules for all agents: verify API against installed types/official examples
(never memory) · small commits per step with the ID (`feat(b3.4):`) · if a
step doesn't close within 2× its estimate, stop and report the blockage instead
of inventing · never touch files outside the assigned column.
