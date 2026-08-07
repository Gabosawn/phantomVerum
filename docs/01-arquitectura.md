# 01 — Architecture and circuit spec

> Prerequisite: `00-idea.md`. This document specifies **semantics**, not
> syntax. Read §8 before writing a line of Compact.

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
    WITHOUT revealing evidence or secret, and binds the proof to the
    prosecutor's key. The prosecutor verifies. The employer, if intercepted,
    cannot use it.
```

## 3. Ledger state (public)

```
ledger organizations: Map<Bytes<32>, Bytes<32>>  // orgId → credential anchor
ledger reports:       Set<Bytes<32>>             // sealed reportIds
ledger nullifiers:    Set<Bytes<32>>             // anti-spam per period
ledger authorships:   Set<Bytes<32>>             // H(secret ‖ reportId ‖ prosecutorPk)
```

Everything else — credential, secret, evidence — is witness: never leaves the
whistleblower's machine (except to their local proof server).

## 4. The three circuits

### 4.1 `registerOrganization(orgId, anchor)` — trivial

Inserts `orgId → anchor` in `organizations`. Fails if it already exists. No
witnesses. Acts as scaffolding for the rest of the contract.

### 4.2 `report` — the core

**Public inputs:** `orgId`, `period` (coarse epoch, e.g. `2026-08`).
**Witnesses:** `credential` (see §5), `secret` (personal, persistent),
`evidenceHash` (the app hashes the file locally; the circuit receives the hash).

**Constraints:**

```
C1. validCredential(credential, organizations[orgId])   // see §5
C2. assert(!nullifiers.member(nullifier))               // one report per period
```

**Derived values:**

```
reportId   = H(evidenceHash ‖ secret)     // the seal; only the author knows the preimage
nullifier  = H(secret ‖ orgId ‖ period)   // one report per (person, org, period)
```

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

**Why designated verifier:** the authorship is tied to *that* prosecutor. The
on-chain record is only interpretable by whoever has the context the
whistleblower delivers off-chain to the prosecutor (their claim + the values to
verify the authorship hash). Shown to the employer, the record proves nothing —
they cannot distinguish who generated it or replay it. This is the small delta
over the base circuit that no judge has ever seen shipped.

## 5. The credential — two options, in order of preference

The issuer is a **declared mock** (same as all comparable projects). What needs
to be decided during implementation, with the installed stdlib in view, is the
in-circuit verification mechanism. Two options, in order of preference:

**Option A — Merkle membership (preferred, ecosystem standard):**
the organization publishes as `anchor` the root of a Merkle tree of credential
commitments (`H(credentialSecret)` per employee). `report` takes the leaf and
path as witnesses and verifies the root in-circuit. depapp did it in Compact
(1M-leaf tree), so it's viable; we only need shallow depth (e.g. 8 levels = 256
employees). The nullifier uses `credentialSecret` as `secret` → one credential =
one report per period. Correct and defensible.

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
| The employer reuses/replays the authorship proof | Designated verifier: authorship is tied to `prosecutorPk` | ✅ |
| Spam / drowning the channel with fake reports | Nullifier `H(secret ‖ orgId ‖ period)` | ✅ (weak in Option B — declared) |
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
