/**
 * The four acts of the demo, end to end. `npm run simulate`
 */

import { ASSERTS } from "../harness/contract-surface.js";
import { authorshipOf, credCommitmentOf, reportIdOf } from "../harness/crypto.js";
import {
  ACME,
  ACME_ANCHOR,
  NOW,
  EMPLOYEE_A,
  EMPLOYEE_B,
  EMPLOYER_PK,
  EPOCH,
  PROSECUTOR_PK,
  leafFor,
} from "../harness/fixtures.js";
import { backendBanner, backends } from "../harness/index.js";
import { AssertError } from "../harness/types.js";
import type { Hex32, LedgerSnapshot, TestigoHarness } from "../harness/types.js";

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
  console.log(`     organizations : ${l.organizations.size}`);
  for (const [orgId, ancla] of l.organizations) {
    console.log(`                      ${short(orgId)} → ancla ${short(ancla)}`);
  }
  console.log(`     credentials   : ${l.credentialsCount} issued`);
  console.log(`     reports      : ${l.reports.size}`);
  for (const d of l.reports) console.log(`                      ${short(d)}`);
  console.log(`     nullifiers     : ${l.nullifiers.size}`);
  for (const n of l.nullifiers) console.log(`                      ${short(n)}`);
  console.log(`     authorships       : ${l.authorships.size}`);
  for (const a of l.authorships) console.log(`                      ${short(a)}`);
}

function step(text: string): void {
  console.log(`  → ${text}`);
}

function verdict(ok: boolean, text: string): void {
  console.log(`  ${ok ? "✅" : "❌"} ${text}`);
}

function require(condition: boolean, what: string): void {
  if (!condition) throw new Error(`simulate: invariant failed — ${what}`);
}

function expectRejection(fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    if (e instanceof AssertError) return e.message;
    throw e;
  }
}

interface ExportLlaveAutoria {
  readonly version: 1;
  readonly denunciaId: Hex32;
  readonly evidenceHash: Hex32;
  readonly secret: Hex32;
  readonly fiscalPk: Hex32;
  readonly autoriaHash: Hex32;
}

function verificarAutoria(
  claim: ExportLlaveAutoria,
  verifierPk: Hex32,
  l: LedgerSnapshot,
): { ok: boolean; enLedger: boolean; recomputed: Hex32 } {
  const recomputed = authorshipOf(claim.secret, claim.denunciaId, verifierPk);
  const enLedger = l.authorships.has(recomputed);
  return { ok: enLedger && recomputed === claim.autoriaHash, enLedger, recomputed };
}

function runDemo(h: TestigoHarness): void {
  console.log(`\n${line("═")}`);
  console.log(`  TESTIGO — the four acts        backend: ${h.backend}`);
  console.log(line("═"));

  h.setBlockTime(NOW);

  act(1, "ACME registers and issues credentials", "The anchor goes public. The secrets never do.");

  h.registerOrganization(ACME, ACME_ANCHOR);
  step(`registerOrganization(ACME, ancla) — ancla ${short(ACME_ANCHOR)}`);

  for (const employee of [EMPLOYEE_A, EMPLOYEE_B]) {
    const commitment = credCommitmentOf(employee.credentialSecret);
    const hoja = leafFor(ACME, employee.credentialSecret);
    h.issueCredential(ACME, commitment);
    step(`issueCredential(ACME) → ${employee.name}: hoja ${short(hoja)}`);
  }
  console.log("     the mock issuer only ever receives credCommitment — never the secret");
  showLedger(h.ledger());
  require(h.ledger().organizations.size === 1, "ACME should be registered");

  act(2, "An employee reports fraud", "Membership proven in private. Identity never disclosed.");

  h.as(EMPLOYEE_A).report(ACME, EPOCH);
  const denunciaId = reportIdOf(EMPLOYEE_A.evidenceHash, EMPLOYEE_A.personalSecret);
  step(`report(ACME, epoca ${EPOCH}) as ${EMPLOYEE_A.name}`);
  step(`sealed: denunciaId ${short(denunciaId)}`);
  showLedger(h.ledger());

  console.log("  ── what never leaves the reporter's machine ──────────────────────────");
  console.log(`     credentialSecret : ${short(EMPLOYEE_A.credentialSecret)}   (witness)`);
  console.log(`     personalSecret   : ${short(EMPLOYEE_A.personalSecret)}   (witness)`);
  console.log(`     evidenceHash    : ${short(EMPLOYEE_A.evidenceHash)}   (witness)`);
  console.log("     ACME can read the whole ledger and still cannot tell WHO reported.");

  const l2 = h.ledger();
  require(l2.reports.has(denunciaId), "the report should be sealed on chain");
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

  step(`a second report in epoca ${EPOCH} from the same person:`);
  const blocked = expectRejection(() => h.as(EMPLOYEE_A).report(ACME, EPOCH));
  verdict(false, `rejected — "${blocked}"  (nullifier, anti-spam)`);
  require(blocked === ASSERTS.alreadyReportedThisPeriod, "the nullifier should block a replay");

  act(3, "ACME tampers with the evidence", "The seal is on chain. Any edit breaks the hash.");

  const tampered: Hex32 = "de".repeat(32);
  const tamperedId = reportIdOf(tampered, EMPLOYEE_A.personalSecret);
  step(`original evidence  → denunciaId ${short(denunciaId)}   in ledger: yes`);
  step(`tampered evidence  → denunciaId ${short(tamperedId)}   in ledger: no`);
  verdict(false, "the altered evidence matches nothing that was sealed");
  require(!h.ledger().reports.has(tamperedId), "tampered evidence must not match the seal");

  act(4, "Months later: proving authorship", "Only the author. Only to the verifier they choose.");

  h.as(EMPLOYEE_A).revealAuthorship(denunciaId, PROSECUTOR_PK);
  const autoriaHash = authorshipOf(EMPLOYEE_A.personalSecret, denunciaId, PROSECUTOR_PK);
  step(`revealAuthorship(denunciaId, fiscalPk) — autoria ${short(autoriaHash)}`);
  showLedger(h.ledger());

  step("someone else tries to claim the same report:");
  const stolen = expectRejection(() =>
    h.as({ ...EMPLOYEE_A, personalSecret: EMPLOYEE_B.personalSecret }).revealAuthorship(
      denunciaId,
      PROSECUTOR_PK,
    ),
  );
  verdict(false, `rejected — "${stolen}"  (only the author knows the preimage)`);
  require(stolen === ASSERTS.notTheAuthor, "a foreign secret must not prove authorship");

  console.log("\n  ── the same claim, read by two different people ──────────────────────");

  const claim: ExportLlaveAutoria = {
    version: 1,
    denunciaId,
    evidenceHash: EMPLOYEE_A.evidenceHash,
    secret: EMPLOYEE_A.personalSecret,
    fiscalPk: PROSECUTOR_PK,
    autoriaHash,
  };

  const l4 = h.ledger();
  const asFiscal = verificarAutoria(claim, PROSECUTOR_PK, l4);
  const asEmployer = verificarAutoria(claim, EMPLOYER_PK, l4);

  console.log(`     PROSECUTOR  recomputes ${short(asFiscal.recomputed)}`);
  verdict(asFiscal.ok, `on chain: ${asFiscal.enLedger} → authorship PROVEN`);
  console.log(`     EMPLOYER    recomputes ${short(asEmployer.recomputed)}`);
  verdict(asEmployer.ok, `on chain: ${asEmployer.enLedger} → proves NOTHING`);
  console.log("     Same author, same report, different verifier ⇒ different record.");
  console.log("     The employer cannot replay a proof that was never bound to its key.");

  require(asFiscal.ok, "the designated prosecutor must verify");
  require(!asEmployer.ok, "the employer must not be able to reuse the proof");
}

const found = await backends();
console.log(`\ntestigo · ${backendBanner(found)}`);

for (const backend of found) {
  runDemo(backend.fresh());
}

console.log(`\n${line("═")}`);
console.log(`  all four acts passed on: ${found.map((b) => b.name).join(", ")}`);
console.log(`${line("═")}\n`);
