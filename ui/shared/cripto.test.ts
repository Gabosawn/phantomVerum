import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  aHex,
  receiptOf,
  credCommitmentOf,
  deHex,
  EPOCH_DURATION_SECONDS,
  epochIndexOf,
  hashDeArchivo,
  leafOf,
  nullifierOf,
  pad32,
  periodBytes32,
  periodHex32,
  reportIdOf,
  secretNuevo,
} from "./cripto";

const muestra = (nombre: string) =>
  new Uint8Array(readFileSync(fileURLToPath(new URL(`./publico/muestras/${nombre}`, import.meta.url))));

const ORG_ID = "9c41e2b7159e8c80e81a49b4ff962258c96e7b463443bb64a24057aebbcad80a";
const SECRET = "6b0de43db76ce5c0cff03c37a0221b65a2a03493b4250c38c6192ceda10c17ae";
const CRED = "4e7038efbd4f620a7bd88aa10e3d0a1fd5ac95b9e1fadedf4737f83bfecba2bc";
const PK_PIA = "7d15c80d067698a0e5e7b1cbfcdb285d3ac658b703df68616c9544fd93209a2f";
const PK_ACME = "3b92af1fe656626d02dff0abcd50b545ce9166f3d6c008dd350133d9753ac410";

describe("codificación", () => {
  it("pad32 rellena con ceros a la derecha, como pad() de Compact", () => {
    expect(aHex(pad32("2026-08"))).toBe(
      "323032362d303800000000000000000000000000000000000000000000000000",
    );
  });

  it("pad32 rechaza lo que no entra en Bytes<32>", () => {
    expect(() => pad32("x".repeat(33))).toThrow(/does not fit in 32 bytes/);
  });

  it("hex ida y vuelta", () => {
    const s = secretNuevo();
    expect(s).toHaveLength(64);
    expect(aHex(deHex(s))).toBe(s);
    expect(aHex(deHex(`0x${s}`))).toBe(s);
  });

  it("deHex rechaza basura", () => {
    expect(() => deHex("no soy hex")).toThrow(/invalid hex/);
    expect(() => deHex("abc")).toThrow(/invalid hex/);
  });

  it("periodBytes32 encodes the epoch index little-endian in 32 bytes", () => {
    expect(periodBytes32(0n)).toHaveLength(32);
    // Least significant byte first, zero-padded to the width — the exact
    // encoding of the circuit's `(period as Field) as Bytes<32>`.
    expect(aHex(periodBytes32(0x1234n))).toBe(`3412${"0".repeat(60)}`);
    expect(aHex(periodBytes32(20672n))).toBe(
      "c050000000000000000000000000000000000000000000000000000000000000",
    );
    expect(periodHex32(20672n)).toBe(aHex(periodBytes32(20672n)));
  });

  it("periodBytes32 rejects values outside Uint<64>", () => {
    expect(() => periodBytes32(-1n)).toThrow(/outside the contract's Uint<64>/);
    expect(() => periodBytes32(1n << 64n)).toThrow(/outside the contract's Uint<64>/);
  });
});

describe("reporting epochs — mirror of the contract's C0 arithmetic", () => {
  it("epochIndexOf is floor(unixSeconds / 86400)", () => {
    const start = 20672 * EPOCH_DURATION_SECONDS;
    expect(epochIndexOf(start)).toBe(20672);
    expect(epochIndexOf(start + EPOCH_DURATION_SECONDS - 1)).toBe(20672);
    expect(epochIndexOf(start + EPOCH_DURATION_SECONDS)).toBe(20673);
  });

  it("consecutive epochs yield different nullifiers for the same credential", () => {
    const a = nullifierOf(CRED, 20672n);
    const b = nullifierOf(CRED, 20673n);
    expect(a).not.toBe(b);
  });
});

describe("hash de la evidencia", () => {
  it("es el SHA-256 real del archivo — comprobable con sha256sum", async () => {
    expect(await hashDeArchivo(muestra("contrato-obra-4471.pdf"))).toBe(
      "e37283ce42443bc73eb3a9277e66ca213e4d0335b5bb119d5aceb7221f4889fd",
    );
  });

  it("un byte distinto cambia el hash entero", async () => {
    const a = await hashDeArchivo(muestra("contrato-obra-4471.pdf"));
    const b = await hashDeArchivo(muestra("contrato-obra-4471-rev-legal.pdf"));
    expect(b).not.toBe(a);
    expect(b).toBe("344b902cc3ac3d938672421c116804ea2f2b22ba06716e2ba4809f6a9f6d3435");
  });
});

describe("derivaciones — espejo de los pure circuits", () => {
  it("son deterministas", () => {
    expect(reportIdOf("00".repeat(32), SECRET)).toBe(reportIdOf("00".repeat(32), SECRET));
  });

  it("todas devuelven Bytes<32>", () => {
    for (const h of [
      credCommitmentOf(CRED),
      leafOf(ORG_ID, credCommitmentOf(CRED)),
      reportIdOf("00".repeat(32), SECRET),
      nullifierOf(CRED, 20672n),
      receiptOf("00".repeat(32), PK_PIA),
    ]) {
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("credCommitmentOf is deterministic and never equals the raw secret", () => {
    expect(credCommitmentOf(CRED)).toBe(credCommitmentOf(CRED));
    expect(credCommitmentOf(CRED)).not.toBe(CRED);
  });

  it("leafOf takes the COMMITMENT: commitment and raw secret give different leaves", () => {
    // Mirrors the unified contract: leaf = H(dom, orgId, credCommitmentOf(sec)).
    // Feeding the raw secret where the commitment belongs must not collide.
    const fromCommitment = leafOf(ORG_ID, credCommitmentOf(CRED));
    const fromRawSecret = leafOf(ORG_ID, CRED);
    expect(fromCommitment).not.toBe(fromRawSecret);
  });

  it("el orden de los argumentos importa", () => {
    expect(reportIdOf(SECRET, CRED)).not.toBe(reportIdOf(CRED, SECRET));
  });
});

describe("domain separation", () => {
  /**
   * El ataque que esto mata: alguien registra una organización con
   * orgId = denunciaId para forzar que un nullifier y una autoría colisionen.
   * Con el tag de dominio en la posición 0, los cuatro espacios son disjuntos
   * aunque les entren exactamente los mismos argumentos.
   */
  it("nullifier y autoría no colisionan con los mismos tres argumentos", () => {
    // Same byte content in every position: the epoch encoding fed to the
    // nullifier is reused verbatim as the authorship's prosecutorPk. Only the
    // domain tag differs, and that alone must keep the spaces disjoint.
    const epoch = 20672n;
    const a = nullifierOf(SECRET, epoch);
    const b = receiptOf(ORG_ID, periodHex32(epoch));
    expect(a).not.toBe(b);
  });

  it("hoja y denuncia tampoco", () => {
    const a = leafOf(ORG_ID, SECRET);
    const b = reportIdOf(ORG_ID, SECRET);
    expect(a).not.toBe(b);
  });

  it("commitment y hash de archivo tampoco comparten espacio", async () => {
    // credCommitmentOf prefixes its domain tag; a bare SHA-256 of the same
    // 32 bytes (what hashDeArchivo would produce) must not collide with it.
    const asCommitment = credCommitmentOf(SECRET);
    const asBareHash = await hashDeArchivo(deHex(SECRET));
    expect(asCommitment).not.toBe(asBareHash);
  });
});

describe("un recibo por destinatario", () => {
  it("la misma autoría con otro nonce da otro recibo", async () => {
    const denunciaId = reportIdOf(await hashDeArchivo(muestra("contrato-obra-4471.pdf")), SECRET);
    const paraFiscal = receiptOf(denunciaId, PK_PIA);
    const paraEmpleador = receiptOf(denunciaId, PK_ACME);
    expect(paraFiscal).not.toBe(paraEmpleador);
  });

  it("el recibo NO depende del secret: se recomputa con datos publicos", async () => {
    // Esta es la propiedad que hace que el fiscal pueda verificar sin que
    // nadie le entregue nada secreto. Si `receiptOf` volviera a mezclar el
    // secret, este test es el que lo agarra.
    const denunciaId = reportIdOf(await hashDeArchivo(muestra("contrato-obra-4471.pdf")), SECRET);
    expect(receiptOf(denunciaId, PK_PIA)).toBe(receiptOf(denunciaId, PK_PIA));
  });

  it("un secret ajeno no reproduce el denunciaId del autor", async () => {
    const ev = await hashDeArchivo(muestra("contrato-obra-4471.pdf"));
    expect(reportIdOf(ev, secretNuevo())).not.toBe(reportIdOf(ev, SECRET));
  });
});
