# 06 — Improvements backlog

> Findings from an external audit run on Fri 7/8 (~20:30): official Midnight docs,
> npm registry, Docker Hub tags, the eight competing repos published today under the
> `midnightntwrk` topic, and this repository's own source.
>
> **Revised ~21:15 after a second verification pass.** The first draft of this file
> over-rated several items. Four were downgraded or dropped once their premises were
> actually checked against the tree — the reasoning is kept at the bottom so nobody
> re-raises them. What survives is one item that genuinely matters and two cheap
> deck wins.
>
> **The honest headline: this project does not need most of this. It needs B5.**
> `app/src/config/deployment.json` is still all `null`. Engineering + QA is 55% of
> the rubric, and our own analysis of prior editions concluded that a real deploy
> was the difference between the $3,500 winner and the $500 one. Nothing in this
> file moves that. Treat it as a place to stop thinking about these findings until
> the contract is live.

| Owner | Load | Items |
|---|---|---|
| **snattydev** | ~15 min | S1 — the only thing here that matters |
| **gabosawn** | ~10 min | G1 · G2 — deck lines, no code |
| **Juan** | **nothing** | On the critical path (B5). See §3. |

---

## Section 1 — snattydev · the one item worth doing now

### S1 · P1 · Declare the anonymity set is countable, and bounded per organization

- [ ] **P1** Add to the declared-limitations section of `contracts/README.md` (~134-151)

**This is a product-level weakness, not a code defect, and it is currently
undeclared.**

A whistleblower's anonymity set is **not** bounded by the tree depth (8 → 256
leaves globally). It is bounded by how many credentials **that specific
organization** issued — and that number is publicly countable, because `orgId`
travels in the clear:

- `issueCredential(orgId, credCommitment)` — `contracts/src/testigo.compact:167`
- `report(orgId, period)` — `contracts/src/testigo.compact:175`

The only witnesses are `credentialSecret`, `credentialPath`, `personalSecret`,
`evidenceHash` (lines 65-76). `orgId` is a public circuit argument in both, so any
observer can count issuances per organization straight off the indexer.

**Why it matters more than it sounds.** A company with three registered employees
leaves the reporter effectively identified, *even though the Merkle proof is
cryptographically perfect*. That is not an edge case — the small organization where
reporting exposes you is the most common and most delicate use of a whistleblowing
product. The README already declares that a cached Merkle path narrows the
anonymity set (line 148); this is a sharper, structural version of the same class of
leak, and it is not there.

Two acceptable exits, pick either:

1. **Declare it.** A judge who finds this themselves after reading "anonymous
   whistleblowing" leaves with a worse impression than one who reads it in our own
   limitations section.
2. **Mitigate it.** Require a minimum number of issued credentials before `report`
   is allowed against an organization. More work; only if there is time after B5.

**✓ Acceptance:** the limitation is written in `contracts/README.md`, phrased as a
bound on the anonymity set, not as a vague privacy caveat.

---

## Section 2 — gabosawn · two deck lines, zero code

### G1 · P2 · Claim the `blockTime` property the contract already has

- [ ] **P2** One sentence in the deck

`contracts/src/testigo.compact:189-190`:

```
assert(blockTimeGte(disclose(windowStart as Uint<64>)), "period not started yet");
assert(blockTimeLt(disclose(windowEnd as Uint<64>)), "period already over");
```

A report is only valid inside its time window, **enforced inside the circuit — no
oracle, no trusted clock**. One of today's competitors (asfalia, "proof of solvency
that expires") sells exactly this property as its headline moment. We already have
it and say it nowhere. Free.

### G2 · P2 · Prior art with today's actual competitors

- [ ] **P2** Update the prior-art slide

Eight teams published today under the `midnightntwrk` topic. Closest to us is
**velo** — ZK attestation of forensic verdicts, evidence sealed locally. Name it
precisely: velo proves *a verdict is legitimate*; it does not do deferred
authorship. **Nobody in the field has deferred authorship** — the differentiator
holds, and describing a competitor accurately is what makes that claim credible.

Worth knowing internally: `midnight-mail` already deployed to Preprod with a real
contract address and block numbers. That is the Engineering axis, and it is the one
place we are behind.

Sentence pattern borrowed from velo, applicable to the nullifier and the domain
separation:

> It is not a code-review convention. It is a circuit constraint: a report that
> violates it cannot be produced at all.

---

## Section 3 — Juan · deliberately empty

**No items assigned until `deployment.json` has a real contract address.**

Juan owns `app/` and B5 is the critical path. The two items that live in his area
were both downgraded below the value of one hour of deploy work, and one of them
turns into a troubleshooting entry rather than a task:

### Runbook, not a task — if the Preview deploy fails reading ledger state

If `NETWORK=preview` produces a GraphQL error when reading contract state, the
likely cause is the indexer's no-offset path. `queryContractState` is called with
no offset in three places:

| File | Line |
|---|---|
| `app/src/api/ledger.ts` | 63 |
| `app/src/api/executor-network.ts` | 216 |
| `app/src/config/smoke.ts` | 169 |

and `app/src/config/providers.ts:256-257` builds the provider with no wrapper:

```ts
export const buildPublicDataProvider = (network: NetworkConfig): PublicDataProvider =>
  indexerPublicDataProvider(network.indexer, network.indexerWS);
```

`DEFAULT_NETWORK` is `'preview'` (`app/src/config/networks.ts:63`), so this is the
default path, not an opt-in.

**Fix if it fires:** a patched provider that issues the query directly, omitting the
`offset` field entirely, delegating everything else to the SDK object:

```graphql
query LATEST_STATE($address: HexEncoded!) {
  contractAction(address: $address) { state }
}
```

~15 lines. **Honest status:** this failure has **not** been reproduced against
Preview by anyone here. The source is `.agents/skills/indexer/SKILL.md`, which comes
from a third-party skill pack (`Kali-Decoder/Midnight-skills`), not from
midnightntwrk. What was verified is that our code has the shape the skill warns
about — not that the bug fires. Do not spend deploy time pre-patching it; know where
the fix is if the error appears.

---

## Post-deploy backlog

Only after the contract is live. Both are optional.

- [ ] **P3** *(snattydev)* Repair the transcript-privacy test.
      `contracts/test/transcript-org-anonimato.mjs` exists untracked and broken —
      it was written against the pre-translation Spanish API and dies at import with
      `does not provide an export named 'EPOCA'`. It is a rename, not a rewrite:
      `nuevoMundo`→`newWorld`, `callComo`→`callAs`, `resumen`→`summary`,
      `EPOCA`→`EPOCH`, and the circuit names `denunciar`→`report`,
      `registrarOrganizacion`→`registerOrganization`,
      `emitirCredencial`→`issueCredential`, `hojaDe`→`leafOf`,
      `credCommitmentDe`→`credCommitmentOf` (confirmed in
      `tests/src/harness/contract-surface.ts:49-53`).
      It belongs in `contracts/test/`, **not** `tests/src/` — `TestigoHarness`
      (`tests/src/harness/types.ts`) has no transcript concept and `ModelHarness`
      cannot have one (plain JS, never executes a circuit). Precedent:
      `contracts/test/sec-audit.mjs` block A already reads `r.proofData`.
      **Value, stated honestly:** it is QA evidence you can show a judge, and a net
      against a future refactor. It is *not* a privacy defense — see the downgrade
      note below.

- [ ] **P3** *(Juan)* Settle `@midnight-ntwrk/wallet-sdk`, pinned at `1.1.0`
      (`app/package.json:28`). The claim that Preview requires `1.2.0` is
      unverified. Trap if anyone checks: npm's `latest` dist-tag points at `1.1.0`
      even though `1.2.0` is published, so `npm view … version` returns the wrong
      answer — use `versions --json` plus the official support matrix.

- [ ] **P3** *(snattydev)* Roadmap slide only: optional/threshold membership via an
      invalid dummy path, and revocation via period-bound leaves + re-attestation
      instead of a blocklist. The second attacks the already-declared "no
      revocation" limitation.

---

## Downgraded and dismissed — with reasons, so nobody re-raises them

| Finding | Verdict |
|---|---|
| **"The docs over-claim that the organization is hidden" — dropped** | **Checked, they don't.** `docs/00-idea.md:40` says "Identity, credential, and evidence never touch the chain", which is literally true and never mentions the org. §5 already declares "On-chain anonymity is verified; off-chain has known limits", and `contracts/README.md:148` already declares that a revealed Merkle root narrows the anonymity set. The docs were more honest than the audit assumed. At most, spot-check the UI split panel. |
| **Transcript test as a privacy defense — downgraded to P3** | The test proves the disclosed Merkle root is identical across organizations. But `orgId` is *already* a public argument of `report` (`testigo.compact:175`), so the organization leaks via the argument regardless of tree design. A global tree buys no marginal org privacy over a per-org tree. Real value is QA evidence, not protection. |
| **Indexer offset bug as P1 — downgraded to a runbook entry** | The code shape was confirmed; the failure was not reproduced. Source is a third-party skill pack, not official Midnight docs. Cheap to fix *if* it fires; not worth pre-emptying deploy time. |
| **Missing DUST poll before deploy** | **False.** `deployContract({ waitForFunds: true })` → `walletProvider.start(true)` already blocks until funded, at `app/src/api/executor-network.ts:152-164`, before the first deploy call. |
| **`docs.midnight.network/compact/merkle-membership-privacy`** | **404.** The page does not exist, in the sitemap or the nav. A third-party probe cites it; do not cite it ourselves. |
| **Legacy `wallet` / `wallet-api` / `zswap` in package.json** | Absent across all six manifests. Clean — just don't let an old tutorial talk anyone into adding them alongside `ledger-v8`. |
| **"B1–B5 not started" (`docs/04-bloque-b-pasos.md`)** | Stale. B1–B4 are done — `app/src/scripts/` holds 8 scripts including `deploy.ts` and `e2e.ts`. Only B5 remains. |
