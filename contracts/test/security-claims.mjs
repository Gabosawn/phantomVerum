// Verifica las 2 propiedades load-bearing del diseño Opcion A:
//  (1) el witness NO puede mentir sobre a que org pertenece su credencial
//  (2) HistoricMerkleTree: un path emitido sigue valido tras nuevas inserciones
import { Contract, ledger as leerLedger, pureCircuits } from './generated/index.js';
import { createConstructorContext, createCircuitContext, sampleContractAddress } from '@midnight-ntwrk/compact-runtime';

const b32 = (f) => Uint8Array.from({length:32}, (_,i) => (f+i)%256);
const orgA = b32(0x11), orgB = b32(0x88);
const credSecret = b32(0x22), sec = b32(0x44), ev = b32(0x33);
const hojaA = pureCircuits.hojaDe(orgA, credSecret);

const mkWitnesses = (pathOverride) => ({
  credencialSecret: (c) => [c.privateState, credSecret],
  secretPersonal:   (c) => [c.privateState, sec],
  evidenciaHash:    (c) => [c.privateState, ev],
  credencialPath:   (c) => {
    if (pathOverride) return [c.privateState, pathOverride];
    const p = c.ledger.credenciales.findPathForLeaf(hojaA);
    if (p === undefined) throw new Error('credencial no emitida para esta org');
    return [c.privateState, p.path];
  },
});

const contrato = new Contract(mkWitnesses());
const addr = sampleContractAddress();
const ini = contrato.initialState(createConstructorContext({}, '0'.repeat(64)));
let ctx = createCircuitContext(addr, ini.currentZswapLocalState, ini.currentContractState, ini.currentPrivateState);
const st = () => leerLedger(ctx.currentQueryContext.state);
const call = (n, ...a) => { const r = contrato.impureCircuits[n](ctx, ...a); ctx = r.context; return r; };

call('registrarOrganizacion', orgA, b32(0xaa));
call('registrarOrganizacion', orgB, b32(0xbb));
call('emitirCredencial', orgA, hojaA);

console.log('=== (0) denunciar sin credencial emitida ===');
const contratoSinCred = new Contract(mkWitnesses());
try {
  const p = st().credenciales.findPathForLeaf(b32(0xfe));
  console.log(`  findPathForLeaf(hoja inexistente) = ${p}  -> el witness lanza el error legible`);
} catch (e) { console.log('  ', e.message); }

console.log('\n=== (1) empleado de A intenta denunciar COMO empleado de B ===');
// Mismo credSecret y mismo path (el de su hoja en A), pero orgId publico = B.
// La hoja se reconstruye en circuito: hojaDe(orgB, cred) != hojaA -> raiz distinta.
try {
  call('denunciar', orgB, b32(0x55));
  console.log('  FAIL: paso — el witness pudo mentir sobre la org');
} catch (e) { console.log(`  ok: ${String(e.message).split('\n')[0]}`); }

console.log('\n=== (2) HistoricMerkleTree: path viejo sigue valido tras nuevas inserciones ===');
const pathViejo = st().credenciales.findPathForLeaf(hojaA).path;
const raizVieja = st().credenciales.root().field;
for (let i = 0; i < 3; i++) call('emitirCredencial', orgA, b32(0xc0 + i));
const raizNueva = st().credenciales.root().field;
console.log(`  root antes = ${raizVieja}`);
console.log(`  root ahora = ${raizNueva}   (cambio: ${raizVieja !== raizNueva})`);
console.log(`  firstFree  = ${st().credenciales.firstFree()}`);
const contratoPathViejo = new Contract(mkWitnesses(pathViejo));
try {
  const r = contratoPathViejo.impureCircuits.denunciar(ctx, orgA, b32(0x55));
  ctx = r.context;
  console.log('  ok: el path emitido ANTES de las 3 inserciones sigue probando membership');
} catch (e) { console.log(`  FAIL: ${String(e.message).split('\n')[0]}`); }
