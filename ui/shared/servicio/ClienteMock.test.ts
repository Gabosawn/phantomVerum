import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

import { hashDeArchivo, secretNuevo, type Hex32 } from "../cripto";
import {
  CredencialInvalidaError,
  DenunciaRepetidaError,
  NoSosElAutorError,
  NullifierRepetidoError,
  OrganizacionYaRegistradaError,
} from "../tipos";
import { ClienteMock } from "./ClienteMock";

const muestra = (nombre: string) =>
  new Uint8Array(
    readFileSync(fileURLToPath(new URL(`../publico/muestras/${nombre}`, import.meta.url))),
  );

const ORG_ID: Hex32 = "9c41e2b7159e8c80e81a49b4ff962258c96e7b463443bb64a24057aebbcad80a";
const ANCLA: Hex32 = "4d7a1f091f0bd415480ff72966302e5040792986a8fec755fd4615a696fd3ce6";
const SECRET: Hex32 = "6b0de43db76ce5c0cff03c37a0221b65a2a03493b4250c38c6192ceda10c17ae";
const CRED: Hex32 = "4e7038efbd4f620a7bd88aa10e3d0a1fd5ac95b9e1fadedf4737f83bfecba2bc";
const PK_PIA: Hex32 = "7d15c80d067698a0e5e7b1cbfcdb285d3ac658b703df68616c9544fd93209a2f";
const PK_ACME: Hex32 = "3b92af1fe656626d02dff0abcd50b545ce9166f3d6c008dd350133d9753ac410";

/** Sin esperas: los pasos de proving no aportan nada a los tests. */
const nuevoCliente = () => new ClienteMock({ ritmoMs: 0 });

/** T1 completo: org registrada y credencial emitida al denunciante. */
async function conCredencial(cliente: ClienteMock, credencialSecret = CRED) {
  await cliente.registrarOrganizacion({ orgId: ORG_ID, ancla: ANCLA });
  const { hojaIndex } = await cliente.emitirCredencial({ orgId: ORG_ID, credencialSecret });
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
    await expect(c.emitirCredencial({ orgId: ORG_ID })).rejects.toBeInstanceOf(
      CredencialInvalidaError,
    );
  });
});

describe("T2 · denunciar", () => {
  let c: ClienteMock;
  beforeEach(async () => {
    c = nuevoCliente();
    await conCredencial(c);
  });

  it("sella la denuncia y publica exactamente dos hashes", async () => {
    const r = await c.denunciar({
      orgId: ORG_ID,
      periodo: "2026-08",
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
      periodo: "2026-08",
      evidencia: muestra("contrato-obra-4471.pdf"),
    });
    const evidenciaHash = await hashDeArchivo(muestra("contrato-obra-4471.pdf"));
    expect(c.obtenerWitnesses()?.evidenciaHash).toBe(evidenciaHash);
    expect(r.denunciaId).toBe(
      "3ab5b5b6dd9be079019eb9a9bac9e939966bdbc0405c16313cb9aa1d1b6d50f4",
    );
  });

  it("reporta los pasos del proof server en orden", async () => {
    const pasos: string[] = [];
    await c.denunciar(
      { orgId: ORG_ID, periodo: "2026-08", evidencia: muestra("contrato-obra-4471.pdf") },
      (p) => pasos.push(p),
    );
    expect(pasos).toHaveLength(6);
    expect(pasos[0]).toContain("witness");
    expect(pasos.at(-1)).toContain("sin msg.sender");
  });

  it("una credencial ajena falla, y falla ANTES de emitir tx", async () => {
    const ajeno = nuevoCliente();
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
        { orgId: ORG_ID, periodo: "2026-08", evidencia: muestra("contrato-obra-4471.pdf") },
        (p) => pasos.push(p),
      ),
    ).rejects.toBeInstanceOf(CredencialInvalidaError);

    expect(pasos).toEqual([]);
    expect((await ajeno.leerEstadoLedger()).denuncias).toEqual([]);
  });

  it("dos denuncias en el mismo período colisionan en el nullifier", async () => {
    await c.denunciar({
      orgId: ORG_ID,
      periodo: "2026-08",
      evidencia: muestra("contrato-obra-4471.pdf"),
    });
    await expect(
      c.denunciar({
        orgId: ORG_ID,
        periodo: "2026-08",
        evidencia: muestra("contrato-obra-4471-rev-legal.pdf"),
      }),
    ).rejects.toBeInstanceOf(NullifierRepetidoError);
  });

  it("el período siguiente pasa, y los nullifiers no son linkeables", async () => {
    const a = await c.denunciar({
      orgId: ORG_ID,
      periodo: "2026-08",
      evidencia: muestra("contrato-obra-4471.pdf"),
    });
    const b = await c.denunciar({
      orgId: ORG_ID,
      periodo: "2026-09",
      evidencia: muestra("contrato-obra-4471-rev-legal.pdf"),
    });
    expect(b.nullifier).not.toBe(a.nullifier);
    expect((await c.leerEstadoLedger()).nullifiers).toBe(2);
  });

  it("re-enviar la denuncia idéntica falla por el guard de idempotencia", async () => {
    await c.denunciar({
      orgId: ORG_ID,
      periodo: "2026-08",
      evidencia: muestra("contrato-obra-4471.pdf"),
    });
    // Mismo archivo, mismo secret ⇒ mismo denunciaId. Otro período para que el
    // que salte sea el guard de la denuncia y no el del nullifier.
    await expect(
      c.denunciar({
        orgId: ORG_ID,
        periodo: "2026-09",
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
      periodo: "2026-08",
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
      version: 1 as const,
      denunciaId,
      evidenciaHash: w.evidenciaHash!,
      secret: w.secretPersonal,
      fiscalPk: PK_PIA,
      autoriaHash,
    };

    const comoFiscal = await c.verificarAutoria(material);
    expect(comoFiscal).toEqual({ ok: true, enLedger: true });

    // Mismo material, misma cadena, otra clave.
    const comoEmpleador = await c.verificarAutoria({ ...material, fiscalPk: PK_ACME });
    expect(comoEmpleador.ok).toBe(false);
  });
});
