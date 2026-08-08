/**
 * El Explorer leyendo la cadena REAL, sin red.
 *
 * El fixture es el estado serializado que el indexer de Preview devolvió para
 * el contrato deployado, capturado una vez. Se deserializa con el MISMO módulo
 * generado por el compilador que usa `app/src/api/ledger.ts`, así que si el
 * ledger del contrato cambia de forma, esto rompe acá y no en la demo.
 *
 * Lo que este archivo existe para clavar es una distinción que la
 * implementación anterior no hacía. `verificarAutoria` preguntaba «¿aparecen
 * estos 32 bytes en algún lugar del blob del estado?» — un `includes()` sobre
 * el hex — y lo presentaba como «¿es miembro de ledger.autorias?». No son la
 * misma pregunta: el `denunciaId` de una denuncia sellada está en el blob y
 * NO es una autoría. Con la implementación vieja, un material cuyo recibo
 * recomputado cayera en cualquier otro campo del estado verificaba en verde.
 */
import { ContractState } from "@midnight-ntwrk/compact-runtime";
import { describe, expect, it } from "vitest";

import { ledger as leerLedger } from "@contracts/contract/index.js";

import { aHex, deHex, type Hex32 } from "../shared/cripto";

import fixture from "./estadoPreview.fixture.json";

const leer = () => {
  const estado = ContractState.deserialize(deHex(fixture.state as Hex32));
  return leerLedger(estado.data);
};

const todos = (set: { [Symbol.iterator](): Iterator<Uint8Array> }): Hex32[] => {
  const out: Hex32[] = [];
  const it = set[Symbol.iterator]();
  for (let r = it.next(); r.done !== true; r = it.next()) out.push(aHex(r.value));
  return out;
};

describe("el estado real de Preview se deserializa con el contrato compilado", () => {
  it("devuelve los conjuntos tipados del ledger, no un blob", () => {
    const l = leer();
    expect(Number(l.organizations.size())).toBeGreaterThan(0);
    expect(todos(l.reports).length).toBeGreaterThan(0);
    expect(todos(l.authorships).length).toBeGreaterThan(0);
  });

  it("cada denuncia es un hex de 32 bytes", () => {
    for (const d of todos(leer().reports)) expect(d).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("«está en el blob» no es «es miembro de autorias»", () => {
  it("un denunciaId sellado aparece en el estado crudo pero NO es una autoría", () => {
    const l = leer();
    const denunciaId = todos(l.reports)[0] as Hex32;

    // La pregunta que hacía la implementación vieja: substring sobre el hex.
    expect(fixture.state.toLowerCase()).toContain(denunciaId);

    // La pregunta que el veredicto dice estar contestando.
    expect(l.authorships.member(deHex(denunciaId))).toBe(false);
  });

  it("una autoría real sí es miembro", () => {
    const l = leer();
    const autoria = todos(l.authorships)[0] as Hex32;
    expect(l.authorships.member(deHex(autoria))).toBe(true);
  });

  it("un valor que no está en ningún lado no es miembro", () => {
    const l = leer();
    const inventado = ("de".repeat(32)) as Hex32;
    expect(fixture.state.toLowerCase()).not.toContain(inventado);
    expect(l.authorships.member(deHex(inventado))).toBe(false);
  });
});
