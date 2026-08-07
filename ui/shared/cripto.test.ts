import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  aHex,
  authorshipOf,
  deHex,
  hashDeArchivo,
  leafOf,
  nullifierOf,
  pad32,
  periodoABytes32,
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
    expect(() => pad32("x".repeat(33))).toThrow(/no entra en Bytes<32>/);
  });

  it("hex ida y vuelta", () => {
    const s = secretNuevo();
    expect(s).toHaveLength(64);
    expect(aHex(deHex(s))).toBe(s);
    expect(aHex(deHex(`0x${s}`))).toBe(s);
  });

  it("deHex rechaza basura", () => {
    expect(() => deHex("no soy hex")).toThrow(/hex inválido/);
    expect(() => deHex("abc")).toThrow(/hex inválido/);
  });

  it("periodoABytes32 produce 32 bytes", () => {
    expect(periodoABytes32("2026-08")).toHaveLength(64);
  });
});

describe("hash de la evidencia", () => {
  it("es el SHA-256 real del archivo — comprobable con sha256sum", async () => {
    expect(await hashDeArchivo(muestra("contrato-obra-4471.pdf"))).toBe(
      "121cfefb8d7d8d3c7b0ef110254a32278ffb655e2fad41aab796b976451dbef7",
    );
  });

  it("un byte distinto cambia el hash entero", async () => {
    const a = await hashDeArchivo(muestra("contrato-obra-4471.pdf"));
    const b = await hashDeArchivo(muestra("contrato-obra-4471-rev-legal.pdf"));
    expect(b).not.toBe(a);
    expect(b).toBe("eee932eaca02c09bb059542dc08456d7dda6466c9064941603e088176474eadd");
  });
});

describe("derivaciones — espejo de los pure circuits", () => {
  it("son deterministas", async () => {
    expect(await reportIdOf("00".repeat(32), SECRET)).toBe(await reportIdOf("00".repeat(32), SECRET));
  });

  it("todas devuelven Bytes<32>", async () => {
    const periodo = periodoABytes32("2026-08");
    for (const h of [
      await leafOf(ORG_ID, CRED),
      await reportIdOf("00".repeat(32), SECRET),
      await nullifierOf(CRED, ORG_ID, periodo),
      await authorshipOf(SECRET, "00".repeat(32), PK_PIA),
    ]) {
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("el orden de los argumentos importa", async () => {
    expect(await reportIdOf(SECRET, CRED)).not.toBe(await reportIdOf(CRED, SECRET));
  });
});

describe("domain separation", () => {
  /**
   * El ataque que esto mata: alguien registra una organización con
   * orgId = denunciaId para forzar que un nullifier y una autoría colisionen.
   * Con el tag de dominio en la posición 0, los cuatro espacios son disjuntos
   * aunque les entren exactamente los mismos argumentos.
   */
  it("nullifier y autoría no colisionan con los mismos tres argumentos", async () => {
    const a = await nullifierOf(SECRET, ORG_ID, PK_PIA);
    const b = await authorshipOf(SECRET, ORG_ID, PK_PIA);
    expect(a).not.toBe(b);
  });

  it("hoja y denuncia tampoco", async () => {
    const a = await leafOf(ORG_ID, SECRET);
    const b = await reportIdOf(ORG_ID, SECRET);
    expect(a).not.toBe(b);
  });
});

describe("designated verifier", () => {
  it("la misma autoría con otra clave da otro hash", async () => {
    const denunciaId = await reportIdOf(
      await hashDeArchivo(muestra("contrato-obra-4471.pdf")),
      SECRET,
    );
    const paraFiscal = await authorshipOf(SECRET, denunciaId, PK_PIA);
    const paraEmpleador = await authorshipOf(SECRET, denunciaId, PK_ACME);
    expect(paraFiscal).not.toBe(paraEmpleador);
  });

  it("un secret ajeno no reproduce el denunciaId del autor", async () => {
    const ev = await hashDeArchivo(muestra("contrato-obra-4471.pdf"));
    expect(await reportIdOf(ev, secretNuevo())).not.toBe(await reportIdOf(ev, SECRET));
  });
});
