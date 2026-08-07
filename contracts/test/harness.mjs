// Harness compartido: corre el contrato COMPILADO REAL en el simulador local
// de @midnight-ntwrk/compact-runtime — sin red, sin proof server, sin mocks.
// Requiere haber corrido `npm run compile` (o `compile:fast`) antes.

import { Contract, ledger as leerLedger, pureCircuits } from '../output/contract/index.js';
import {
  createConstructorContext,
  createCircuitContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';

export { Contract, leerLedger, pureCircuits };

// Tiene que coincidir con `duracionEpoca()` del contrato (segundos).
export const DUR_EPOCA = 86400n;

// Instante fijo para que los tests sean determinísticos.
// 2026-08-07T00:00:00Z en segundos Unix.
export const AHORA = 1786147200;
export const EPOCA = BigInt(AHORA) / DUR_EPOCA;

export const b32 = (fill) => Uint8Array.from({ length: 32 }, (_, i) => (fill + i) % 256);
export const hex = (u8) => Buffer.from(u8).toString('hex');

/**
 * Crea un "mundo": contrato + estado, con `call(nombre, ...args)` que avanza
 * el estado. `at(segundos)` permite mover el reloj para probar épocas.
 */
export function nuevoMundo(witnesses, { ahora = AHORA } = {}) {
  const contrato = new Contract(witnesses);
  const address = sampleContractAddress();
  const inicial = contrato.initialState(createConstructorContext({}, '0'.repeat(64)));

  let estadoContrato = inicial.currentContractState;
  let zswap = inicial.currentZswapLocalState;
  let priv = inicial.currentPrivateState;
  let reloj = ahora;

  const ctx = () =>
    createCircuitContext(address, zswap, estadoContrato, priv, undefined, undefined, reloj);

  const absorber = (r) => {
    estadoContrato = r.context.currentQueryContext.state;
    zswap = r.context.currentZswapLocalState;
    priv = r.context.currentPrivateState;
    return r;
  };

  return {
    address,
    at: (segundos) => { reloj = segundos; },
    ahora: () => reloj,
    ctx,
    estado: () => leerLedger(estadoContrato),
    call: (nombre, ...args) => absorber(contrato.impureCircuits[nombre](ctx(), ...args)),
    // Llama con OTRO juego de witnesses sobre el MISMO estado (impostores).
    callComo: (otrosWitnesses, nombre, ...args) =>
      absorber(new Contract(otrosWitnesses).impureCircuits[nombre](ctx(), ...args)),
  };
}

// ---- mini framework de asserts ----
let fallos = 0;
let corridos = 0;

export const check = (nombre, cond, detalle = '') => {
  corridos++;
  if (cond) console.log(`  ok    ${nombre}${detalle ? ` (${detalle})` : ''}`);
  else { fallos++; console.log(`  FAIL  ${nombre}${detalle ? ` (${detalle})` : ''}`); }
};

/** Espera que `fn` lance, y que el mensaje contenga `fragmento`. */
export const checkRechaza = (nombre, fn, fragmento) => {
  corridos++;
  try {
    fn();
    fallos++;
    console.log(`  FAIL  ${nombre} -> NO fallo (se esperaba "${fragmento}")`);
  } catch (e) {
    const msg = String(e.message).split('\n')[0];
    if (fragmento && !msg.includes(fragmento)) {
      fallos++;
      console.log(`  FAIL  ${nombre} -> fallo con "${msg}", se esperaba "${fragmento}"`);
    } else {
      console.log(`  ok    ${nombre} -> rechazado: ${msg}`);
    }
  }
};

export const resumen = (titulo) => {
  console.log(`\n=== ${titulo}: ${corridos - fallos}/${corridos} ${fallos === 0 ? 'OK' : `— ${fallos} FALLOS`} ===`);
  process.exit(fallos === 0 ? 0 : 1);
};
