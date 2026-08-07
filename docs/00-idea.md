# 00 — PhantomTrace: the idea

## 1. The idea in one sentence

**PhantomTrace** is a corruption reporting system where the whistleblower
proves they are an insider without revealing who they are, the evidence
is sealed and immutable — and, unlike **all** existing systems,
**the anonymity is reversible: only by the whistleblower, only before the
authority they choose, only when it suits them.**

The name is literal: in Midnight, the private state is called `witness` —
witness.

## 2. The problem

Whoever discovers fraud within their organization today needs three things
that are incompatible with each other:

1. **Prove they are an insider** — otherwise, it's a worthless anonymous rumor.
2. **Unalterable evidence** — that neither they nor the company can change later.
3. **That nobody knows who they are** — proving membership narrows the list of
   suspects.

And a fourth that no existing system solves: **real legal protection
requires revealing one's identity sooner or later.** The SEC whistleblower
program pays 10–30 % of the fine *only to whoever proves they were the first to
report*. You need to be able to prove "I wrote that report" — without that
proof ever falling into the employer's hands.

## 3. How it works

Three Compact circuits on Midnight's dual-ledger model (detail in
`01-arquitectura.md`):

1. **`registerOrganization`** — the organization publishes the anchor of its
   credentials on the public ledger.
2. **`report`** — the core. Verifies *privately* that the whistleblower has a
   valid credential for that organization and publishes: the evidence hash
   (sealed), the `orgId`, the epoch, and an anti-spam nullifier (one report
   per person, per organization, per period). The `orgId` is a public circuit
   argument (visible on-chain), but the employee's **identity, credential,
   and evidence never touch the chain** — the nullifier is unlinkable to
   the credential that generated it.
3. **`revealAuthorship`** — the differentiator. Months later, the whistleblower
   proves to a prosecutor that they wrote *that* report, **binding the on-chain
   record to the prosecutor's public key**: the ledger entry, shown to anyone
   else — the employer, for instance — proves nothing. The off-chain
   verification package is what convinces, and whoever holds it can verify, so
   it is delivered only to the chosen prosecutor; cryptographically
   non-transferable proofs (true designated-verifier tags) are roadmap.

**Four stages:** (1) the organization registers → (2) an employee reports and
the company looks at the ledger without being able to know who did it → (3) the
company tries to alter the evidence and cannot → (4) months later, the
whistleblower proves authorship to the prosecutor and obtains legal protection.

## 4. The differentiator — verified, not assumed

**The base idea already exists; the differentiator does not — on any chain.**

| Project | Where | Anonymous mailbox? | Delayed authorship? |
|---|---|---|---|
| midnight-whistleblower (depapp) | Midnight — won the official challenge on DEV.to | ✅ | ❌ |
| Dawn | Midnight — won "Protect That Data" | ✅ | ❌ (irrecoverable by design) |
| SpillSafe | Midnight — Devpost 2025 | ✅ | ❌ |
| ZK Whistleblower | Catalyst Fund 15 (pending) | ✅ | ❌ |
| StealthNote / Semaphore / ZK-Whistle | Aztec / Ethereum / Scroll | ✅ | ❌ |
| Academic papers 2023–2025 | MDPI, PriRPT | — | ✅ only in theory |

Delayed authorship disclosure exists only in papers. **Nobody has shipped it.**
We are shipping it here, with the refinement the literature recommends
(designated verifier).

Second verified differentiator: **the anonymity holds up to the hard question.**
Midnight transactions have no `msg.sender` — contract calls are authorized by
ZK proof and fees are paid shielded. Honest limits: the indexer sees viewing
key and IP (mitigation: local proof server, Tor/own node).

## 5. What it is NOT (stated limitations)

- **The credential issuer is a mock**, same as in all comparable projects. The
  system validates the ZK flow; integration with a real corporate directory is
  roadmap.
- **It does not prove that the report is truthful.** It proves it comes from an
  insider and was not altered. Content veracity is a human problem.
- **On-chain anonymity is verified; off-chain has known limits** (indexer sees
  viewing key and IP). Declared mitigations: local proof server, Tor/own node,
  fee-sponsor roadmap via `Transaction.merge`.
