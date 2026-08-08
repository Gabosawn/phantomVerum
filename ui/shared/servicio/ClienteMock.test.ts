import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

import {
  credCommitmentOf,
  EPOCH_DURATION_SECONDS,
  hashDeArchivo,
  secretNuevo,
  type Hex32,
} from "../cripto";
import { ANCLA, ORG_ID } from "../demo";
import {
  CredencialInvalidaError,
  DenunciaRepetidaError,
  NoSosElAutorError,
  NullifierRepetidoError,
  OrganizacionYaRegistradaError,
  OrganizationNotRegisteredError,
  PeriodNotStartedError,
  PeriodOverError,
} from "../tipos";
import { ClienteMock } from "./ClienteMock";

const muestra = (nombre: string) =>
  new Uint8Array(
    readFileSync(fileURLToPath(new URL(`../publico/muestras/${nombre}`, import.meta.url))),
  );

const SECRET: Hex32 = "6b0de43db76ce5c0cff03c37a0221b65a2a03493b4250c38c6192ceda10c17ae";
const CRED: Hex32 = "4e7038efbd4f620a7bd88aa10e3d0a1fd5ac95b9e1fadedf4737f83bfecba2bc";
const PK_PIA: Hex32 = "7d15c80d067698a0e5e7b1cbfcdb285d3ac658b703df68616c9544fd93209a2f";
const PK_ACME: Hex32 = "3b92af1fe656626d02dff0abcd50b545ce9166f3d6c008dd350133d9753ac410";

/** The epoch every test pins the chain clock to (2026-08-07 UTC). */
const EPOCH = 20672;

/**
 * A mockable chain clock, parked mid-epoch so both C0 bounds are one epoch
 * away. `advanceOneEpoch()` is what the "next period" tests turn.
 */
function clockAtEpoch(epoch = EPOCH) {
  return {
    unixSeconds: epoch * EPOCH_DURATION_SECONDS + 3600,
    advanceOneEpoch() {
      this.unixSeconds += EPOCH_DURATION_SECONDS;
    },
  };
}

/** Sin esperas: los pasos de proving no aportan nada a los tests. */
const nuevoCliente = (clock = clockAtEpoch()) =>
  new ClienteMock({ ritmoMs: 0, now: () => clock.unixSeconds });

/** T1 completo: org registrada y credencial emitida al denunciante. */
async function conCredencial(cliente: ClienteMock, credencialSecret = CRED) {
  await cliente.registrarOrganizacion({ orgId: ORG_ID, ancla: ANCLA });
  // Employee side: the commitment is derived HERE and is the only thing the
  // issuer ever receives — the mock never sees `credencialSecret`.
  const { hojaIndex } = await cliente.emitirCredencial({
    orgId: ORG_ID,
    credCommitment: credCommitmentOf(credencialSecret),
  });
  cliente.establecerWitnesses({
    secretPersonal: SECRET,
    credencialSecret,
    orgId: ORG_ID,
    hojaIndex,
  });
}

describe("T1 · registrar organización y emitir credenciales", () => {
  it("registra y deja el ancla en el ledger", async () => {
    const c = nuevoCliente();
    const tx = await c.registrarOrganizacion({ orgId: ORG_ID, ancla: ANCLA });
    expect(tx.txId).toMatch(/^[0-9a-f]{64}$/);
    expect((await c.leerEstadoLedger()).organizaciones).toBe(1);
  });

  it("re-registrar el mismo orgId falla — es el assert del circuito", async () => {
    const c = nuevoCliente();
    await c.registrarOrganizacion({ orgId: ORG_ID, ancla: ANCLA });
    await expect(c.registrarOrganizacion({ orgId: ORG_ID, ancla: ANCLA })).rejects.toBeInstanceOf(
      OrganizacionYaRegistradaError,
    );
  });

  it("no se puede emitir credencial de una org que no existe", async () => {
    const c = nuevoCliente();
    const issue = c.emitirCredencial({
      orgId: ORG_ID,
      credCommitment: credCommitmentOf(CRED),
    });
    await expect(issue).rejects.toBeInstanceOf(OrganizationNotRegisteredError);
    await expect(issue).rejects.toThrow("organization not registered");
  });

  it("the issuer only ever sees the commitment — credSecret never reaches it", async () => {
    const c = nuevoCliente();
    await c.registrarOrganizacion({ orgId: ORG_ID, ancla: ANCLA });

    // What crosses the boundary to the issuer is the COMMITMENT, and it is
    // not the secret under any encoding the ledger stores.
    const credCommitment = credCommitmentOf(CRED);
    expect(credCommitment).not.toBe(CRED);

    await c.emitirCredencial({ orgId: ORG_ID, credCommitment });

    // Nothing in the org-side public state (the whole mock ledger) contains
    // the raw secret: only the commitment-derived leaf was stored.
    expect(JSON.stringify(c.instantanea())).not.toContain(CRED);
  });
});

describe("T2 · denunciar", () => {
  let c: ClienteMock;
  let clock: ReturnType<typeof clockAtEpoch>;
  beforeEach(async () => {
    clock = clockAtEpoch();
    c = nuevoCliente(clock);
    await conCredencial(c);
  });

  it("sella la denuncia y publica exactamente dos hashes", async () => {
    const r = await c.denunciar({
      orgId: ORG_ID,
      periodo: EPOCH,
      evidencia: muestra("contrato-obra-4471.pdf"),
    });

    expect(r.denunciaId).toMatch(/^[0-9a-f]{64}$/);
    expect(r.nullifier).toMatch(/^[0-9a-f]{64}$/);

    const ledger = await c.leerEstadoLedger();
    expect(ledger.denuncias).toEqual([r.denunciaId]);
    expect(ledger.nullifiers).toBe(1);
    expect(ledger.autorias).toEqual([]);
  });

  it("el denunciaId se deriva de la evidencia real, no de su nombre", async () => {
    const r = await c.denunciar({
      orgId: ORG_ID,
      periodo: EPOCH,
      evidencia: muestra("contrato-obra-4471.pdf"),
    });
    const evidenciaHash = await hashDeArchivo(muestra("contrato-obra-4471.pdf"));
    expect(c.obtenerWitnesses()?.evidenciaHash).toBe(evidenciaHash);
    expect(r.denunciaId).toBe(
      "56e4da144e489f73cfc304cc58b10be3511fc93e936f5c6561f1700a6c57336b",
    );
  });

  it("reporta los pasos del proof server en orden", async () => {
    const pasos: string[] = [];
    await c.denunciar(
      { orgId: ORG_ID, periodo: EPOCH, evidencia: muestra("contrato-obra-4471.pdf") },
      (p) => pasos.push(p),
    );
    expect(pasos).toHaveLength(7);
    expect(pasos[0]).toContain("witness");
    expect(pasos.at(-1)).toContain("sin msg.sender");
  });

  it("una credencial ajena falla, y falla ANTES de emitir tx", async () => {
    const ajeno = nuevoCliente(clock);
    await ajeno.registrarOrganizacion({ orgId: ORG_ID, ancla: ANCLA });
    ajeno.establecerWitnesses({
      secretPersonal: SECRET,
      credencialSecret: secretNuevo(),
      orgId: ORG_ID,
      hojaIndex: 0,
    });

    const pasos: string[] = [];
    await expect(
      ajeno.denunciar(
        { orgId: ORG_ID, periodo: EPOCH, evidencia: muestra("contrato-obra-4471.pdf") },
        (p) => pasos.push(p),
      ),
    ).rejects.toBeInstanceOf(CredencialInvalidaError);

    expect(pasos).toEqual([]);
    expect((await ajeno.leerEstadoLedger()).denuncias).toEqual([]);
  });

  // ── C0: the period is bound to the chain clock, never a free label ──────

  it("a past epoch is rejected: 'period already over', before any tx", async () => {
    const pasos: string[] = [];
    await expect(
      c.denunciar(
        { orgId: ORG_ID, periodo: EPOCH - 1, evidencia: muestra("contrato-obra-4471.pdf") },
        (p) => pasos.push(p),
      ),
    ).rejects.toThrow("period already over");
    expect(pasos).toEqual([]);
    expect((await c.leerEstadoLedger()).denuncias).toEqual([]);
  });

  it("a future epoch is rejected: 'period not started yet'", async () => {
    await expect(
      c.denunciar({
        orgId: ORG_ID,
        periodo: EPOCH + 1,
        evidencia: muestra("contrato-obra-4471.pdf"),
      }),
    ).rejects.toBeInstanceOf(PeriodNotStartedError);
  });

  it("C0 error classes carry the contract's verbatim assert strings", () => {
    expect(new PeriodNotStartedError().message).toBe("period not started yet");
    expect(new PeriodOverError().message).toBe("period already over");
  });

  it("dos denuncias en el mismo período colisionan en el nullifier", async () => {
    await c.denunciar({
      orgId: ORG_ID,
      periodo: EPOCH,
      evidencia: muestra("contrato-obra-4471.pdf"),
    });
    // Same credential, same epoch: the nullifier already exists — with the
    // contract's verbatim assert string.
    const again = c.denunciar({
      orgId: ORG_ID,
      periodo: EPOCH,
      evidencia: muestra("contrato-obra-4471-rev-legal.pdf"),
    });
    await expect(again).rejects.toBeInstanceOf(NullifierRepetidoError);
    await expect(again).rejects.toThrow("already reported this period");
  });

  it("el período siguiente pasa, y los nullifiers no son linkeables", async () => {
    const a = await c.denunciar({
      orgId: ORG_ID,
      periodo: EPOCH,
      evidencia: muestra("contrato-obra-4471.pdf"),
    });
    // Advancing the chain clock one epoch makes EPOCH + 1 the current one:
    // the same credential may report again.
    clock.advanceOneEpoch();
    const b = await c.denunciar({
      orgId: ORG_ID,
      periodo: EPOCH + 1,
      evidencia: muestra("contrato-obra-4471-rev-legal.pdf"),
    });
    expect(b.nullifier).not.toBe(a.nullifier);
    expect((await c.leerEstadoLedger()).nullifiers).toBe(2);
  });

  it("re-enviar la denuncia idéntica falla por el guard de idempotencia", async () => {
    await c.denunciar({
      orgId: ORG_ID,
      periodo: EPOCH,
      evidencia: muestra("contrato-obra-4471.pdf"),
    });
    // Mismo archivo, mismo secret ⇒ mismo denunciaId. Otro período para que el
    // que salte sea el guard de la denuncia y no el del nullifier.
    clock.advanceOneEpoch();
    await expect(
      c.denunciar({
        orgId: ORG_ID,
        periodo: EPOCH + 1,
        evidencia: muestra("contrato-obra-4471.pdf"),
      }),
    ).rejects.toBeInstanceOf(DenunciaRepetidaError);
  });
});

describe("T4 · revelar y verificar autoría", () => {
  let c: ClienteMock;
  let denunciaId: Hex32;

  beforeEach(async () => {
    c = nuevoCliente();
    await conCredencial(c);
    ({ denunciaId } = await c.denunciar({
      orgId: ORG_ID,
      periodo: EPOCH,
      evidencia: muestra("contrato-obra-4471.pdf"),
    }));
  });

  it("el autor real revela y queda en ledger.autorias", async () => {
    const { autoriaHash } = await c.revelarAutoria({ denunciaId, fiscalPk: PK_PIA });
    expect((await c.leerEstadoLedger()).autorias).toEqual([autoriaHash]);
  });

  it("el mismo autor ante otro fiscal produce otro hash", async () => {
    const pia = await c.revelarAutoria({ denunciaId, fiscalPk: PK_PIA });
    const acme = await c.revelarAutoria({ denunciaId, fiscalPk: PK_ACME });
    expect(acme.autoriaHash).not.toBe(pia.autoriaHash);
  });

  it("con un secret ajeno no se puede revelar", async () => {
    c.establecerWitnesses({
      ...c.obtenerWitnesses()!,
      secretPersonal: secretNuevo(),
    });
    await expect(c.revelarAutoria({ denunciaId, fiscalPk: PK_PIA })).rejects.toBeInstanceOf(
      NoSosElAutorError,
    );
  });

  it("no se puede revelar autoría de una denuncia inexistente", async () => {
    await expect(
      c.revelarAutoria({ denunciaId: `ff${"00".repeat(31)}`, fiscalPk: PK_PIA }),
    ).rejects.toBeInstanceOf(NoSosElAutorError);
  });

  /** El remate del video, como aserción. */
  it("verifica con la clave designada y NO con la del empleador", async () => {
    const w = c.obtenerWitnesses()!;
    const { autoriaHash } = await c.revelarAutoria({ denunciaId, fiscalPk: PK_PIA });

    const material = {
      version: 2 as const,
      denunciaId,
      evidenciaHash: w.evidenciaHash!,
      fiscalPk: PK_PIA,
      autoriaHash,
      proof: autoriaHash, // mock: proof == autoriaHash
    };

    const comoFiscal = await c.verificarAutoria(material);
    expect(comoFiscal).toEqual({ ok: true, enLedger: true });

    // Mismo material, misma cadena, otra clave — proof != autoriaHash esperado.
    const otroHash = "ee" + "00".repeat(31) as Hex32;
    const comoEmpleador = await c.verificarAutoria({
      ...material,
      fiscalPk: PK_ACME,
      proof: otroHash,
    });
    expect(comoEmpleador.ok).toBe(false);
  });
});
