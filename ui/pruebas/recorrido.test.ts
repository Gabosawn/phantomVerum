/**
 * The guided walkthrough, pinned by tests.
 *
 * That no step can be skipped is a promise the interface makes: if someone adds
 * a route or loosens a condition tomorrow, this has to go red before a judge
 * discovers by hand that the app lets you into a screen whose main button
 * cannot work.
 */

import { describe, expect, it } from "vitest";

import { candados, pasoActual, type EstadoRecorrido } from "../cliente/src/recorrido";

/** Clean start: nobody has done anything yet. */
const cero: EstadoRecorrido = {
  hojasEmitidas: 0,
  hayDenuncias: false,
  tieneLlave: false,
  llaveGuardada: false,
  faseDenuncia: "idle",
  faseRevelar: "idle",
};

const con = (cambios: Partial<EstadoRecorrido>): EstadoRecorrido => ({ ...cero, ...cambios });

/** The states the story moves through, in order. */
const emitido = con({ hojasEmitidas: 6 });
const denunciado = con({
  hojasEmitidas: 6,
  hayDenuncias: true,
  tieneLlave: true,
  faseDenuncia: "listo",
});
const conLlave = { ...denunciado, llaveGuardada: true };
const revelado: EstadoRecorrido = { ...conLlave, faseRevelar: "listo" };

describe("el paso actual se deriva del estado, no se declara", () => {
  it("sin credenciales emitidas, la historia está en el paso 1", () => {
    expect(pasoActual(cero)).toBe(1);
  });

  it("con credenciales pero sin denuncia, en el paso 2", () => {
    expect(pasoActual(emitido)).toBe(2);
  });

  it("denunciada pero sin bajar la llave, en el paso 3", () => {
    expect(pasoActual(denunciado)).toBe(3);
  });

  it("con la llave guardada, en el paso 4", () => {
    expect(pasoActual(conLlave)).toBe(4);
  });

  it("revelada la autoría, en el paso 5 — que se hace en el Explorer", () => {
    expect(pasoActual(revelado)).toBe(5);
  });

  it("nunca se saltea: la secuencia real avanza de a un paso", () => {
    const avance = [cero, emitido, denunciado, conLlave, revelado].map(pasoActual);
    expect(avance).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("no se puede entrar a un paso sin haber hecho el anterior", () => {
  it("el paso 1 nunca está cerrado: es la puerta de entrada", () => {
    for (const estado of [cero, emitido, denunciado, conLlave, revelado]) {
      expect(candados(estado).emitir).toBeNull();
    }
  });

  it("denunciar está cerrado hasta que la empresa emite credenciales", () => {
    expect(candados(cero).denunciar).toContain("paso 1");
    expect(candados(emitido).denunciar).toBeNull();
  });

  it("revelar autoría está cerrado hasta que hay una denuncia sellada", () => {
    expect(candados(cero).revelar).toContain("paso 2");
    expect(candados(emitido).revelar).toContain("paso 2");
    expect(candados(denunciado).revelar).toBeNull();
  });

  it("cada candado explica por qué, nunca es sólo un booleano", () => {
    const cerrados = Object.values(candados(cero)).filter((r): r is string => r !== null);
    expect(cerrados).toHaveLength(2);
    for (const razon of cerrados) expect(razon.length).toBeGreaterThan(20);
  });
});

describe("el caso del relato: volver meses después, sin nada en memoria", () => {
   /**
   * The tab was reloaded: the local ledger survives, the key does not (it is in
   * the .key file the reporter saved). If this were locked, step 4 would be
   * unreachable and the product would lose its one distinctive feature.
   */
  const mesesDespues = con({ hojasEmitidas: 6, hayDenuncias: true });

  it("revelar autoría sigue abierto para poder cargar el .key", () => {
    expect(candados(mesesDespues).revelar).toBeNull();
  });

  it("y la barra lo ubica en el paso 2, que es donde hay que volver a entrar", () => {
    expect(pasoActual(mesesDespues)).toBe(2);
  });
});
