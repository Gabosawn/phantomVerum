/**
 * The four acts of the demo, end to end, printing the public ledger after every step.
 * `npm run simulate`
 *
 * This is the script that gets recorded for the video (§4, Block E), so the output is written
 * to be read on a projector. It is also self-checking: every act asserts its own invariant and
 * the process exits non-zero on failure. A demo that prints a pretty story while being wrong is
 * worse than no demo.
 *
 * Runs against whichever backends are available — the spec model always, the real compiled
 * contract as soon as `contracts/output/` exists.
 */

import { ASSERTS } from "../harness/contract-surface.js";
import { autoriaDe, denunciaIdDe, hojaDe } from "../harness/crypto.js";
import {
  ACME,
  ACME_ANCHOR,
  AUGUST,
  EMPLOYEE_A,
  EMPLOYEE_B,
  EMPLOYER_PK,
  FISCAL_PK,
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
  console.log(`     organizaciones : ${l.organizaciones.size}`);
  for (const [orgId, ancla] of l.organizaciones) {
    console.log(`                      ${short(orgId)} → ancla ${short(ancla)}`);
  }
  const root = l.credencialesRoot;
  console.log(`     credenciales   : root ${root === null ? "(empty tree)" : short(root)}`);
  console.log(`     denuncias      : ${l.denuncias.size}`);
  for (const d of l.denuncias) console.log(`                      ${short(d)}`);
  console.log(`     nullifiers     : ${l.nullifiers.size}`);
  for (const n of l.nullifiers) console.log(`                      ${short(n)}`);
  console.log(`     autorias       : ${l.autorias.size}`);
  for (const a of l.autorias) console.log(`                      ${short(a)}`);
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

// ── §3.2 — the export the reporter hands to the prosecutor, off-chain ───────────────────

interface ExportLlaveAutoria {
  readonly version: 1;
  readonly denunciaId: Hex32;
  readonly evidenciaHash: Hex32;
  readonly secret: Hex32;
  readonly fiscalPk: Hex32;
  readonly autoriaHash: Hex32;
}

/**
 * §3.1 `verificarAutoria` — 100 % off-chain: recompute with the pure circuits and read the
 * ledger. No proof server, no transaction. `verifierPk` is the key of whoever is looking.
 */
function verificarAutoria(
  claim: ExportLlaveAutoria,
  verifierPk: Hex32,
  l: LedgerSnapshot,
): { ok: boolean; enLedger: boolean; recomputed: Hex32 } {
  const recomputed = autoriaDe(claim.secret, claim.denunciaId, verifierPk);
  const enLedger = l.autorias.has(recomputed);
  return { ok: enLedger && recomputed === claim.autoriaHash, enLedger, recomputed };
}

// ── the demo ────────────────────────────────────────────────────────────────────────────

function runDemo(h: TestigoHarness): void {
  console.log(`\n${line("═")}`);
  console.log(`  TESTIGO — the four acts        backend: ${h.backend}`);
  console.log(line("═"));

  // ── T1 ────────────────────────────────────────────────────────────────────────────────
  act(1, "ACME registers and issues credentials", "The anchor goes public. The secrets never do.");

  h.registrarOrganizacion(ACME, ACME_ANCHOR);
  step(`registrarOrganizacion(ACME, ancla) — ancla ${short(ACME_ANCHOR)}`);

  for (const employee of [EMPLOYEE_A, EMPLOYEE_B]) {
    const hoja = hojaDe(ACME, employee.credencialSecret);
    h.emitirCredencial(ACME, hoja);
    step(`emitirCredencial(ACME) → ${employee.name}: hoja ${short(hoja)}`);
  }
  console.log("     the mock issuer only ever publishes H(tag ‖ orgId ‖ credSecret) — never the secret");
  showLedger(h.ledger());
  require(h.ledger().organizaciones.size === 1, "ACME should be registered");

  // ── T2 ────────────────────────────────────────────────────────────────────────────────
  act(2, "An employee reports fraud", "Membership proven in private. Identity never disclosed.");

  h.as(EMPLOYEE_A).denunciar(ACME, AUGUST);
  const denunciaId = denunciaIdDe(EMPLOYEE_A.evidenciaHash, EMPLOYEE_A.secretPersonal);
  step(`denunciar(ACME, "${AUGUST}") as ${EMPLOYEE_A.name}`);
  step(`sealed: denunciaId ${short(denunciaId)}`);
  showLedger(h.ledger());

  console.log("  ── what never leaves the reporter's machine ──────────────────────────");
  console.log(`     credencialSecret : ${short(EMPLOYEE_A.credencialSecret)}   (witness)`);
  console.log(`     secretPersonal   : ${short(EMPLOYEE_A.secretPersonal)}   (witness)`);
  console.log(`     evidenciaHash    : ${short(EMPLOYEE_A.evidenciaHash)}   (witness)`);
  console.log("     ACME can read the whole ledger and still cannot tell WHO reported.");

  const l2 = h.ledger();
  require(l2.denuncias.has(denunciaId), "the report should be sealed on chain");
  for (const leaked of [
    EMPLOYEE_A.secretPersonal,
    EMPLOYEE_A.credencialSecret,
    EMPLOYEE_A.evidenciaHash,
  ]) {
    require(
      !l2.denuncias.has(leaked) && !l2.nullifiers.has(leaked) && !l2.autorias.has(leaked),
      "no witness value may appear on chain",
    );
  }

  step(`a second report in "${AUGUST}" from the same person:`);
  const blocked = expectRejection(() => h.as(EMPLOYEE_A).denunciar(ACME, AUGUST));
  verdict(false, `rejected — "${blocked}"  (nullifier, anti-spam)`);
  require(blocked === ASSERTS.alreadyReportedThisPeriod, "the nullifier should block a replay");

  // ── T3 ────────────────────────────────────────────────────────────────────────────────
  act(3, "ACME tampers with the evidence", "The seal is on chain. Any edit breaks the hash.");

  const tampered: Hex32 = "de".repeat(32);
  const tamperedId = denunciaIdDe(tampered, EMPLOYEE_A.secretPersonal);
  step(`original evidence  → denunciaId ${short(denunciaId)}   in ledger: yes`);
  step(`tampered evidence  → denunciaId ${short(tamperedId)}   in ledger: no`);
  verdict(false, "the altered evidence matches nothing that was sealed");
  require(!h.ledger().denuncias.has(tamperedId), "tampered evidence must not match the seal");

  // ── T4 ────────────────────────────────────────────────────────────────────────────────
  act(4, "Months later: proving authorship", "Only the author. Only to the verifier they choose.");

  h.as(EMPLOYEE_A).revelarAutoria(denunciaId, FISCAL_PK);
  const autoriaHash = autoriaDe(EMPLOYEE_A.secretPersonal, denunciaId, FISCAL_PK);
  step(`revelarAutoria(denunciaId, fiscalPk) — autoria ${short(autoriaHash)}`);
  showLedger(h.ledger());

  step("someone else tries to claim the same report:");
  const stolen = expectRejection(() =>
    h.as({ ...EMPLOYEE_A, secretPersonal: EMPLOYEE_B.secretPersonal }).revelarAutoria(
      denunciaId,
      FISCAL_PK,
    ),
  );
  verdict(false, `rejected — "${stolen}"  (only the author knows the preimage)`);
  require(stolen === ASSERTS.notTheAuthor, "a foreign secret must not prove authorship");

  // The climax (§4, Block E): one proof, two verifiers, two outcomes.
  console.log("\n  ── the same claim, read by two different people ──────────────────────");

  const claim: ExportLlaveAutoria = {
    version: 1,
    denunciaId,
    evidenciaHash: EMPLOYEE_A.evidenciaHash,
    secret: EMPLOYEE_A.secretPersonal,
    fiscalPk: FISCAL_PK,
    autoriaHash,
  };

  const l4 = h.ledger();
  const asFiscal = verificarAutoria(claim, FISCAL_PK, l4);
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

// ── entry point ─────────────────────────────────────────────────────────────────────────

const found = await backends();
console.log(`\ntestigo · ${backendBanner(found)}`);

for (const backend of found) {
  runDemo(backend.fresh());
}

console.log(`\n${line("═")}`);
console.log(`  all four acts passed on: ${found.map((b) => b.name).join(", ")}`);
console.log(`${line("═")}\n`);
