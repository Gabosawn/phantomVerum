// Las propiedades load-bearing del diseño Opción A, verificadas ejecutando
// el contrato compilado. Si alguna de estas cae, el diseño no se sostiene.

import {
  pureCircuits, nuevoMundo, b32, check, checkRechaza, resumen, EPOCA, DUR_EPOCA, AHORA,
} from './harness.mjs';

const orgA = b32(0x11);
const orgB = b32(0x88);
const credSecret = b32(0x22);
const sec = b32(0x44);
const ev = b32(0x33);

const credComm = pureCircuits.credCommitmentDe(credSecret);
const hojaA = pureCircuits.hojaDe(orgA, credComm);

// Evidencia mutable: dos denuncias distintas necesitan denunciaId distintos
// (si no, salta el guard de idempotencia "denuncia ya sellada").
const secretos = { ev };

const mkWitnesses = (pathOverride, hojaBuscada = hojaA) => ({
  credencialSecret: (c) => [c.privateState, credSecret],
  secretPersonal: (c) => [c.privateState, sec],
  evidenciaHash: (c) => [c.privateState, secretos.ev],
  credencialPath: (c) => {
    if (pathOverride) return [c.privateState, pathOverride];
    const p = c.ledger.credenciales.findPathForLeaf(hojaBuscada);
    if (p === undefined) throw new Error('credencial no emitida para esta org');
    return [c.privateState, p.path];
  },
});

const m = nuevoMundo(mkWitnesses());
m.call('registrarOrganizacion', orgA, b32(0xaa));
m.call('registrarOrganizacion', orgB, b32(0xbb));
m.call('emitirCredencial', orgA, credComm);

console.log('=== (1) El witness no puede mentir sobre su organizacion ===');
// Empleado real de A, con su path real, declarando orgId = B.
// La hoja se reconstruye en circuito: hojaDe(orgB, comm) != hojaA -> otra raiz.
checkRechaza('empleado de A denunciando como empleado de B',
  () => m.call('denunciar', orgB, EPOCA), 'credencial no pertenece a la organizacion');

console.log('\n=== (2) HistoricMerkleTree: un path viejo sigue siendo valido ===');
const pathViejo = m.estado().credenciales.findPathForLeaf(hojaA).path;
const raizVieja = m.estado().credenciales.root().field;
for (let i = 0; i < 3; i++) {
  m.call('emitirCredencial', orgA, b32(0xc0 + i));
}
const raizNueva = m.estado().credenciales.root().field;
check('la raiz cambio tras 3 inserciones', raizVieja !== raizNueva);
check('firstFree == 4', m.estado().credenciales.firstFree() === 4n);
let ok = true;
try {
  m.callComo(mkWitnesses(pathViejo), 'denunciar', orgA, EPOCA);
} catch (e) {
  ok = false;
  console.log(`    (${String(e.message).split('\n')[0]})`);
}
check('el path emitido ANTES de las inserciones sigue probando membership', ok);

console.log('\n=== (3) Sin credencial emitida no hay denuncia ===');
check('findPathForLeaf de una hoja inexistente -> undefined',
  m.estado().credenciales.findPathForLeaf(b32(0xfe)) === undefined);

console.log('\n=== (4) La epoca la fija el blockTime, no quien llama ===');
const m2 = nuevoMundo(mkWitnesses());
m2.call('registrarOrganizacion', orgA, b32(0xaa));
m2.call('emitirCredencial', orgA, credComm);
checkRechaza('epoca futura', () => m2.call('denunciar', orgA, EPOCA + 1n), 'periodo aun no empezo');
checkRechaza('epoca pasada', () => m2.call('denunciar', orgA, EPOCA - 1n), 'periodo ya vencido');
let okEpoca = true;
try { m2.call('denunciar', orgA, EPOCA); } catch { okEpoca = false; }
check('la epoca en curso si es aceptada', okEpoca);

console.log('\n=== (5) Epocas distintas -> nullifiers no linkeables ===');
const n1 = pureCircuits.nullifierDe(credSecret, orgA, EPOCA);
const n2 = pureCircuits.nullifierDe(credSecret, orgA, EPOCA + 1n);
check('el nullifier cambia de epoca a epoca', Buffer.compare(n1, n2) !== 0);
// Al avanzar el reloj una epoca, la misma credencial puede volver a denunciar
// (con OTRA evidencia: la misma denuncia dos veces la corta el guard).
m2.at(AHORA + Number(DUR_EPOCA));
secretos.ev = b32(0x5a);
let okSiguiente = true;
try { m2.call('denunciar', orgA, EPOCA + 1n); } catch (e) {
  okSiguiente = false;
  console.log(`    (${String(e.message).split('\n')[0]})`);
}
check('la epoca siguiente habilita una nueva denuncia', okSiguiente);

resumen('security-claims');
