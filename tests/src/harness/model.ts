/**
 * The `model` backend — spec implementation over real `persistentHash` + Merkle tree.
 *
 * Aligned with `contracts/src/testigo.compact` (Opción A, epoch-gated nullifiers).
 */

import { StateBoundedMerkleTree } from "@midnight-ntwrk/compact-runtime";

import { ASSERTS, AHORA, DUR_EPOCA, MERKLE_DEPTH } from "./contract-surface.js";
import {
  autoriaDe,
  bytesToHex,
  credCommitmentDe,
  denunciaIdDe,
  hojaDe,
  hojaHash,
  nullifierDe,
} from "./crypto.js";
import { AssertError } from "./types.js";
import type { Actor, Hex32, LedgerSnapshot, TestigoHarness } from "./types.js";

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
  private clock = AHORA;

  as(actor: Actor): this {
    this.actor = actor;
    return this;
  }

  at(unixSeconds: number): this {
    this.clock = unixSeconds;
    return this;
  }

  private witnesses(): Actor {
    if (this.actor === undefined) {
      throw new Error("harness: call .as(actor) before a circuit that takes witnesses");
    }
    return this.actor;
  }

  registrarOrganizacion(orgId: Hex32, ancla: Hex32): void {
    assert(!this.organizaciones.has(orgId), ASSERTS.orgAlreadyRegistered);
    this.organizaciones.set(orgId, ancla);
  }

  emitirCredencial(orgId: Hex32, credCommitment: Hex32): void {
    assert(this.organizaciones.has(orgId), ASSERTS.orgNotFound);
    const hoja = hojaDe(orgId, credCommitment);
    this.credenciales = this.credenciales.update(this.nextLeaf, hojaHash(hoja)).rehash();
    this.nextLeaf += 1n;
  }

  denunciar(orgId: Hex32, periodo: bigint): void {
    const { credencialSecret, secretPersonal, evidenciaHash } = this.witnesses();
    assert(this.organizaciones.has(orgId), ASSERTS.orgNotFound);

    const inicio = periodo * DUR_EPOCA;
    const fin = inicio + DUR_EPOCA;
    assert(BigInt(this.clock) >= inicio, ASSERTS.periodNotStarted);
    assert(BigInt(this.clock) < fin, ASSERTS.periodExpired);

    const hoja = hojaDe(orgId, credCommitmentDe(credencialSecret));
    assert(
      this.credenciales.findPathForLeaf(hojaHash(hoja)) !== undefined,
      ASSERTS.invalidCredential,
    );

    const nullifier = nullifierDe(credencialSecret, orgId, periodo);
    assert(!this.nullifiers.has(nullifier), ASSERTS.alreadyReportedThisPeriod);

    const denunciaId = denunciaIdDe(evidenciaHash, secretPersonal);
    assert(!this.denuncias.has(denunciaId), ASSERTS.reportAlreadyExists);

    this.denuncias.add(denunciaId);
    this.nullifiers.add(nullifier);
  }

  revelarAutoria(denunciaId: Hex32, fiscalPk: Hex32): void {
    const { secretPersonal, evidenciaHash } = this.witnesses();

    assert(denunciaIdDe(evidenciaHash, secretPersonal) === denunciaId, ASSERTS.notTheAuthor);
    assert(this.denuncias.has(denunciaId), ASSERTS.reportNotFound);

    const autoria = autoriaDe(secretPersonal, denunciaId, fiscalPk);
    assert(!this.autorias.has(autoria), ASSERTS.authorshipAlreadyRevealed);

    this.autorias.add(autoria);
  }

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

  private root(): Hex32 | null {
    if (this.nextLeaf === 0n) return null;
    const field = this.credenciales.root()?.value?.[0];
    return field === undefined ? null : bytesToHex(field);
  }
}
