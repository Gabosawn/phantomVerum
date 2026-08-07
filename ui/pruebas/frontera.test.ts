/**
 * La frontera entre las dos aplicaciones, como test.
 *
 * Todo el producto se apoya en una afirmación: el Explorer no tiene acceso a
 * nada privado. Eso es fácil de decir en un README y fácil de romper con un
 * import de conveniencia a las tres de la mañana. Acá se verifica sobre el
 * código real.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { SECRET_PERSONAL_DEMO } from "../cliente/src/demoPrivado";

const dir = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

function archivosDe(raiz: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(raiz)) {
    const ruta = `${raiz}/${entrada}`;
    if (statSync(ruta).isDirectory()) salida.push(...archivosDe(ruta));
    else if (/\.tsx?$/.test(entrada) && !entrada.endsWith(".test.ts")) salida.push(ruta);
  }
  return salida;
}

const fuentesExplorer = archivosDe(dir("../explorer")).map((ruta) => ({
  ruta: ruta.slice(ruta.indexOf("/explorer/")),
  texto: readFileSync(ruta, "utf8"),
}));

/** Sólo las líneas de import: los comentarios pueden nombrar lo que quieran. */
const importsDe = (texto: string) =>
  texto.split("\n").filter((l) => /^\s*(import|export)\s.*\sfrom\s/.test(l));

describe("el Explorer no puede tocar nada privado", () => {
  it("hay fuentes que revisar", () => {
    expect(fuentesExplorer.length).toBeGreaterThan(3);
  });

  it("ningún archivo importa de cliente/", () => {
    for (const { ruta, texto } of fuentesExplorer) {
      for (const linea of importsDe(texto)) {
        expect(linea, `${ruta} importa del Cliente`).not.toMatch(/cliente\//);
      }
    }
  });

  it("ningún archivo importa el módulo de secrets de la demo", () => {
    for (const { ruta, texto } of fuentesExplorer) {
      for (const linea of importsDe(texto)) {
        expect(linea, `${ruta} importa demoPrivado`).not.toMatch(/demoPrivado/);
      }
    }
  });

  it("ningún secret está hardcodeado en el código del Explorer", () => {
    for (const { ruta, texto } of fuentesExplorer) {
      expect(texto, `${ruta} contiene el secret de demo`).not.toContain(SECRET_PERSONAL_DEMO);
    }
  });

  /**
   * El Explorer sí usa `ClienteMock` — es su lectura simulada del indexer —
   * pero nunca puede establecer witnesses: no tiene ninguno.
   */
  it("el Explorer nunca establece witnesses", () => {
    for (const { ruta, texto } of fuentesExplorer) {
      expect(texto, `${ruta} establece witnesses`).not.toContain("establecerWitnesses");
    }
  });
});

describe("el Cliente sí es el que guarda lo privado", () => {
  const fuentesCliente = archivosDe(dir("../cliente")).map((r) => readFileSync(r, "utf8")).join("");

  it("el Cliente es quien provee los witnesses", () => {
    expect(fuentesCliente).toContain("establecerWitnesses");
  });

  it("el Cliente nunca hace fetch de nada que no sea una muestra local", () => {
    const fetches = fuentesCliente.match(/fetch\((.*?)\)/g) ?? [];
    for (const f of fetches) {
      expect(f, "el Cliente hace un fetch que no es a una ruta local").not.toMatch(/https?:/);
    }
  });
});
