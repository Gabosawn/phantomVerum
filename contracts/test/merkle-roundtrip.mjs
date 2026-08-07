// Los 4 tiempos de la demo (docs/01-arquitectura.md §2), de punta a punta,
// contra el contrato COMPILADO REAL en el simulador local. Sin red, sin
// proof server. Es el mismo camino que va a recorrer app/ en B3.

import {
  pureCircuits, nuevoMundo, b32, hex, check, checkRechaza, resumen, EPOCA,
} from './harness.mjs';

const orgId = b32(0x11);
const ancla = b32(0xaa);
const credSecret = b32(0x22);
const secretPersonal = b32(0x44);
const evidenciaHash = b32(0x33);
const fiscalPk = b32(0x66);
const empleadorPk = b32(0x77);

const credComm = pureCircuits.credCommitmentDe(credSecret);
const hoja = pureCircuits.hojaDe(orgId, credComm);

// El witness real que va a vivir en app/src/witnesses/index.ts (B2.3).
const witnesses = {
  credencialSecret: (c) => [c.privateState, credSecret],
  secretPersonal: (c) => [c.privateState, secretPersonal],
  evidenciaHash: (c) => [c.privateState, evidenciaHash],
  credencialPath: (c) => {
    const camino = c.ledger.credenciales.findPathForLeaf(hoja);
    if (camino === undefined) throw new Error('credencial no emitida para esta org');
    return [c.privateState, camino.path];
  },
};

const m = nuevoMundo(witnesses);

console.log('=== T1. La org se registra y emite una credencial ===');
m.call('registrarOrganizacion', orgId, ancla);
check('organizaciones.size == 1', m.estado().organizaciones.size() === 1n);
console.log(`  credCommitment = ${hex(credComm)}`);
console.log(`  hoja           = ${hex(hoja)}`);
// El emisor manda el COMMITMENT; el contrato construye la hoja en circuito.
m.call('emitirCredencial', orgId, credComm);
check('credenciales.firstFree == 1', m.estado().credenciales.firstFree() === 1n);

const camino = m.estado().credenciales.findPathForLeaf(hoja);
check('findPathForLeaf encuentra la hoja construida en circuito', camino !== undefined);
check('el path tiene 8 hermanos', camino?.path.length === 8, `len=${camino?.path.length}`);
check('findPathForLeaf de una hoja ajena -> undefined',
  m.estado().credenciales.findPathForLeaf(b32(0x99)) === undefined);

console.log('\n=== T2. Denuncia (usa el witness credencialPath) ===');
m.call('denunciar', orgId, EPOCA);
const denunciaId = pureCircuits.denunciaIdDe(evidenciaHash, secretPersonal);
const nullifier = pureCircuits.nullifierDe(credSecret, orgId, EPOCA);
console.log(`  denunciaId = ${hex(denunciaId)}`);
console.log(`  nullifier  = ${hex(nullifier)}`);
check('la denuncia quedo sellada', m.estado().denuncias.member(denunciaId));
check('el nullifier quedo quemado', m.estado().nullifiers.member(nullifier));

console.log('\n=== T3. La evidencia no se puede alterar ni re-denunciar ===');
checkRechaza('re-denuncia en la misma epoca',
  () => m.call('denunciar', orgId, EPOCA), 'ya denunciaste este periodo');

console.log('\n=== T4. Autoria diferida, ligada al fiscal ===');
m.call('revelarAutoria', denunciaId, fiscalPk);
const autoriaHash = pureCircuits.autoriaDe(secretPersonal, denunciaId, fiscalPk);
console.log(`  autoriaHash = ${hex(autoriaHash)}`);
check('la autoria quedo registrada', m.estado().autorias.member(autoriaHash));

checkRechaza('un secret ajeno no puede reclamar la autoria',
  () => m.callComo({ ...witnesses, secretPersonal: (c) => [c.privateState, b32(0x99)] },
    'revelarAutoria', denunciaId, fiscalPk),
  'no sos el autor');

console.log('\n--- El momento del video: misma denuncia, dos verificadores ---');
const hashEmpleador = pureCircuits.autoriaDe(secretPersonal, denunciaId, empleadorPk);
check('FISCAL   -> la autoria verifica', m.estado().autorias.member(autoriaHash));
check('EMPLEADOR -> no verifica', !m.estado().autorias.member(hashEmpleador));

resumen('merkle-roundtrip');
