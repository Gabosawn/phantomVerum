# 01 — Architecture and circuit spec

> Prerequisite: `00-idea.md`. This document specifies **semantics**, not
> syntax. Read §8 before writing a line of Compact.
>
> **As-built note (integration, 2026-08-07):** the authority on names, types
> and semantics is the compiled contract — `contracts/src/testigo.compact`
> and its generated `contracts/output/contract/index.d.ts`. This spec was
> written before the blocks were built and has been corrected where the
> implementation resolved its ambiguities: the nullifier is keyed on
> `credentialSecret` (§5, Option A), the report id on `personalSecret`;
> `period` is a **blockTime-bound epoch index** (Uint<64>, 86400-second
> epochs), not a free label; credentials live in a global on-chain
> `HistoricMerkleTree` and the issuer only ever receives a **commitment**
> of the credential secret, never the secret itself.

---

## 1. Actors

| Actor | Role | What they see |
|---|---|---|
| **Organization** (ACME Inc.) | Registers the credential anchor; issues credentials to employees (mock) | The public ledger. Never knows who reported |
| **Whistleblower** (the witness) | Reports proving membership; months later proves authorship | Everything of theirs: credential, secret, evidence |
| **Proof server** | Generates ZK proofs | The witnesses — that's why it runs **locally** |
| **Midnight Ledger** | Stores hashes, nullifiers, and authorships | Only hashes. Neither identity nor evidence |
| **Prosecutor** (designated verifier) | Receives the authorship proof tied to their key | What the whistleblower reveals + the ledger |

## 2. End-to-end flow (the 4 stages of the demo)

```
T1. ACME registers: publishes the credential anchor on the ledger.
    ACME issues (mock) a credential to each employee, off-chain.

T2. An employee discovers fraud. Opens PhantomTrace, loads the evidence.
    The app calls report via the LOCAL proof server:
      - verifies the credential PRIVATELY against ACME's anchor
      - publishes: reportId = H(evidence ‖ secret)  ← the seal
                   nullifier  = H(dom ‖ credentialSecret ‖ period)  ← anti-spam
    ACME looks at the ledger: sees there IS a report. Cannot know who made it.

T3. ACME tries to alter the evidence. Cannot: the hash is sealed
    on-chain with its position in the chain. Any alteration won't match.

--- months later: the employee wants legal protection / reward ---

T4. The prosecutor sends a fresh nonce off-chain. The whistleblower calls
    revealAuthorship(reportId): proves they know the preimage of reportId
    (only the author knows it) and writes a receipt bound to THAT nonce.
    Nothing secret is handed over, and the prosecutor cannot mint a receipt
    for a nonce of their own. Verification happens off-chain with a
    package the whistleblower hands to the prosecutor; whoever holds that
    package can verify, so it goes only to the chosen prosecutor.
```

## 3. Ledger state (public)

```
ledger organizations: Map<Bytes<32>, Bytes<32>>       // orgId → issuer anchor (metadata)
ledger credentials:   HistoricMerkleTree<16, Bytes<32>> // global tree of credential leaves
ledger reports:       Set<Bytes<32>>                  // sealed reportIds
ledger nullifiers:    Set<Bytes<32>>                  // anti-spam per epoch
ledger authorships:   Set<Bytes<32>>                  // H(dom ‖ reportId ‖ prosecutorNonce) — no secret in the preimage
```

Everything else — credential, secret, evidence — is witness: never leaves the
whistleblower's machine (except to their local proof server).

## 4. The three circuits

### 4.1 `registerOrganization(orgId, anchor)` — trivial

Inserts `orgId → anchor` in `organizations`. Fails if it already exists. No
witnesses. Acts as scaffolding for the rest of the contract.

### 4.2 `report` — the core

**Arguments:** `orgId`, `period` — the **epoch index**
(`floor(blockTime / 86400)`, Uint<64>). The circuit rejects any period that
is not the epoch in progress, otherwise the nullifier would be evadable by
inventing labels.

> **What is actually disclosed on-chain.** A circuit argument is *not* a public
> input unless it crosses `disclose()` / a ledger op. `report` discloses only
> the epoch window, the global credential-tree root, the nullifier and the
> reportId — **not `orgId`**. `orgId` is public only via
> `registerOrganization` / `issueCredential`, which disclose it directly.
> (Verified against the ledger `zkir` crate: `num_inputs` is witness arity,
> `declare_pub_input` is the sole path to a public input, and the on-chain
> `ContractCall` carries a hiding `communication_commitment`, not the raw args.
> A prior note claimed `orgId` was public "because `num_inputs: 3`" — that
> conflated argument arity with public inputs.)
**Witnesses:** `credentialSecret` + `credentialPath` (see §5),
`personalSecret` (persistent), `evidenceHash` (the app hashes the file
locally; the circuit receives the hash).

**Constraints:**

```
C0. assert(period is the CURRENT epoch)                  // blockTimeGte/blockTimeLt
C1. validCredential(credentialSecret, credentialPath)    // Merkle membership, see §5
C2. assert(!nullifiers.member(nullifier))                // one report per epoch
```

**Derived values (each hash carries its own domain tag in position 0):**

```
reportId   = H(dom ‖ evidenceHash ‖ personalSecret)        // the seal; only the author knows the preimage
nullifier  = H(dom ‖ credentialSecret ‖ period)            // one report per (credential, epoch)
```

The split of secrets is deliberate: the **nullifier** uses
`credentialSecret`, so anti-spam cannot be defeated by minting fresh
personal secrets; the **reportId** uses `personalSecret`, which the mock
issuer never sees, so authorship stays unforgeable by the org.

**Effects:**

```
reports.insert(disclose(reportId))
nullifiers.insert(disclose(nullifier))
```

The nullifier prevents someone from drowning the channel with a thousand fake
reports, without identifying anyone: different periods → unlinkable nullifiers.

### 4.3 `revealAuthorship(reportId)` — the differentiator

**Public inputs:** `reportId`.
**Witnesses:** `evidenceHash`, `secret` — the same ones from the report —
plus `prosecutorNonce`, the value the prosecutor generated and sent over.
It is a witness and not a public argument on purpose: a public nonce would
land in the transaction transcript, and anyone who scraped the pair
`(reportId, nonce)` could recompute the receipt and pass themselves off as
its addressee.

```
C1. assert(H(evidenceHash ‖ secret) == reportId)   // only the author can
C2. assert(reports.member(reportId))               // the report exists

authorships.insert(disclose(H(dom ‖ reportId ‖ prosecutorNonce)))
```

**Why the secret is not in the preimage (audit 2026-08-08):** the ZK proof
above is what establishes authorship — the chain checks it. The hash only has
to be recomputable by the prosecutor and by nobody else, so putting `secret`
inside it bought nothing and cost everything: it was the sole reason the
whistleblower had to hand the secret over, which handed over the ability to
republish the authorship to anyone. With `H(dom ‖ reportId ‖ prosecutorNonce)`
the prosecutor recomputes from the public `reportId` and their own nonce, and
**cannot** mint a receipt under a different nonce: that needs C1, and C1 needs
the secret. Verified by execution in `contracts/test/receipt-authorship.mjs`.

⚠️ **This is still NOT a designated-verifier scheme** (the name this carried
until the 2026-08-08 audit was doing more work than the construction). A real
one requires the designated party to be able to simulate an indistinguishable
proof with their own nonce, so a forwarded proof convinces nobody. Here the
receipt verifies against public data — `proveAuthorship.zkir` contains no
`member` opcode — so it is publicly verifiable and **transferable once the
nonce is shared**. What the binding buys is per-recipient separation, not
control over who ends up convinced.

**Honest scope:** the binding is one per nonce, and the receipt is publicly
verifiable by anyone the prosecutor forwards the nonce to — so it is
transferable once handed over. What the design guarantees is narrower and
real: nothing secret ever travels, the on-chain artifact names no one, and a
holder of the exported package cannot designate themselves (the nonce is not
in it). Cryptographic non-transferability — a designated-verifier tag the
prosecutor could have simulated, e.g. Diffie–Hellman over the whistleblower's
published point and the prosecutor's private key — is roadmap.

## 5. The credential — two options, in order of preference

The issuer is a **declared mock** (same as all comparable projects). What needs
to be decided during implementation, with the installed stdlib in view, is the
in-circuit verification mechanism. Two options, in order of preference:

**Option A — Merkle membership (preferred, ecosystem standard) — AS BUILT:**
a single global on-chain `HistoricMerkleTree` holds all issued credential
leaves; `anchor` is issuer metadata. The employee generates
`credentialSecret` locally and hands the issuer only its **commitment**
(`H(dom ‖ credentialSecret)`); `issueCredential(orgId, commitment)` builds
the leaf `H(dom ‖ orgId ‖ commitment)` **in-circuit** from the orgId it just
validated, so a leaf cannot be smuggled in for an unregistered org. It also
asserts `organizations.lookup(orgId) == H(dom ‖ issuerSecret)` — the `anchor`,
which used to be metadata no circuit read, is now the credential channel's
access control.
`report` rebuilds the leaf in-circuit from the public `orgId` and the
`credentialSecret` witness, and verifies membership with the
`credentialPath` witness (siblings only — the witness cannot choose which
leaf gets proven). Depth is 16 (65 536 credentials): depth 8 was a permanent
kill switch, since `issueCredential` fills a finite tree on an immutable
contract — hence the issuer check below. The nullifier uses `credentialSecret`
and NOT `orgId` → one credential = one report per epoch, however many
organizations it is enrolled in.
Correct and defensible.

**Option B — ⚠️ NO LONGER A FALLBACK (see `contracts/src/fallback/testigo-b.compact`).**
It was one while its arities matched A's. It deliberately did not follow the
2026-08-08 v2 fixes, so it still carries what they closed: `orgId` in the
nullifier over a *free* `Bytes<32>` period (unbounded reports per credential),
and `personalSecret` inside the authorship hash (the prosecutor must be handed
the secret — finding H-2). Switching to it would undo the audit. Kept because
it compiles and records the design that was considered. Described as designed:
the organization publishes `anchor = H(orgSecret)` and delivers the same
`orgSecret` to all employees (mock). The circuit verifies `H(orgSecret) ==
anchor`. Perfect anonymity within the org; **stated weakness:** whoever has the
secret can generate N nullifiers with N personal secrets (weak anti-spam) and
there is no revocation. Presented as a limit of the mock issuer, not of the
design.

**Decision rule:** try Option A first. If it doesn't compile in a reasonable
time, freeze B and move A to roadmap.

## 6. What each mechanism solves and does NOT solve

| Attack | Counter-mechanism | Resolved? |
|---|---|---|
| The company identifies the whistleblower on-chain | ZK membership + Midnight's senderless tx (no `msg.sender`, shielded fees) | ✅ |
| The company alters or repudiates the evidence | `reportId` sealed on-chain; altering the evidence breaks the hash | ✅ |
| A third party claims the report (steals the reward) | Only the author knows `(evidenceHash, secret)` — preimage of `reportId` | ✅ |
| The employer reuses/replays the authorship proof | The receipt is bound to the prosecutor's nonce, which is not in the package | ⚠️ partial — transferable once the nonce is forwarded, declared |
| Spam / drowning the channel with fake reports | Nullifier `H(dom ‖ credentialSecret ‖ epoch)`, epoch bound to blockTime, org-independent | ✅ (weak in Option B — declared) |
| Report with false content | **None.** We don't prove veracity — stated upfront | ❌ declared |
| Off-chain metadata (indexer sees viewing key/IP) | Local proof server + Tor/own node; fee-sponsor roadmap | ⚠️ mitigated, declared |
| Timing correlation (report at 3 AM, only Juan was online) | Out of scope; coarse periods help | ⚠️ declared |

## 7. Out of scope (do not implement)

- Real credential issuer (corporate directory, employer signature) → roadmap.
- E2E encryption of evidence to prosecutor → stretch, if time permits.
- Credential revocation.
- On-chain rewards / tokens.
- Multi-chain, custom indexer, fee-sponsor (→ roadmap in the deck).

## 8. Mandatory note on Compact syntax

The pseudocode below is **illustrative**. The syntax changes between versions
(e.g. `disclose()` is mandatory for publishing witness-derived values).
**Mandatory procedure, in this order:**

1. Compile an **official template untouched** first.
2. Read what syntax *that* template uses: `pragma`, standard library imports,
   types, hash signatures.
3. Adapt this specification to that syntax. **Adapt the syntax, never the
   semantics.**

Do not invent APIs. If `persistentHash` doesn't exist with that name or arity,
use whatever the installed standard library exposes. Also verify: whether
Compact exposes time/block height (for sealing) or whether fine-grained
timestamp is left as inclusion order + `period` as a public input.

```compact
// PSEUDOCODE — adapt to the installed version. See §8.
// HISTORICAL: kept as originally frozen. The shipped contract diverges where
// this spec was ambiguous or weak — domain tags on every hash, the global
// credential tree + commitments (§5 as-built), and the blockTime-bound
// epoch check. contracts/src/testigo.compact is the authority.

export ledger organizations: Map<Bytes<32>, Bytes<32>>;
export ledger reports: Set<Bytes<32>>;
export ledger nullifiers: Set<Bytes<32>>;
export ledger authorships: Set<Bytes<32>>;

witness credentialSecret(): Bytes<32>;
witness merklePath(): /* per installed stdlib — Option A only */;
witness personalSecret(): Bytes<32>;
witness evidenceHash(): Bytes<32>;

export circuit registerOrganization(orgId: Bytes<32>, anchor: Bytes<32>): [] {
  assert(!organizations.member(orgId), "organization already registered");
  organizations.insert(orgId, anchor);
}

export circuit report(orgId: Bytes<32>, period: Bytes<32>): [] {
  const cred = credentialSecret();
  const sec  = personalSecret();
  const ev   = evidenceHash();

  // C1 — membership (Option A: verify merklePath against organizations[orgId])
  assertValidCredential(cred, organizations.lookup(orgId));

  const nul = persistentHash<...>([sec, orgId, period]);
  assert(!nullifiers.member(disclose(nul)), "already reported this period");

  const id = persistentHash<...>([ev, sec]);

  reports.insert(disclose(id));
  nullifiers.insert(disclose(nul));
}

export circuit revealAuthorship(reportId: Bytes<32>): [] {
  const sec = personalSecret();
  const ev  = evidenceHash();

  assert(persistentHash<...>([ev, sec]) == reportId, "not the author");
  assert(reports.member(reportId), "report does not exist");

  authorships.insert(disclose(persistentHash<...>([domReceipt(), reportId, nonce])));
}
```
