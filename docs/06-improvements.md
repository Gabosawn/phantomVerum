# 06 — Improvements backlog

> Findings from an external audit run on Fri 7/8 (~20:30): official Midnight docs,
> npm registry, the Docker Hub tags, the eight competing repos published today under
> the `midnightntwrk` topic, and this repository's own source.
>
> **Every item below was re-verified against the current tree after the English
> translation.** One finding from the first pass turned out to be false and is
> recorded as such at the bottom — do not re-investigate it. Every `file:line`
> reference here was opened and confirmed; if one drifts, fix the reference rather
> than deleting the item.
>
> Split by owner so nobody has to read the other two sections. Priorities are
> **P1** (before the Preview deploy), **P2** (today), **P3** (roadmap slide only).

| Owner | Area | Items |
|---|---|---|
| **Juan** | `app/` — Block B wiring | J1 · J2 |
| **snattydev** | `contracts/`, test suites | S1 · S2 · S3 |
| **gabosawn** | docs, UI, deck | G1 · G2 · G3 |

---

## Section 1 — Juan (`app/`)

### J1 · P1 · Patch the indexer `offset: null` bug

- [ ] **P1** Wrap `buildPublicDataProvider` so "read latest contract state" never hits the SDK's no-offset path

**Why this is first.** This is the only finding that can cost the deploy. The bug
does **not** reproduce against a local devnet — it only fires against the *hosted*
Preview/Preprod indexers. So it stays invisible through every local test and then
surfaces during the real deploy looking like "the contract isn't readable", which is
the worst possible moment to start debugging it.

**Where it lives.** `app/src/config/providers.ts:256-257` builds the provider with
the SDK default and no wrapper:

```ts
export const buildPublicDataProvider = (network: NetworkConfig): PublicDataProvider =>
  indexerPublicDataProvider(network.indexer, network.indexerWS);
```

`queryContractState` is then called with no offset argument in three places:

| File | Line |
|---|---|
| `app/src/api/ledger.ts` | 63 |
| `app/src/api/executor-network.ts` | 216 |
| `app/src/config/smoke.ts` | 169 |

Aggravating factor: `app/src/config/networks.ts:63` sets
`DEFAULT_NETWORK = 'preview'`, so the hosted indexer is the default path, not an
opt-in.

**The fix.** `.agents/skills/indexer/SKILL.md` §2 documents it: calling
`contractAction` / `queryContractState` *without* an offset triggers an internal
error on the hosted indexers. Passing an explicit `offset` works, and so does a
plain GraphQL query that omits the field entirely. Use the latter for "get latest":

```graphql
query LATEST_STATE($address: HexEncoded!) {
  contractAction(address: $address) { state }
}
```

Wrap it as a patched provider (delegate everything else to the SDK object) so the
three call sites stay unchanged. Roughly 15 lines.

**✓ Acceptance:** with `NETWORK=preview`, reading ledger state returns the state
without a GraphQL error. Ideally add the failing-then-passing check to
`app/src/config/smoke.ts`, which already reports on this exact call.

### J2 · P2 · Settle the `wallet-sdk` version

- [ ] **P2** Verify against the official support matrix, then pin deliberately

`app/package.json:28` pins `@midnight-ntwrk/wallet-sdk` at `1.1.0`. The audit
reported that the Preview support matrix asks for `1.2.0`, but **that could not be
confirmed from inside this repo** — treat it as unverified until someone opens
`docs.midnight.network/relnotes/support-matrix` and reads the Preview row.

Important trap: npm's `latest` dist-tag for this package points at `1.1.0` even
though `1.2.0` is published, so `npm view @midnight-ntwrk/wallet-sdk version`
returns the wrong answer. Use `npm view … versions --json` and the matrix, not
`latest`.

**✓ Acceptance:** the chosen version and its source are written into
`docs/02-entorno.md`, so nobody re-litigates it.

> **Verified clean — no action, just don't undo it.** No `@midnight-ntwrk/wallet`,
> `wallet-api` or `zswap` appears in any of the six `package.json` files. Those are
> the previous generation (unpublished for ~a year); mixing them with `ledger-v8`
> risks loading two WASM ledger implementations at once. If a snippet from an older
> tutorial tells you to add them, don't.

---

## Section 2 — snattydev (`contracts/`, tests)

### S1 · P1 · Repair and wire up the transcript-privacy test

- [ ] **P1** Fix the broken file, translate it, hook it into `contracts/package.json`

**State.** `contracts/test/transcript-org-anonimato.mjs` exists **untracked and
broken**. It was written against the pre-translation Spanish API and currently dies
at import time:

```
SyntaxError: The requested module './harness.mjs' does not provide an export named 'EPOCA'
```

**This is a rename, not a rewrite** — the harness shape did not change, only its
identifiers:

| Broken | Current |
|---|---|
| `nuevoMundo` | `newWorld` |
| `callComo` | `callAs` |
| `resumen` | `summary` |
| `EPOCA` | `EPOCH` |
| `'denunciar'` | `'report'` |
| `'registrarOrganizacion'` | `'registerOrganization'` |
| `'emitirCredencial'` | `'issueCredential'` |
| `hojaDe` | `leafOf` |
| `credCommitmentDe` | `credCommitmentOf` |

(The last two confirmed in `tests/src/harness/contract-surface.ts:49-53`.) The file
should also be translated to English — it is currently the only Spanish file in
`contracts/test/`.

**Where it belongs: `contracts/test/`, not `tests/src/`.** This is a deliberate
architectural call, not convenience. `TestigoHarness`
(`tests/src/harness/types.ts`) has no concept of a transcript, and `ModelHarness`
*cannot* have one — it is plain JS reimplementing the spec, it never executes a
circuit, so there are no opcodes to emit. Exposing `proofData` through that
interface would break the model↔contract symmetry that is the entire reason that
layer exists — the same reasoning `types.ts` already used to exclude the Merkle root
from `LedgerSnapshot`. The precedent for the low-level approach already exists:
`contracts/test/sec-audit.mjs` block A reads `r.proofData` to document the
disclosure surface.

**What it asserts** — three checks, and the third is deliberately inverted:

1. The opcode *shape* is identical between two organizations. If the sequence of
   operations differed, merely looking at the transcript's shape would tell two
   reporters apart.
2. **The disclosed Merkle root is byte-identical between organizations.** This is
   the load-bearing one. `checkRoot` compiles to `member` + `popeq`, and `popeq`
   writes its result into the public transcript. With a per-organization tree each
   caller would publish *its* root. With one global tree and the `orgId` folded into
   the leaf, everyone publishes the same one. Select it by `field` alignment so it
   is not confused with nullifier/reportId, which are `bytes`.
3. The **complete** transcript is *not* identical — and must not be. The nullifier
   and the reportId vary by construction: they are the anti-spam and sealing
   mechanism. If someone ever "fixes" the contract so the whole transcript matches,
   they broke the anti-spam, and this check is what catches it.

**✓ Acceptance:** appended to the `test` chain in `contracts/package.json` next to
`sec-audit.mjs`, green, and added as a row to the table in `contracts/README.md`
that documents what each test file proves.

### S2 · P1 · Declare the missing limitation: the anonymity set is countable

- [ ] **P1** Add it to the declared-limitations section of `contracts/README.md`

`contracts/README.md` (~134-151) declares six limitations. **This one is missing**,
and it is real and specific to this contract:

- `issueCredential(orgId, credCommitment)` — `contracts/src/testigo.compact:167`
- `report(orgId, period)` — `contracts/src/testigo.compact:175`

Both take `orgId` as a **public circuit argument** (the only witnesses are
`credentialSecret`, `credentialPath`, `personalSecret`, `evidenceHash`, lines
65-76). Any observer can therefore count how many credentials each organization
issued, straight off the indexer.

The consequence: a reporter's anonymity set is not bounded by the tree depth
(8 → 256 leaves *globally*) but by how many credentials **that specific
organization** issued. An org with one or two credentials leaves the reporter
effectively identified, even though the Merkle proof is formally perfect.

The project's own execution plan argues that preemptive honesty disarms the
technical judge. This is exactly that card — and a judge who finds it themselves
after we claimed anonymity is a much worse outcome.

**✓ Acceptance:** limitation written. Optionally add a roadmap line: require a
minimum number of issued credentials before `report` is allowed against an org.

### S3 · P3 · Roadmap ideas from the official forum

- [ ] **P3** Two design directions worth one roadmap slide, no code

1. **Optional / threshold membership** via a witness that returns a deliberately
   invalid dummy path when the caller is not a member — lets a circuit express
   "member of at least one of these" without a caller-varying boolean.
2. **Revocation via period-bound leaves + re-attestation** instead of a blocklist.
   A blocklist forces disclosing a stable value and destroys unlinkability; leaves
   tied to a period expire on their own. This attacks the already-declared "no
   revocation" limitation head-on.

---

## Section 3 — gabosawn (docs, UI, deck)

### G1 · P1 · Correct the privacy framing — the organization is NOT hidden

- [ ] **P1** Align README, `docs/00-idea.md`, and the UI split panel

**This is the item most likely to be broken live by a judge.**
`report(orgId, period)` takes `orgId` as a **public circuit argument**
(`contracts/src/testigo.compact:175`). The organization is public on every report,
regardless of how the Merkle tree is designed. No wording anywhere should suggest
otherwise.

What the design actually delivers — say precisely this instead:

- **Anti-spoofing.** The leaf is reconstructed *inside the circuit* from the
  declared `orgId`, so a witness cannot smuggle in another organization's
  credential.
- **Intra-organization anonymity.** Which employee of that org filed the report is
  hidden. That is the real, defensible claim.

Highest-risk surface is the UI's split panel ("what the chain sees / what never
leaves your machine") — it is precisely where an over-promise becomes visible and
falsifiable during the demo.

**✓ Acceptance:** no text in README, docs, UI copy, or deck claims the organization
is concealed.

### G2 · P2 · Claim the `blockTime` property already in the contract

- [ ] **P2** One deck line, zero code

`contracts/src/testigo.compact:189-190`:

```
assert(blockTimeGte(disclose(windowStart as Uint<64>)), "period not started yet");
assert(blockTimeLt(disclose(windowEnd as Uint<64>)), "period already over");
```

A report is only valid inside its time window, **enforced inside the circuit — no
oracle, no trusted clock**. One of today's competitors (asfalia, "proof of solvency
that expires") sells exactly this property as its headline moment. We already have
it and are not saying it anywhere.

### G3 · P2 · Prior art with today's actual competitors

- [ ] **P2** Update the prior-art slide with the eight repos published today

Eight teams published today under the `midnightntwrk` topic. Closest to us is
**velo** — ZK attestation of forensic verdicts, evidence sealed locally. Name it
precisely: velo proves *a verdict is legitimate*; it does not do deferred
authorship. **Nobody in the field has deferred authorship** — the differentiator
holds, and stating a competitor accurately is what makes the claim credible.

Also worth noting: `midnight-mail` already deployed to Preprod with a real contract
address and block numbers. That is the 40% Engineering axis, and it is the one place
we are behind.

Sentence pattern borrowed from velo, applicable to the nullifier and the domain
separation:

> It is not a code-review convention. It is a circuit constraint: a report that
> violates it cannot be produced at all.

---

## Dismissed findings — do not re-investigate

| Finding | Verdict |
|---|---|
| Missing DUST poll before deploy | **FALSE.** `deployContract({ waitForFunds: true })` → `walletProvider.start(true)` already blocks until funded, at `app/src/api/executor-network.ts:152-164`, before the first deploy call. |
| `docs.midnight.network/compact/merkle-membership-privacy` | **404.** The page does not exist, in the sitemap or the nav. A third-party probe cites it; do not cite it ourselves. |
| Legacy `wallet` / `wallet-api` / `zswap` in package.json | Absent across all six manifests. Clean. |
| "B1–B5 not started" (`docs/04-bloque-b-pasos.md`) | Stale. B1–B4 are done — `app/src/scripts/` holds 8 scripts including `deploy.ts` and `e2e.ts`. Only B5 remains: `app/src/config/deployment.json` is still all `null`. |
