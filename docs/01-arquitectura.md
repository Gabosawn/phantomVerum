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
                   nullifier  = H(secret ‖ orgId ‖ period)  ← anti-spam
    ACME looks at the ledger: sees there IS a report. Cannot know who made it.

T3. ACME tries to alter the evidence. Cannot: the hash is sealed
    on-chain with its position in the chain. Any alteration won't match.

--- months later: the employee wants legal protection / reward ---

T4. The whistleblower calls revealAuthorship(reportId, prosecutorPk):
    proves they know the preimage of reportId (only the author knows it)
    and binds the ON-CHAIN RECORD to the prosecutor's key — looked up with
    another key, that record is not on the ledger. Verification happens
    off-chain with a package the whistleblower hands to the prosecutor;
    whoever holds that package can verify, which is exactly why it goes
    only to the chosen prosecutor — and why forwarding it works too.
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

**Public inputs:** `orgId`, `period` — the **epoch index**
(`floor(blockTime / 86400)`, Uint<64>). The circuit rejects any period that
is not the epoch in progress, otherwise the nullifier would be evadable by
inventing labels.
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
nullifier  = H(dom ‖ credentialSecret ‖ period)             // one report per (credential, epoch)
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

### 4.3 `revealAuthorship(reportId, prosecutorPk)` — the differentiator

**Public inputs:** `reportId`, `prosecutorPk`.
**Witnesses:** `evidenceHash`, `secret` — the same ones from the report.

```
C1. assert(H(evidenceHash ‖ secret) == reportId)   // only the author can
C2. assert(reports.member(reportId))               // the report exists

authorships.insert(disclose(H(secret ‖ reportId ‖ prosecutorPk)))
```

**Why one record per prosecutor:** the authorship *record* is tied to *that*
prosecutor's key, so the value published for the prosecutor is not the value
the employer's key would look up — verify with the wrong key and the record is
simply not on the ledger.

⚠️ **This is NOT a designated-verifier scheme** (corrected after the
2026-08-08 audit; the name was doing more work than the construction). A real
one requires the designated party to be able to simulate an indistinguishable
proof with their own key, so that a forwarded proof convinces nobody. Here
`prosecutorPk` is just another public input and the proof verifies against the
public verifier key — `proveAuthorship.zkir` contains no `member` opcode. The
proof is therefore publicly verifiable and **transferable once handed over**.
What the binding buys is per-recipient separation, not control over who ends
up convinced.

**Honest scope (audit 2026-08-07):** the *conviction* comes from the off-chain
package, and the package itself is transferable — a prosecutor who forwards
`(evidenceHash, secret)` transfers the ability to verify. What the
`prosecutorPk` binding buys is that the on-chain artifact names no one and
cannot be re-bound. Cryptographic non-transferability (a designated-verifier
tag the prosecutor could have simulated, e.g. Diffie–Hellman over the
whistleblower's published point and the prosecutor's private key) is roadmap.

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
validated, so a leaf cannot be smuggled in for an unregistered org.
`report` rebuilds the leaf in-circuit from the public `orgId` and the
`credentialSecret` witness, and verifies membership with the
`credentialPath` witness (siblings only — the witness cannot choose which
leaf gets proven). Depth 16 = 65 536 credentials (depth 8 was a permanent kill switch: 256 junk insertions bricked issuance forever). The
nullifier uses `credentialSecret` → one credential = one report per epoch.
Correct and defensible.

**Option B — zero-risk fallback (only if A doesn't compile in time):**
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
| The employer looks up the authorship with their own key | One record per prosecutor: authorship is tied to `prosecutorPk`, so the employer's key finds nothing | ✅ |
| The employer replays a proof that was handed to a prosecutor | **None.** The proof is publicly verifiable, so it is transferable once delivered — not a designated-verifier scheme | ❌ declared |
| Spam / drowning the channel with fake reports | Nullifier `H(dom ‖ credentialSecret ‖ orgId ‖ epoch)`, epoch bound to blockTime | ✅ (weak in Option B — declared) |
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

export circuit revealAuthorship(reportId: Bytes<32>, prosecutorPk: Bytes<32>): [] {
  const sec = personalSecret();
  const ev  = evidenceHash();

  assert(persistentHash<...>([ev, sec]) == reportId, "not the author");
  assert(reports.member(reportId), "report does not exist");

  authorships.insert(disclose(persistentHash<...>([sec, reportId, prosecutorPk])));
}
```
