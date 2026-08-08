/**
 * The four acts of the demo, end to end, printing the public ledger after every step.
 * `npm run simulate`
 *
 * This is the script that gets recorded for the video (Block E), so the output is written
 * to be read on a projector. It is also self-checking: every act asserts its own invariant and
 * the process exits non-zero on failure. A demo that prints a pretty story while being wrong is
 * worse than no demo.
 *
 * Runs against whichever backends are available — the spec model always, the real compiled
 * contract as soon as `contracts/output/` exists.
 */

import { ASSERTS } from "../harness/contract-surface.js";
import { credCommitmentOf, leafOf, receiptOf, reportIdOf } from "../harness/crypto.js";
import {
  ACME,
  ACME_ANCHOR,
  AUGUST,
  EMPLOYEE_A,
  EMPLOYEE_B,
  EMPLOYER_NONCE,
  PROSECUTOR_NONCE,
} from "../harness/fixtures.js";
import { backendBanner, backends } from "../harness/index.js";
import { AssertError } from "../harness/types.js";
import type { Hex32, LedgerSnapshot, TestigoHarness } from "../harness/types.js";

// ── output helpers ──────────────────────────────────────────────────────────────────────

const W = 78;
const line = (ch = "─") => ch.repeat(W);
const short = (h: Hex32) => `${h.slice(0, 12)}…${h.slice(-6)}`;

function act(n: number, title: string, subtitle: string): void {
  console.log(`\n┌${line()}┐`);
  console.log(`│ T${n} · ${title.padEnd(W - 6)}│`);
  console.log(`│ ${subtitle.padEnd(W - 1)}│`);
  console.log(`└${line()}┘`);
}

function showLedger(l: LedgerSnapshot): void {
  console.log("  ── what the chain sees ───────────────────────────────────────────────");
  console.log(`     organizations  : ${l.organizations.size}`);
  for (const [orgId, anchor] of l.organizations) {
    console.log(`                      ${short(orgId)} → anchor ${short(anchor)}`);
  }
  console.log(`     credentials    : ${l.credentialsCount} leaves in the global tree`);
  console.log(`     reports        : ${l.reports.size}`);
  for (const d of l.reports) console.log(`                      ${short(d)}`);
  console.log(`     nullifiers     : ${l.nullifiers.size}`);
  for (const n of l.nullifiers) console.log(`                      ${short(n)}`);
  console.log(`     authorships    : ${l.authorships.size}`);
  for (const a of l.authorships) console.log(`                      ${short(a)}`);
}

function step(text: string): void {
  console.log(`  → ${text}`);
}

function verdict(ok: boolean, text: string): void {
  console.log(`  ${ok ? "✅" : "❌"} ${text}`);
}

/** Self-check. Throws so the process exits non-zero rather than printing a false story. */
function require(condition: boolean, what: string): void {
  if (!condition) throw new Error(`simulate: invariant failed — ${what}`);
}

/** Runs `fn` and returns the assert message it failed with, or `null` if it did not fail. */
function expectRejection(fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    if (e instanceof AssertError) return e.message;
    throw e;
  }
}

// ── The export the reporter hands to the prosecutor, off-chain ───────────────────

interface AuthorshipKeyExport {
  readonly version: 3;
  readonly reportId: Hex32;
  readonly receipt: Hex32;
}

/**
 * `verifyAuthorship` — 100 % off-chain: recompute with the pure circuits and read the
 * ledger. No proof server, no transaction.
 *
 * `verifierNonce` is the nonce the caller generated and sent to the whistleblower, and it is
 * deliberately NOT in the package. That is the whole design: the verdict is a RECOMPUTATION
 * against a value on the ledger, not a comparison between two fields of a file the holder
 * controls. No secret is involved on either side.
 */
function verifyAuthorship(
  claim: AuthorshipKeyExport,
  verifierNonce: Hex32,
  l: LedgerSnapshot,
): { ok: boolean; onLedger: boolean; recomputed: Hex32 } {
  const recomputed = receiptOf(claim.reportId, verifierNonce);
  const onLedger = l.authorships.has(recomputed);
  return { ok: onLedger && recomputed === claim.receipt, onLedger, recomputed };
}

// ── the demo ────────────────────────────────────────────────────────────────────────────

function runDemo(h: TestigoHarness): void {
  console.log(`\n${line("═")}`);
  console.log(`  PHANTOMTRACE — the four acts        backend: ${h.backend}`);
  console.log(line("═"));

  // ── T1 ────────────────────────────────────────────────────────────────────────────────
  act(1, "ACME registers and issues credentials", "The anchor goes public. The secrets never do.");

  h.as(EMPLOYEE_A).registerOrganization(ACME, ACME_ANCHOR);
  step(`registerOrganization(ACME, anchor) — ${short(ACME_ANCHOR)}`);

  for (const employee of [EMPLOYEE_A, EMPLOYEE_B]) {
    // The employee hands the issuer only the COMMITMENT of their credential secret; the leaf is
    // built from it in-circuit. The issuer never sees `credentialSecret` at all.
    const commitment = credCommitmentOf(employee.credentialSecret);
    const leaf = leafOf(ACME, commitment);
    h.as(employee).issueCredential(ACME, commitment);
    step(`issueCredential(ACME) → ${employee.name}: leaf ${short(leaf)}`);
  }
  console.log("     the mock issuer only ever receives H(credSecret) — never the secret itself");
  showLedger(h.ledger());
  require(h.ledger().organizations.size === 1, "ACME should be registered");

  // ── T2 ────────────────────────────────────────────────────────────────────────────────
  act(2, "An employee reports fraud", "Membership proven in private. Identity never disclosed.");

  h.as(EMPLOYEE_A).report(ACME, AUGUST);
  const reportId = reportIdOf(EMPLOYEE_A.evidenceHash, EMPLOYEE_A.personalSecret);
  step(`report(ACME, epoch ${AUGUST}) as ${EMPLOYEE_A.name}`);
  step(`sealed: reportId ${short(reportId)}`);
  showLedger(h.ledger());

  console.log("  ── what never leaves the reporter's machine ──────────────────────────");
  console.log(`     credentialSecret : ${short(EMPLOYEE_A.credentialSecret)}   (witness)`);
  console.log(`     personalSecret   : ${short(EMPLOYEE_A.personalSecret)}   (witness)`);
  console.log(`     evidenceHash     : ${short(EMPLOYEE_A.evidenceHash)}   (witness)`);
  console.log("     ACME can read the whole ledger and still cannot tell WHO reported.");

  const l2 = h.ledger();
  require(l2.reports.has(reportId), "the report should be sealed on chain");
  for (const leaked of [
    EMPLOYEE_A.personalSecret,
    EMPLOYEE_A.credentialSecret,
    EMPLOYEE_A.evidenceHash,
  ]) {
    require(
      !l2.reports.has(leaked) && !l2.nullifiers.has(leaked) && !l2.authorships.has(leaked),
      "no witness value may appear on chain",
    );
  }

  step(`a second report in epoch ${AUGUST} from the same person:`);
  const blocked = expectRejection(() => h.as(EMPLOYEE_A).report(ACME, AUGUST));
  verdict(false, `rejected — "${blocked}"  (nullifier, anti-spam)`);
  require(blocked === ASSERTS.alreadyReportedThisPeriod, "the nullifier should block a replay");

  // ── T3 ────────────────────────────────────────────────────────────────────────────────
  act(3, "ACME tampers with the evidence", "The seal is on chain. Any edit breaks the hash.");

  const tampered: Hex32 = "de".repeat(32);
  const tamperedId = reportIdOf(tampered, EMPLOYEE_A.personalSecret);
  step(`original evidence  → reportId ${short(reportId)}   in ledger: yes`);
  step(`tampered evidence  → reportId ${short(tamperedId)}   in ledger: no`);
  verdict(false, "the altered evidence matches nothing that was sealed");
  require(!h.ledger().reports.has(tamperedId), "tampered evidence must not match the seal");

  // ── T4 ────────────────────────────────────────────────────────────────────────────────
  act(4, "Months later: proving authorship", "Only the author. Only to the verifier they choose.");

  h.as(EMPLOYEE_A).revealAuthorship(reportId);
  const receipt = receiptOf(reportId, PROSECUTOR_NONCE);
  step(`revealAuthorship(reportId) — receipt ${short(receipt)}`);
  showLedger(h.ledger());

  step("someone else tries to claim the same report:");
  const stolen = expectRejection(() =>
    h.as({ ...EMPLOYEE_A, personalSecret: EMPLOYEE_B.personalSecret }).revealAuthorship(reportId),
  );
  verdict(false, `rejected — "${stolen}"  (only the author knows the preimage)`);
  require(stolen === ASSERTS.notTheAuthor, "a foreign secret must not prove authorship");

  // The climax (Block E): one proof, two verifiers, two outcomes.
  console.log("\n  ── the same claim, read by two different people ──────────────────────");

  // Note what is NOT in here: the nonce, and any secret. An interceptor holding
  // this file has nothing to designate themselves with.
  const claim: AuthorshipKeyExport = {
    version: 3,
    reportId,
    receipt,
  };

  const l4 = h.ledger();
  const asProsecutor = verifyAuthorship(claim, PROSECUTOR_NONCE, l4);
  const asEmployer = verifyAuthorship(claim, EMPLOYER_NONCE, l4);

  console.log(`     PROSECUTOR  recomputes ${short(asProsecutor.recomputed)}`);
  verdict(asProsecutor.ok, `on chain: ${asProsecutor.onLedger} → authorship PROVEN`);
  console.log(`     EMPLOYER    recomputes ${short(asEmployer.recomputed)}`);
  verdict(asEmployer.ok, `on chain: ${asEmployer.onLedger} → not revealed to them`);
  console.log("     Same author, same report, different nonce ⇒ different receipt.");
  console.log("     The binding is one per nonce. The prosecutor cannot mint a receipt for");
  console.log("     a nonce of their own choosing either: that needs the report secret.");

  require(asProsecutor.ok, "the designated prosecutor must verify");
  require(!asEmployer.ok, "the employer must not be able to reuse the proof");
}

// ── entry point ─────────────────────────────────────────────────────────────────────────

const found = await backends();
console.log(`\ntestigo · ${backendBanner(found)}`);

for (const backend of found) {
  runDemo(backend.fresh());
}

console.log(`\n${line("═")}`);
console.log(`  all four acts passed on: ${found.map((b) => b.name).join(", ")}`);
console.log(`${line("═")}\n`);
