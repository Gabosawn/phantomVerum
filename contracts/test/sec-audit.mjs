// Regresión adversarial. Cada bloque es un ataque que en algún momento
// FUNCIONÓ contra este contrato; ahora el test falla si vuelve a funcionar.
// Origen: review de seguridad del 2026-08-07 (hallazgos HIGH-1 y MEDIUM-1).

import {
  Contract, pureCircuits, nuevoMundo, b32, hex, check, checkRechaza, resumen,
  EPOCA, DUR_EPOCA, AHORA,
} from './harness.mjs';

const orgA = b32(0x11);
const orgB = b32(0xb0); // NUNCA se registra
const ancla = b32(0xaa);
const cred = b32(0x22);
const sec = b32(0x44);

const secretos = { ev: b32(0x33) };
const credComm = pureCircuits.credCommitmentDe(cred);
let hojaBuscada = pureCircuits.hojaDe(orgA, credComm);

const witnesses = {
  credencialSecret: (c) => [c.privateState, cred],
  secretPersonal: (c) => [c.privateState, sec],
  evidenciaHash: (c) => [c.privateState, secretos.ev],
  credencialPath: (c) => {
    const p = c.ledger.credenciales.findPathForLeaf(hojaBuscada);
    if (!p) throw new Error('sin credencial');
    return [c.privateState, p.path];
  },
};

const m = nuevoMundo(witnesses);
m.call('registrarOrganizacion', orgA, ancla);
m.call('emitirCredencial', orgA, credComm);
m.call('denunciar', orgA, EPOCA);

console.log('=== A. Que expone el transcript publico de denunciar ===');
// No es un ataque: es la superficie de disclosure que declaramos en el README.
// Se deja como documentación ejecutable de lo que un observador ve.
const r = m.call('revelarAutoria', pureCircuits.denunciaIdDe(secretos.ev, sec), b32(0x66));
const dump = JSON.stringify(r.proofData, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
check('el transcript existe y es inspeccionable', dump.length > 0, `${dump.length} chars`);
console.log('  Publico por diseño: orgId, epoca, denunciaId, nullifier, autoriaHash, raiz de Merkle.');
console.log('  NUNCA sale: credencialSecret, secretPersonal, el archivo de evidencia.');

console.log('\n=== B. [HIGH-1] El periodo NO puede elegirlo quien llama ===');
// Antes: `periodo` era un Bytes<32> libre -> la misma credencial generaba N
// nullifiers variando la etiqueta, y el anti-spam del spec §4.2 no servia.
// Ahora el circuito lo ata al blockTime.
let aceptadas = 0;
for (const delta of [1n, 2n, 3n]) {
  secretos.ev = b32(0x33 + Number(delta)); // evidencia distinta -> otro denunciaId
  try { m.call('denunciar', orgA, EPOCA + delta); aceptadas++; } catch { /* esperado */ }
}
check('ninguna denuncia extra entra cambiando el periodo', aceptadas === 0, `${aceptadas}/3 aceptadas`);
check('nullifiers.size sigue en 1', m.estado().nullifiers.size() === 1n,
  `size=${m.estado().nullifiers.size()}`);

console.log('\n=== C. [MEDIUM-1] emitirCredencial liga el orgId a la hoja ===');
// Antes: `emitirCredencial(orgId, hoja)` recibia la hoja ya calculada, asi que
// el assert de organizacion registrada era decorativo: se pasaba un orgId
// registrado y se colaba la hoja de una org fantasma.
check('orgB nunca se registro', !m.estado().organizaciones.member(orgB));
const hojaFantasma = pureCircuits.hojaDe(orgB, credComm);
m.call('emitirCredencial', orgA, credComm); // el atacante solo controla el commitment
check('el arbol NO contiene una hoja para la org fantasma',
  m.estado().credenciales.findPathForLeaf(hojaFantasma) === undefined);
checkRechaza('emitirCredencial contra una org no registrada',
  () => m.call('emitirCredencial', orgB, credComm), 'organizacion no registrada');
hojaBuscada = hojaFantasma;
secretos.ev = b32(0x70);
checkRechaza('denunciar en nombre de la org fantasma',
  () => m.call('denunciar', orgB, EPOCA), 'sin credencial');
hojaBuscada = pureCircuits.hojaDe(orgA, credComm);

console.log('\n=== D. [DECLARADO] Quien tiene el export de llave actua como el autor ===');
// El export §3.2 contiene {secret, evidenciaHash}: el fiscal aprende el secret.
// Es una limitacion DECLARADA del MVP (roadmap: prueba ZK al fiscal). Este
// bloque documenta la consecuencia exacta para que nadie se sorprenda.
secretos.ev = b32(0x33); // volver a la evidencia de la denuncia original
const denunciaId = pureCircuits.denunciaIdDe(b32(0x33), sec);
const fiscal2 = b32(0x99);
const conElExport = {
  credencialSecret: (c) => [c.privateState, b32(0)],
  credencialPath: (c) => [c.privateState, []],
  secretPersonal: (c) => [c.privateState, sec],
  evidenciaHash: (c) => [c.privateState, b32(0x33)],
};
let republico = true;
try { m.callComo(conElExport, 'revelarAutoria', denunciaId, b32(0x88)); } catch { republico = false; }
check('CONOCIDO: con el export se puede republicar la autoria a otra pk', republico);
m.callComo(conElExport, 'revelarAutoria', denunciaId, fiscal2);
checkRechaza('CONOCIDO: y quemar el slot (denuncia, fiscal2) del autor real',
  () => m.call('revelarAutoria', denunciaId, fiscal2), 'autoria ya revelada a este fiscal');
console.log('  -> Mitigacion actual: el export se entrega a UN fiscal, fuera de banda.');
console.log('  -> Roadmap: prueba ZK al fiscal en vez de entregarle el secret.');

console.log('\n=== E. La raiz de Merkle cambia con cada insercion ===');
// Un observador puede usar la raiz revelada como contador de sincronizacion.
// Por eso el witness debe usar SIEMPRE el path del estado mas reciente.
const raices = [];
for (let i = 0; i < 4; i++) {
  m.call('emitirCredencial', orgA, b32(0xc0 + i));
  raices.push(m.estado().credenciales.root().field.toString());
}
check('4 inserciones -> 4 raices distintas', new Set(raices).size === 4);
const hist = [...{ [Symbol.iterator]: () => m.estado().credenciales.history() }];
check('el historico conserva las raices pasadas', hist.length > 1, `history=${hist.length}`);
console.log('  -> Guia para app/src/witnesses: NUNCA cachear el path; recalcularlo');
console.log('     con findPathForLeaf sobre el estado mas reciente antes de cada denuncia.');

resumen('sec-audit');
