// A.6 (bonus) — round-trip completo del arbol de credenciales en el simulador
// local de @midnight-ntwrk/compact-runtime, SIN red y SIN proof server.
// Objetivo: de-riesgar B2.3 probando que el witness `credencialPath` armado
// con `ledger.credenciales.findPathForLeaf(hoja).path` satisface el circuito
// `denunciar`. No toca el repo.

import {
  Contract,
  ledger as leerLedger,
  pureCircuits,
} from './generated/index.js';
import {
  createConstructorContext,
  createCircuitContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';

const b32 = (fill) => Uint8Array.from({ length: 32 }, (_, i) => (fill + i) % 256);
const hex = (u8) => Buffer.from(u8).toString('hex');

const orgId = b32(0x11);
const ancla = b32(0xaa);
const credSecret = b32(0x22);
const secretPersonal = b32(0x44);
const evidenciaHash = b32(0x33);
const periodo = b32(0x55);
const fiscalPk = b32(0x66);

const hoja = pureCircuits.hojaDe(orgId, credSecret);

// --- El witness real que va a vivir en app/src/witnesses/index.ts ---
const witnesses = {
  credencialSecret: (ctx) => [ctx.privateState, credSecret],
  secretPersonal: (ctx) => [ctx.privateState, secretPersonal],
  evidenciaHash: (ctx) => [ctx.privateState, evidenciaHash],
  credencialPath: (ctx) => {
    const camino = ctx.ledger.credenciales.findPathForLeaf(hoja);
    if (camino === undefined) {
      throw new Error('credencial no emitida para esta org');
    }
    return [ctx.privateState, camino.path];
  },
};

const contrato = new Contract(witnesses);
const address = sampleContractAddress();
const coinPublicKey = '0'.repeat(64);

const inicial = contrato.initialState(createConstructorContext({}, coinPublicKey));
let ctx = createCircuitContext(
  address,
  inicial.currentZswapLocalState,
  inicial.currentContractState,
  inicial.currentPrivateState,
);

const estado = () => leerLedger(ctx.currentQueryContext.state);
const llamar = (nombre, ...args) => {
  const r = contrato.impureCircuits[nombre](ctx, ...args);
  ctx = r.context;
  return r;
};

console.log('=== T1. registrarOrganizacion + emitirCredencial ===');
llamar('registrarOrganizacion', orgId, ancla);
console.log(`organizaciones.size          = ${estado().organizaciones.size()}`);
console.log(`hoja (pure circuit hojaDe)   = ${hex(hoja)}`);
llamar('emitirCredencial', orgId, hoja);
console.log(`credenciales.firstFree       = ${estado().credenciales.firstFree()}`);

const camino = estado().credenciales.findPathForLeaf(hoja);
console.log(`findPathForLeaf -> leaf      = ${hex(camino.leaf)}`);
console.log(`findPathForLeaf -> path.len  = ${camino.path.length}`);
console.log(`path[0]                      = ${JSON.stringify(camino.path[0], (_, v) => (typeof v === 'bigint' ? v.toString() : v))}`);
console.log(`findPathForLeaf(hoja ajena)  = ${estado().credenciales.findPathForLeaf(b32(0x99))}`);

console.log('\n=== T2. denunciar (usa el witness credencialPath) ===');
llamar('denunciar', orgId, periodo);
const denunciaId = pureCircuits.denunciaIdDe(evidenciaHash, secretPersonal);
const nullifier = pureCircuits.nullifierDe(credSecret, orgId, periodo);
console.log(`denunciaId                   = ${hex(denunciaId)}`);
console.log(`nullifier                    = ${hex(nullifier)}`);
console.log(`denuncias.member(denunciaId) = ${estado().denuncias.member(denunciaId)}`);
console.log(`nullifiers.member(nullifier) = ${estado().nullifiers.member(nullifier)}`);

console.log('\n=== T2b. re-denuncia en el mismo periodo debe FALLAR ===');
try {
  llamar('denunciar', orgId, periodo);
  console.log('  FAIL: no fallo');
} catch (e) {
  console.log(`  ok: ${String(e.message).split('\n')[0]}`);
}

console.log('\n=== T4. revelarAutoria ===');
llamar('revelarAutoria', denunciaId, fiscalPk);
const autoriaHash = pureCircuits.autoriaDe(secretPersonal, denunciaId, fiscalPk);
console.log(`autoriaHash                  = ${hex(autoriaHash)}`);
console.log(`autorias.member(autoriaHash) = ${estado().autorias.member(autoriaHash)}`);

console.log('\n=== T4b. secret ajeno NO puede revelar autoria ===');
const contratoImpostor = new Contract({
  ...witnesses,
  secretPersonal: (c) => [c.privateState, b32(0x99)],
});
try {
  contratoImpostor.impureCircuits.revelarAutoria(ctx, denunciaId, fiscalPk);
  console.log('  FAIL: no fallo');
} catch (e) {
  console.log(`  ok: ${String(e.message).split('\n')[0]}`);
}

console.log('\n=== T4c. verificacion del fiscal vs. del empleador (off-chain) ===');
const empleadorPk = b32(0x77);
const hashEmpleador = pureCircuits.autoriaDe(secretPersonal, denunciaId, empleadorPk);
console.log(`autoria(fiscal)    en ledger = ${estado().autorias.member(autoriaHash)}`);
console.log(`autoria(empleador) en ledger = ${estado().autorias.member(hashEmpleador)}`);
