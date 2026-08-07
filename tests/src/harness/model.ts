/**
 * The `model` backend — an implementation of the spec, written FROM the spec.
 *
 * It is not a mock. Two things make it a real oracle:
 *
 *   1. Hashes come from compact-runtime's `persistentHash` → byte-identical to the circuit.
 *   2. The credential tree is `StateBoundedMerkleTree`, the SAME structure Compact uses for
 *      `HistoricMerkleTree<8, Bytes<32>>` → real roots and real paths, not simulated ones.
 *
 * What this backend does NOT do: run the constraints inside a ZK circuit. It checks
 * membership with `findPathForLeaf` instead of `checkRoot(merkleTreePathRoot(path))`. The
 * semantic outcome is the same (valid / invalid credential) over the same bytes, but only
 * the `contract` backend proves the `.compact` actually enforces it.
 *
 * Written from `docs/01-arquitectura.md` §3–§4 and deliberately NOT from the contract: that
 * independence is where the differential value comes from once both backends run one suite.
 */

import { StateBoundedMerkleTree } from "@midnight-ntwrk/compact-runtime";

import { ASSERTS, MERKLE_DEPTH } from "./contract-surface.js";
import {
  autoriaDe,
  bytesToHex,
  denunciaIdDe,
  hojaDe,
  hojaHash,
  nullifierDe,
  padHex32,
} from "./crypto.js";
import { AssertError } from "./types.js";
import type { Actor, Hex32, LedgerSnapshot, TestigoHarness } from "./types.js";

/** Compact's `assert(cond, msg)`. On the real network this fails at proof time, emitting no tx. */
function assert(condition: boolean, message: string): void {
  if (!condition) throw new AssertError(message);
}

export class ModelHarness implements TestigoHarness {
  readonly backend = "model" as const;

  private readonly organizaciones = new Map<Hex32, Hex32>();
  private readonly denuncias = new Set<Hex32>();
  private readonly nullifiers = new Set<Hex32>();
  private readonly autorias = new Set<Hex32>();

  private credenciales = new StateBoundedMerkleTree(MERKLE_DEPTH);
  private nextLeaf = 0n;

  private actor: Actor | undefined;

  as(actor: Actor): this {
    this.actor = actor;
    return this;
  }

  private witnesses(): Actor {
    if (this.actor === undefined) {
      throw new Error("harness: call .as(actor) before a circuit that takes witnesses");
    }
    return this.actor;
  }

  // ── §4.1 ──────────────────────────────────────────────────────────────────────────────

  registrarOrganizacion(orgId: Hex32, ancla: Hex32): void {
    assert(!this.organizaciones.has(orgId), ASSERTS.orgAlreadyRegistered);
    this.organizaciones.set(orgId, ancla);
  }

  /**
   * Mock issuer: inserts the employee's leaf into the global tree. No access control —
   * declared up front in §2.6, consistent with "the issuer is a mock".
   */
  emitirCredencial(orgId: Hex32, hoja: Hex32): void {
    assert(this.organizaciones.has(orgId), ASSERTS.orgNotFound);
    this.credenciales = this.credenciales.update(this.nextLeaf, hojaHash(hoja)).rehash();
    this.nextLeaf += 1n;
  }

  // ── §4.2 — the heart ──────────────────────────────────────────────────────────────────

  denunciar(orgId: Hex32, periodo: string): void {
    const { credencialSecret, secretPersonal, evidenciaHash } = this.witnesses();
    assert(this.organizaciones.has(orgId), ASSERTS.orgNotFound);

    // C1 — membership. The leaf is built here rather than supplied by the witness, so the
    // reporter cannot lie about which org they belong to (§2.1).
    const hoja = hojaDe(orgId, credencialSecret);
    assert(this.credenciales.findPathForLeaf(hojaHash(hoja)) !== undefined, ASSERTS.invalidCredential);

    // C2 — one report per (person, org, period).
    const nullifier = nullifierDe(secretPersonal, orgId, padHex32(periodo));
    assert(!this.nullifiers.has(nullifier), ASSERTS.alreadyReportedThisPeriod);

    // Idempotency guard (§2.6): `Set.insert` is idempotent, so without this assert a
    // resubmission of the same evidence would pass SILENTLY.
    const denunciaId = denunciaIdDe(evidenciaHash, secretPersonal);
    assert(!this.denuncias.has(denunciaId), ASSERTS.reportAlreadyExists);

    this.denuncias.add(denunciaId);
    this.nullifiers.add(nullifier);
  }

  // ── §4.3 — the differentiator ─────────────────────────────────────────────────────────

  revelarAutoria(denunciaId: Hex32, fiscalPk: Hex32): void {
    const { secretPersonal, evidenciaHash } = this.witnesses();

    // C1 — only the author knows the preimage of denunciaId.
    assert(denunciaIdDe(evidenciaHash, secretPersonal) === denunciaId, ASSERTS.notTheAuthor);
    // C2 — the report exists.
    assert(this.denuncias.has(denunciaId), ASSERTS.reportNotFound);

    const autoria = autoriaDe(secretPersonal, denunciaId, fiscalPk);
    assert(!this.autorias.has(autoria), ASSERTS.authorshipAlreadyRevealed);

    this.autorias.add(autoria);
  }

  // ── §3 — the only thing the world gets to see ─────────────────────────────────────────

  ledger(): LedgerSnapshot {
    return {
      organizaciones: new Map(this.organizaciones),
      credencialesRoot: this.root(),
      credencialesCount: Number(this.nextLeaf),
      denuncias: new Set(this.denuncias),
      nullifiers: new Set(this.nullifiers),
      autorias: new Set(this.autorias),
    };
  }

  /**
   * The Merkle root as hex, or `null` while the tree is empty.
   *
   * `root()` is typed as possibly-undefined because the tree returns nothing until `rehash()`
   * has run — every `emitirCredencial` rehashes, so in practice it is set once there is a leaf.
   */
  private root(): Hex32 | null {
    if (this.nextLeaf === 0n) return null;
    const field = this.credenciales.root()?.value?.[0];
    return field === undefined ? null : bytesToHex(field);
  }
}
