/**
 * Guarda del camino de demo — el único lugar del repo que mira las dos apps.
 *
 * El Explorer tiene horneados unos hashes públicos que simulan lo que el
 * indexer ya conoce. Si alguien regenera los PDFs de muestra o toca el secret
 * de demo, esos hashes dejan de corresponder y la verificación del video se
 * pone roja sin que nadie se entere hasta el sábado a las 12:30.
 *
 * Este test recomputa desde las fuentes reales lo que el fixture afirma. Si
 * falla, la demo está rota: regenerá el fixture, no borres el test.
 *
 * Vive fuera de `cliente/` y `explorer/` a propósito: es el ÚNICO archivo
 * autorizado a importar de los dos lados, y no entra en ningún bundle.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { authorshipOf, hashDeArchivo, nullifierOf, reportIdOf } from "../shared/cripto";
import { DEMO_EPOCH, ORG_ID, PK_ACME_LEGAL, VERIFICADORES } from "../shared/demo";
import { EMPLEADO_DEMO, SECRET_PERSONAL_DEMO } from "../cliente/src/demoPrivado";
import { AUTORIA_DEMO_PIA, DENUNCIA_DEMO, NULLIFIER_DEMO } from "../explorer/src/ledgerFixture";

const muestra = (nombre: string) =>
  new Uint8Array(
    readFileSync(fileURLToPath(new URL(`../shared/publico/muestras/${nombre}`, import.meta.url))),
  );

const pkPia = VERIFICADORES[0].pk;

/** Se recomputan desde el PDF: el Explorer NO los tiene, y no debe tenerlos. */
const evOriginal = () => hashDeArchivo(muestra("contrato-obra-4471.pdf"));
const evAlterada = () => hashDeArchivo(muestra("contrato-obra-4471-rev-legal.pdf"));

describe("el fixture del Explorer corresponde a las muestras reales", () => {
  it("las dos muestras hashean distinto", async () => {
    expect(await evAlterada()).not.toBe(await evOriginal());
  });

  it("DENUNCIA_DEMO se deriva de esa evidencia y del secret de demo", async () => {
    expect(await reportIdOf(await evOriginal(), SECRET_PERSONAL_DEMO)).toBe(DENUNCIA_DEMO);
  });

  it("NULLIFIER_DEMO usa el secret de la CREDENCIAL, como el circuito", async () => {
    // The period is the demo's EPOCH INDEX — floor(unixSeconds / 86400) —
    // exactly what the contract's C0 pins to the block time.
    expect(await nullifierOf(EMPLEADO_DEMO.credencialSecret, ORG_ID, DEMO_EPOCH)).toBe(
      NULLIFIER_DEMO,
    );
  });

  it("AUTORIA_DEMO_PIA está designada a la clave de la Fiscalía", async () => {
    expect(await authorshipOf(SECRET_PERSONAL_DEMO, DENUNCIA_DEMO, pkPia)).toBe(AUTORIA_DEMO_PIA);
  });
});

describe("los dos veredictos del video", () => {
  it("T3 — el PDF alterado no reproduce la denuncia sellada", async () => {
    expect(await reportIdOf(await evAlterada(), SECRET_PERSONAL_DEMO)).not.toBe(DENUNCIA_DEMO);
  });

  it("T4 — con la clave del empleador el hash no es el que está en la cadena", async () => {
    const conClaveDelEmpleador = await authorshipOf(
      SECRET_PERSONAL_DEMO,
      DENUNCIA_DEMO,
      PK_ACME_LEGAL,
    );
    expect(conClaveDelEmpleador).not.toBe(AUTORIA_DEMO_PIA);
  });
});
