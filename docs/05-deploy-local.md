# 05 — Local deploy for full E2E testing (before Preview)

> **Status: PLAN ONLY — nothing here has been run yet.** This document is the
> agreed path to deploy `testigo.compact` against a **local Docker devnet** and
> run the 4-act demo end to end with real proving, before we risk the public
> **Preview** network (docs/03 §5 gate "vie 24:00"). Local first = we control
> node, indexer, proof server and funding, and a failure costs nothing.
>
> It is written to be executed on a **healthy machine** (this repo's current
> machine has a broken FS / no `node_modules`; do NOT run these steps here).

---

## 0. Why local before Preview

| | Local devnet | Preview |
|---|---|---|
| Node / indexer / proof server | ours, resettable | shared, public |
| Funding | genesis-funded seed (no faucet) | faucet, can be dry/slow |
| Cost of a failed deploy | `docker compose down -v` and retry | burns tDUST + time on demo day |
| networkId | `undeployed` | `preview` |

The deploy code path (`deployContract` → `writeDeployment`) is **identical** for
both; only `NETWORK` and the funding source change. So a green local E2E means
the only thing left to prove on Preview is connectivity + faucet — the risky,
uncontrollable part is isolated to the last step.

---

## 1. The deploy script (B5.1) — WRITTEN, not yet run

**Update:** `app/src/scripts/deploy.ts` now exists (+ `"deploy"` npm script in
`app/package.json`), wiring `deployContract()` → `writeDeployment()`. It has NOT
been type-checked or run yet (the current machine is broken). On the healthy
machine, `npm run build --workspace=app` type-checks it before first use.

Context for why it was needed: `app/src/api/testigo.ts` exports
`deployContract()` and `app/src/config/deployment.ts` exports
`writeDeployment()`, but no CLI wired them. `app/src/config/deployment.json` is
still the `null` placeholder, and every network script calls
`requireDeployment()`, which throws:

> `No deployed contract: …/deployment.json is still a placeholder. Run the deploy script (B5.1) before this step.`

What the script does is specified in §4; it is small because the API already
does the work.

---

## 2. Prerequisites (on the healthy machine)

- [ ] Node.js 22+ (`.nvmrc` present — `nvm use`)
- [ ] Docker Desktop running (`docker info`, `docker compose version`)
- [ ] Compact compiler installed + `compact update` run
      (`compact compile --version` must respond — see docs/02 §1)
- [ ] Repo bootstrapped: `npm install` at root (installs all workspaces)
- [ ] `.env` created from `.env.example` (see §3 for the local seed)

---

## 3. Local devnet + funding

### 3.1 Bring up the devnet (use the `midnight-tooling:devnet` skill)

```bash
# generate a compose file with latest devnet-compatible versions
/midnight-tooling:devnet generate

# start node + indexer + proof server
/midnight-tooling:devnet start

# confirm all three answer
/midnight-tooling:devnet health
```

Expected endpoints (must match `app/src/config/networks.ts` → `LOCAL`):

| Service | URL |
|---|---|
| Node RPC (ws) | `ws://localhost:9944` |
| Indexer GraphQL | `http://localhost:8088/api/v4/graphql` |
| Indexer WS | `ws://localhost:8088/api/v4/graphql/ws` |
| Proof server | `http://localhost:6300` |

> If the devnet skill's proof server lands on a different port, override with
> `PROOF_SERVER=` in `.env` — `activeNetwork()` honors it.

### 3.2 Funding — **the item to verify, not assume**

`LOCAL.faucet` is `undefined` in `networks.ts`, and `NetworkExecutor.deploy`
calls `walletProvider.start(waitForFunds = true)`, which on Preview blocks on
the faucet. **On local there is no faucet**, so funding must come from a
**genesis-funded seed** baked into the devnet's chain spec.

Before the deploy script is run on local, confirm ONE of:

- [ ] The local devnet's genesis funds a **known seed**; put that seed in `.env`
      as `DEPLOY_SEED=` (verify against the compose/chainspec the devnet skill
      generated, or `@midnight-ntwrk/testkit-js`'s `LocalTestConfiguration` /
      `GENESIS_MINT_WALLET_SEED` — **do not invent one**).
- [ ] OR the deploy script must call `start(false)` on local and the wallet is
      pre-funded by another mechanism.

**Action item:** verify the genesis seed source in testkit-js 4.1.1 and record
it here before running. This is the single most likely thing to block the local
deploy.

### 3.3 `.env` for local

```dotenv
NETWORK=local
DEPLOY_SEED=<genesis-funded 64-hex seed for the local devnet>   # see §3.2
PROOF_SERVER=http://localhost:6300
```

---

## 4. The deploy script (B5.1) — as written

`app/src/scripts/deploy.ts` + `"deploy": "node dist/scripts/deploy.js"` in
`app/package.json`. It follows this flow (all primitives already existed):

```
1. import '../config/init.js'            // sets global networkId (setNetworkId)
2. read activeNetwork()                   // fail fast if NETWORK unknown
3. guard: if readDeployment() != null, refuse unless --force
   (avoid clobbering an existing deploy; use clearDeployment() behind --force)
4. deployContract({ waitForFunds: true }) // from api/testigo.ts
      → NetworkExecutor.deploy → deployContract<TestigoContract>(...)
      → returns { contractAddress, deployTxId }
5. compilerVersion = readCompilerVersion()   // from contracts/output/compiler/contract-info.json
6. writeDeployment({
     network: activeNetwork().name,          // 'local'
     contractAddress,
     deployTxId,
     compilerVersion,
   })                                         // fills deployedAt itself
7. print address + txId + path; close the wallet (executor.close())
```

Notes pinned from the code:
- `deployContract` needs the **ZK proving keys**, so the contract must be
  compiled **with keys** (`npm run compile`, NOT `compile:fast`). `createProviders`
  runs `assertZkArtifacts()` and will throw if `contracts/output/keys/` is absent.
- `writeDeployment` always writes to the **source** file
  `app/src/config/deployment.json` (committed), never a `dist/` copy — see
  `deploymentFilePath`.
- Deploy is the ONLY step that needs `waitForFunds: true`; all later scripts
  connect with `start(false)`.

**Deliverable of this step:** `deployment.json` on disk with
`network: "local"`, a real `contractAddress`, `deployTxId`, `deployedAt`,
and the compiler version — committed to `dev`.

---

## 5. Run the full E2E against local

```bash
npm run compile                 # contract WITH keys → contracts/output/
npm run build --workspace=app   # tsc → app/dist
NETWORK=local npm run deploy --workspace=app          # §4, writes deployment.json
NETWORK=local npm run e2e --workspace=app -- --network
```

`e2e --network` runs the 4 acts against the deployed contract with real proving
(`app/src/scripts/e2e.ts`):

1. **Act 1** — `registerOrganization` + `issueCredential` (client hands only the
   commitment).
2. **Act 2** — `report` sealed to the current epoch; prints `reportId` + `nullifier`.
3. **Act 3** — second report same epoch → `RepeatedNullifierError`, rejected at
   proof time, **no tx submitted**.
4. **Act 4** — `revealAuthorship` to a prosecutor; export verifies ✅ for the
   prosecutor and ❌ for the employer.

Exit 0 + `E2E: the 4 acts completed ✔` = local deploy is real.

### Acceptance checklist

- [ ] `deployment.json` has `network: "local"` and a non-null address
- [ ] Act 2 prints a `blockHeight` (came from the real node, not `(simulated)`)
- [ ] Act 3 rejects with `already reported this period` and submits nothing
- [ ] Act 4: prosecutor ✅ / employer ❌
- [ ] `readLedgerState()` at the end reads through the **indexer** (proves the
      indexer path works — "NO READS WITHOUT INDEXER", docs/02 §Services)

---

## 6. UI integration against local (optional this pass)

Once `deployment.json` points at the local contract, the UI's service layer can
be pointed from `ClienteMock` at the real `@phantomtrace/app`. This is Block C's
"integration pending" item. Defer if time is short — the CLI E2E is the gate;
the UI can stay on the mock for the video's Explorer side.

---

## 7. Teardown / retry

```bash
/midnight-tooling:devnet stop --remove-volumes   # wipes chain + indexer state
# then re-run from §3.1; reset deployment.json with clearDeployment (--force on deploy)
```

Because state is disposable, iterate freely on local until every box in §5 is
checked.

---

## 8. Promotion to Preview (what changes — later, separate step)

Same script, three differences:

1. `.env`: `NETWORK=preview`, `DEPLOY_SEED=` a seed funded via the **Preview
   faucet** (`https://faucet.preview.midnight.network/api/drips`).
2. `deployContract` blocks on the faucet in `start(true)` — allow minutes.
3. `deployment.json` records `network: "preview"` and is committed.

Everything validated in §5 carries over unchanged. **Do not deploy to Preview
until local §5 is fully green.**

---

## 9. Open risks (ranked)

1. **Local genesis funding (§3.2)** — highest. No faucet on local; need the
   real genesis seed. Verify before anything else.
2. **Compiler / SDK version drift** — `readCompilerVersion` records whatever
   generated the keys; `findDeployedContract` rejects a stale address after a
   recompile. Recompile → redeploy, never reuse an old address.
3. **`waitForFunds` semantics on local** — if `start(true)` hangs waiting for a
   non-existent faucet, the deploy script may need `waitForFunds:false` on local
   with a pre-funded genesis seed. Decide alongside §3.2.
4. **Proof server port** — devnet skill may not use 6300; override via
   `PROOF_SERVER` env.

---

## 10. Task list (for `dev`)

- [ ] Verify local genesis seed source (§3.2) and record it
- [ ] Write `app/src/scripts/deploy.ts` + `deploy` npm script (§4)
- [ ] Bring up local devnet, health green (§3.1)
- [ ] `npm run compile` (with keys) + `npm run build --workspace=app`
- [ ] `NETWORK=local npm run deploy` → commit `deployment.json` (local)
- [ ] `NETWORK=local npm run e2e -- --network` → §5 checklist all green
- [ ] (optional) UI against local app (§6)
- [ ] Only then: plan the Preview deploy (§8)
